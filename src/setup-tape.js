// @ts-nocheck

import { onFailure, onFinish } from 'tape'

self.TAPE_RUN_FAIL = false

onFailure(() => {
  self.TAPE_RUN_FAIL = true
})

onFinish(() => {
  // eslint-disable-next-line no-undef
  if (process.env.PW_TEST.mode === 'worker') {
    postMessage({
      pwRunEnded: true,
      pwRunFailed: self.TAPE_RUN_FAIL,
    })
  } else {
    self.PW_TEST.end(self.TAPE_RUN_FAIL)
  }
})
