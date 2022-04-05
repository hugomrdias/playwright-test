/* eslint-disable strict */

class PwTestController {
  constructor() {
    this.beforeEnded = false
    this.ended = false
    this.failed = false
    this.env = {}
  }

  beforeEnd() {
    this.beforeEnded = true
  }

  end(failed = this.failed) {
    this.ended = true
    this.failed = failed
  }

  fail() {
    this.failed = true
  }
}

self.PW_TEST = new PwTestController()
