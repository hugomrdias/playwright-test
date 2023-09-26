class PwTestController {
  constructor() {
    this.beforeEnded = false
    this.ended = false
    this.failed = false
    this.env = {}
    this.endCalled = false
  }

  beforeEnd() {
    this.beforeEnded = true
  }

  end(failed = this.failed) {
    if (this.endCalled) {
      return
    }
    this.ended = true
    this.failed = failed
    this.endCalled = true
  }

  fail() {
    this.failed = true
  }
}

globalThis.PW_TEST = new PwTestController()
