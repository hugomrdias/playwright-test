function make() {
  return new Error('bytes')
}

const encoder = new TextEncoder()
process.stdout.write(encoder.encode(`stdout ${make().stack}\n`))
process.stderr.write(encoder.encode(`stderr ${make().stack}\n`))
process.exit(0)
