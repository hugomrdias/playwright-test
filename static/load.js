// Loads the bundle in the page or a worker. A failed `import()` is the one way to
// tell an error that stops the tests from loading, which nothing would ever end,
// from an uncaught error while they run, which is up to the test runner.
const url = new URL(import.meta.url)

import(new URL(url.searchParams.get('entry'), url).href).catch((error) => {
  // Reaches the runner like any other uncaught exception, which prints it
  reportError(error)

  if (globalThis.PW_TEST) {
    globalThis.PW_TEST.end(true)
  } else {
    postMessage({ pwRunEnded: true, pwRunFailed: true })
  }
})
