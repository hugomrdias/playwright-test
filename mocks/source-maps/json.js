function make() {
  return new Error('json')
}

process.stdout.write(`${JSON.stringify({ stack: make().stack })}\n`)
process.exit(0)
