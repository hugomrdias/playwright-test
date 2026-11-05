function thrower() {
  throw new Error('uncaught boom')
}

setTimeout(thrower, 10)
setTimeout(() => process.exit(0), 300)
