import { builtinModules, createRequire } from 'module'
import { pathToFileURL } from 'url'
import { dirname, resolve, relative } from 'path'
import { createServer } from 'vite'
import createDebug from 'debug'
import minimist from 'minimist'
import { red, dim, yellow } from 'kolorist'

const argv = minimist(process.argv.slice(2), {
  alias: {
    r: 'root',
    c: 'config',
    h: 'help',
  },
  string: ['root', 'config'],
  boolean: ['help', 'vue'],
  unknown(name) {
    if (name[0] === '-') {
      console.error(red(`Unknown argument: ${name}`))
      help()
      process.exit(1)
    }
  },
})
const files = argv._

if (argv.help) {
  help()
  process.exit(0)
}

if (!argv._.length) {
  console.error(red('No files specified.'))
  help()
  process.exit(1)
}

const debugRequest = createDebug('vite-node:request')
const debugTransform = createDebug('vite-node:transform')
const AsyncFunction = Object.getPrototypeOf(async() => {}).constructor

const root = argv.root || process.cwd()
process.chdir(root)

const server = await createServer({
  configFile: argv.config,
  root,
  resolve: argv.vue
    ? {
      alias: {
        // fix for Vue does not support mjs yet
        'vue/server-renderer': 'vue/server-renderer',
        'vue/compiler-sfc': 'vue/compiler-sfc',
        '@vue/reactivity': '@vue/reactivity/dist/reactivity.cjs.js',
        '@vue/shared': '@vue/shared/dist/shared.cjs.js',
        'vue-router': 'vue-router/dist/vue-router.cjs.js',
        'vue': 'vue/dist/vue.cjs.js',
      },
    }
    : {},
})
await server.pluginContainer.buildStart({})
await execute(files, server, argv)
await server.close()

// --- CLI END ---

function normalizeId(id) {
  // Virtual modules start with `\0`
  if (id && id.startsWith('/@id/__x00__'))
    id = `\0${id.slice('/@id/__x00__'.length)}`
  if (id && id.startsWith('/@id/'))
    id = id.slice('/@id/'.length)
  return id
}

function toFilePath(id) {
  const absolute = id.startsWith('/@fs/')
    ? id.slice(4)
    : slash(resolve(server.config.root, id.slice(1)))

  return absolute
}

async function execute(files, server) {
  const __pendingModules__ = new Map()

  async function directRequest(rawId, callstack) {
    if (builtinModules.includes(rawId))
      return import(rawId)

    callstack = [...callstack, rawId]
    const request = async(dep) => {
      if (callstack.includes(dep)) {
        throw new Error(`${red('Circular dependency detected')}\nStack:\n${[...callstack, dep].reverse().map((i) => {
          const path = relative(server.config.root, toFilePath(normalizeId(i)))
          return dim(' -> ') + (i === dep ? yellow(path) : path)
        }).join('\n')}\n`)
      }
      return cachedRequest(dep, callstack)
    }

    const id = normalizeId(rawId)
    const absolute = toFilePath(id)

    debugRequest(absolute)

    // for windows
    const unifiedPath = absolute[0] !== '/'
      ? `/${absolute}`
      : absolute

    if (absolute.includes('/node_modules/'))
      return import(unifiedPath)

    const result = await server.transformRequest(id, { ssr: true })
    if (!result)
      throw new Error(`failed to load ${id}`)

    debugTransform(id, result.code)

    const url = pathToFileURL(unifiedPath)
    const exports = {}

    const context = {
      require: createRequire(url),
      __filename: absolute,
      __dirname: dirname(absolute),
      __vite_ssr_import__: request,
      __vite_ssr_dynamic_import__: request,
      __vite_ssr_exports__: exports,
      __vite_ssr_exportAll__: obj => exportAll(exports, obj),
      __vite_ssr_import_meta__: { url },
    }

    const fn = new AsyncFunction(
      ...Object.keys(context),
      result.code,
    )

    // prefetch deps
    result.deps.forEach(dep => request(dep))

    await fn(...Object.values(context))
    return exports
  }

  function cachedRequest(id, callstack) {
    if (!__pendingModules__[id])
      __pendingModules__[id] = directRequest(id, callstack)
    return __pendingModules__[id]
  }

  function exportAll(exports, sourceModule) {
    // eslint-disable-next-line no-restricted-syntax
    for (const key in sourceModule) {
      if (key !== 'default') {
        try {
          Object.defineProperty(exports, key, {
            enumerable: true,
            configurable: true,
            get() { return sourceModule[key] },
          })
        }
        catch (_err) { }
      }
    }
  }

  const result = []
  for (const file of files)
    result.push(await cachedRequest(`/@fs/${slash(resolve(file))}`, []))
  return result
}

function slash(path) {
  return path.replace(/\\/g, '/')
}

function help() {
  // eslint-disable-next-line no-console
  console.log(`
Usage:
  $ vite-node [options] [files]

Options:
  -r, --root <path>      ${dim('[string]')} use specified root directory
  -c, --config <file>    ${dim('[string]')} use specified config file
  --vue                 ${dim('[boolean]')} support for importing Vue component
`)
}
