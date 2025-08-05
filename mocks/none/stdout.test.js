export const test = () => {
  process.stdout.write('hello ')
  process.stdout.write('world!\n')

  process.exit(0)
}

test()
