const exitCase = process.env.PW_TEST_EXIT_CASE

switch (exitCase) {
  case 'set-no-arg':
    process.exitCode = 1
    process.exit()
    break
  case 'set-undefined':
    process.exitCode = 1
    process.exit(undefined)
    break
  case 'set-zero':
    process.exitCode = 1
    process.exit(0)
    break
  case 'unset-no-arg':
    process.exit()
    break
  default:
    process.stderr.write(`Unknown exit case: ${exitCase}\n`)
    process.exit(1)
}
