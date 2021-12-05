/* eslint-disable no-console */
import { builtinModules, createRequire } from 'module'
import { pathToFileURL } from 'url'
import { dirname, resolve, relative } from 'path'
import vm from 'vm'
import { createServer, mergeConfig } from 'vite'
import createDebug from 'debug'
import { red, dim, yellow, green, inverse, cyan } from 'kolorist'

const debugRequest = createDebug('vite-node:request')
const debugTransform = createDebug('vite-node:transform')

let executing = false

export async function run(argv) {
  process.exitCode = 0
  executing = true
  let err

  function log(...args) {
    if (argv.silent)
      return
    console.log(...args)
  }

  const root = argv.root || process.cwd()
  process.chdir(root)

  const files = argv.files || argv._

  const shouldExternalize = argv.shouldExternalize || (id => id.includes('/node_modules/'))

  const server = await createServer(mergeConfig(argv.defaultConfig || {}, {
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
  }))
  await server.pluginContainer.buildStart({})

  process.__vite_node__ = {
    server,
  }

  async function run() {
    try {
      await execute(files, server, shouldExternalize)
    }
    catch (e) {
      console.error(e)
      err = e
      if (!argv.watch)
        process.exit(1)
    }
    finally {
      executing = false
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
  else {
    await run()
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

function normalizeId(id) {
  // Virtual modules start with `\0`
  if (id && id.startsWith('/@id/__x00__'))
    id = `\0${id.slice('/@id/__x00__'.length)}`
  if (id && id.startsWith('/@id/'))
    id = id.slice('/@id/'.length)
  return id
}

function toFilePath(id, server) {
  let absolute = id.startsWith('/@fs/')
    ? id.slice(4)
    : id.startsWith(dirname(server.config.root))
      ? id
      : id.startsWith('/')
        ? slash(resolve(server.config.root, id.slice(1)))
        : id

  if (absolute.startsWith('//'))
    absolute = absolute.slice(1)
  // if (!absolute.startsWith('/'))
  //   absolute = `/${absolute}`

  return absolute
}

async function execute(files, server, shouldExternalize) {
  const __pendingModules__ = new Map()

  const result = []
  for (const file of files)
    result.push(await cachedRequest(`/@fs/${slash(resolve(file))}`, []))
  return result

  async function directRequest(id, fsPath, callstack) {
    callstack = [...callstack, id]
    const request = async(dep) => {
      if (callstack.includes(dep)) {
        throw new Error(`${red('Circular dependency detected')}\nStack:\n${[...callstack, dep].reverse().map((i) => {
          const path = relative(server.config.root, toFilePath(normalizeId(i), server))
          return dim(' -> ') + (i === dep ? yellow(path) : path)
        }).join('\n')}\n`)
      }
      return cachedRequest(dep, callstack)
    }

    debugRequest(fsPath)

    const result = await server.transformRequest(id, { ssr: true })
    if (!result)
      throw new Error(`failed to load ${id}`)

    debugTransform(id, result.code)

    const url = pathToFileURL(fsPath)
    const exports = {}

    const context = {
      require: createRequire(url),
      __filename: fsPath,
      __dirname: dirname(fsPath),
      __vite_ssr_import__: request,
      __vite_ssr_dynamic_import__: request,
      __vite_ssr_exports__: exports,
      __vite_ssr_exportAll__: obj => exportAll(exports, obj),
      __vite_ssr_import_meta__: { url },
    }

    const fn = vm.runInThisContext(`async (${Object.keys(context).join(',')}) => { ${result.code} }`, {
      filename: fsPath,
      lineOffset: 0,
    })
    await fn(...Object.values(context))

    return exports
  }

  async function cachedRequest(rawId, callstack) {
    if (builtinModules.includes(rawId))
      return import(rawId)

    const id = normalizeId(rawId)
    const fsPath = toFilePath(id, server)

    if (shouldExternalize(fsPath))
      return import(fsPath)

    if (__pendingModules__.has(fsPath))
      return __pendingModules__.get(fsPath)
    __pendingModules__.set(fsPath, directRequest(id, fsPath, callstack))
    return await __pendingModules__.get(fsPath)
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
