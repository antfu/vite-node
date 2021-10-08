import { builtinModules, createRequire } from 'module'
import { pathToFileURL } from 'url'
import { join, dirname, resolve } from 'path'
import { createServer } from 'vite'
import createDebug from 'debug'
import minimist from 'minimist'
import { red, dim } from 'kolorist'

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
process.exit(process.exitCode || 0)

// --- CLI END ---

async function execute(files, server) {
  const cache = {}

  async function request(id) {
    // Virtual modules start with `\0`
    if (id && id.startsWith('/@id/__x00__'))
      id = `\0${id.slice('/@id/__x00__'.length)}`
    if (id && id.startsWith('/@id/'))
      id = id.slice('/@id/'.length)

    if (builtinModules.includes(id))
      return import(id)

    const absolute = id.startsWith('/@fs/')
      ? id.slice(3)
      : slash(join(server.config.root, id.slice(1)))

    debugRequest(absolute)

    // for windows
    const unifiedPath = absolute[0] !== '/'
      ? `/${absolute}`
      : absolute

    if (id.includes('/node_modules/'))
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
      __vite_ssr_import__: cachedRequest,
      __vite_ssr_dynamic_import__: cachedRequest,
      __vite_ssr_exports__: exports,
      __vite_ssr_exportAll__: obj => Object.assign(exports, obj),
      __vite_ssr_import_meta__: { url },
    }

    const fn = new AsyncFunction(
      ...Object.keys(context),
      result.code,
    )

    // prefetch deps
    result.deps.forEach(dep => cachedRequest(dep))

    await fn(...Object.values(context))
    return exports
  }

  function cachedRequest(path) {
    if (!cache[path])
      cache[path] = request(path)
    return cache[path]
  }

  const result = []
  for (const file of files)
    result.push(await request(`/@fs/${slash(resolve(file))}`))
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
