import { strict as assert } from 'node:assert'

enum Kind {
  Boom = 'boom',
}

class Thrower {
  constructor(private readonly kind: Kind) {}

  run(): never {
    throw new Error(this.kind)
  }
}

try {
  new Thrower(Kind.Boom).run()
  assert.fail('should throw')
} catch (error) {
  process.stdout.write(`${(error as Error).stack}\n`)
}
process.exit(0)
