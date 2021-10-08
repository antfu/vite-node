import { builtinModules, createRequire } from 'module'
import { URL } from 'url'
import { join, dirname, resolve } from 'pathe'
import { createServer } from 'vite'
import createDebug from 'debug'

const argv = process.argv.slice(2)

const files = []
const options = {}

argv.forEach((arg) => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=')
    options[key] = value
  }
  else if (arg.startsWith('-')) {
    Array.from(arg.slice(1)).forEach(flag => options[flag] = true)
  }
  else {
    files.push(resolve(arg))
  }
})

if (!files.length) {
  console.error('no files specified')
  console.error('usage: vite-node [options] [files]')
  process.exit(1)
}

const debugRequest = createDebug('vite-node:request')
const debugTransform = createDebug('vite-node:transform')
const AsyncFunction = Object.getPrototypeOf(async() => {}).constructor

const base = process.cwd()
const server = await createServer()
await server.pluginContainer.buildStart({})

async function request(path) {
  debugRequest(path)

  if (builtinModules.includes(path))
    return import(path)

  const absolute = path.startsWith('/@fs/')
    ? path.slice(4)
    : join(base, path.slice(1))

  if (path.includes('/node_modules/'))
    return import(absolute)

  const result = await server.transformRequest(path, { ssr: true })
  if (!result)
    throw new Error(`failed to load ${path}`)

  debugTransform(path, result.code)

  const url = new URL(absolute, 'file://')

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

  await fn(...Object.values(context))
  return exports
}

const cache = {}

function cachedRequest(path) {
  if (!cache[path])
    cache[path] = request(path)
  return cache[path]
}

for (const file of files)
  await request(`/@fs${file}`)

await server.close()
process.exit(0)
