export const test = () => {
  process.stdout.write('hello ')
  process.stderr.write('world!')

  process.exit(0)
}

test()
