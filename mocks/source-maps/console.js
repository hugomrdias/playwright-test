/** biome-ignore-all lint/suspicious/noConsole: the output is what's tested */
function make() {
  return new Error('logged')
}

const error = make()
console.log(error)
console.log(error.stack)
console.log('in a string', error.stack)
console.log({ nested: error, stack: error.stack, list: [error.stack] })
console.error(error)
process.exit(0)
