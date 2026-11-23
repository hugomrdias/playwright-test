class PwTestController {
  constructor() {
    this.ended = false
    this.failed = false
    this.env = {}
    this.endCalled = false
  }

  end(failed = this.failed) {
    if (this.endCalled) {
      return
    }
    this.ended = true
    this.failed = failed
    this.endCalled = true
    globalThis.PW_TEST_NOTIFY?.(Boolean(failed))
  }

  fail() {
    this.failed = true
  }
}

globalThis.PW_TEST = new PwTestController()
