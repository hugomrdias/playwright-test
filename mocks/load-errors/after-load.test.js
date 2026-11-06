// The tests loaded fine, this is an uncaught error like any other
setTimeout(() => {
  throw new Error('after-load-boom')
}, 10)

setTimeout(() => {
  process.exit(0)
}, 500)
