class PwTestController {
  constructor() {
    this.beforeEnded = false
    this.ended = false
    this.failed = false
    this.env = {}
    this.endCalled = false
  }

  beforeEnd() {
    if (this.beforeEnded) {
      return
    }
    this.beforeEnded = true
    globalThis.PW_TEST_NOTIFY?.('beforeEnd')
  }

  end(failed = this.failed) {
    if (this.endCalled) {
      return
    }
    this.ended = true
    this.failed = failed
    this.endCalled = true
    globalThis.PW_TEST_NOTIFY?.('end', Boolean(failed))
  }

  fail() {
    this.failed = true
  }
}

globalThis.PW_TEST = new PwTestController()
