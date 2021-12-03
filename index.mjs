/* eslint-disable no-console */
import { builtinModules, createRequire } from 'module'
import { pathToFileURL } from 'url'
import { dirname, resolve, relative } from 'path'
import vm from 'vm'
import { createServer } from 'vite'
import createDebug from 'debug'
import minimist from 'minimist'
import { red, dim, yellow, green, inverse, cyan } from 'kolorist'

const CALLSTACK_KEY = '__viteNodeCallstack'

const argv = minimist(process.argv.slice(2), {
  alias: {
    r: 'root',
    c: 'config',
    h: 'help',
    w: 'watch',
    s: 'silent',
  },
  string: ['root', 'config'],
  boolean: ['help', 'vue', 'watch', 'silent'],
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

const root = argv.root || process.cwd()
process.chdir(root)

const server = await createServer({
  logLevel: 'error',
  clearScreen: false,
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
let executing = false

async function run() {
  process.exitCode = 0
  executing = true
  let err
  try {
    await execute(files, server, argv)
  }
  catch (e) {
    if (CALLSTACK_KEY in e) {
      console.error(red('Error on executing:'))
      console.error(red(`${e[CALLSTACK_KEY].map(i => ` - ${relative(root, i.path)}`).join('\n')} \n`))
    }
    console.error(e)
    err = e
    if (!argv.watch)
      process.exit(1)
  }
  finally {
    executing = false
  }

  if (argv.watch) {
    setTimeout(() => {
      if (err || process.exitCode)
        log(inverse(red(' vite node ')), red('program exited with error, waiting for file changes...'))
      else
        log(inverse(green(' vite node ')), green('program exited, waiting for file changes...'))
    }, 10)
  }
  else {
    await server.close()
  }
}

if (argv.watch) {
  log(inverse(cyan(' vite node ')), cyan('watch mode enabled\n'))

  server.watcher.on('change', (file) => {
    if (!executing) {
      log(inverse(yellow(' vite node ')), yellow(`${file} changed, restarting...\n`))
      run()
    }
  })
}

await run(files, server, argv)

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

  const result = []
  for (const file of files)
    result.push(await cachedRequest(`/@fs/${slash(resolve(file))}`, []))
  return result

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

    try {
      const fn = vm.runInThisContext(`async (${Object.keys(context).join(',')}) => { ${result.code} }`, {
        absolute,
        lineOffset: 0,
      })
      await fn(...Object.values(context))
    }
    catch (e) {
      try {
        if (!e[CALLSTACK_KEY])
          Object.defineProperty(e, CALLSTACK_KEY, { value: [], enumerable: false })
        e[CALLSTACK_KEY].push({ path: absolute, error: e })
      }
      catch {}

      throw e
    }

    return exports
  }

  async function cachedRequest(id, callstack) {
    if (__pendingModules__[id])
      return __pendingModules__[id]
    __pendingModules__[id] = directRequest(id, callstack)
    return await __pendingModules__[id]
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
}

function slash(path) {
  return path.replace(/\\/g, '/')
}

function help() {
  console.log(`
Usage:
  $ vite-node [options] [files]

Options:
  -r, --root <path>      ${dim('[string]')} use specified root directory
  -c, --config <file>    ${dim('[string]')} use specified config file
  -w, --watch           ${dim('[boolean]')} restart on file changes, similar to "nodemon"
  -s, --silent          ${dim('[boolean]')} do not emit errors and logs
  --vue                 ${dim('[boolean]')} support for importing Vue component
`)
}

function log(...args) {
  if (argv.silent)
    return
  console.log(...args)
}
