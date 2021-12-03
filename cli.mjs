/* eslint-disable no-console */
import minimist from 'minimist'
import { red, dim } from 'kolorist'
import { startAndRun } from './index.mjs'

const argv = minimist(process.argv.slice(2), {
  'alias': {
    r: 'root',
    c: 'config',
    h: 'help',
    w: 'watch',
    s: 'silent',
  },
  '--': true,
  'string': ['root', 'config'],
  'boolean': ['help', 'vue', 'watch', 'silent'],
  unknown(name) {
    if (name[0] === '-') {
      console.error(red(`Unknown argument: ${name}`))
      help()
      process.exit(1)
    }
  },
})

if (argv.help) {
  help()
  process.exit(0)
}

if (!argv._.length) {
  console.error(red('No files specified.'))
  help()
  process.exit(1)
}

// forward argv
process.argv = [process.argv.slice(0, 2), ...argv['--']]

startAndRun(argv)

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
