// Preloaded with --import. Deleting a browser profile takes longer than the
// exit waits, like when Windows keeps its files locked after the browser exits.
import fs from 'node:fs'

const DELAY = 1500
const isProfile = (dir) => String(dir).includes('dev_profile-')

const rm = fs.promises.rm
fs.promises.rm = async (dir, options) => {
  if (isProfile(dir)) {
    await new Promise((resolve) => setTimeout(resolve, DELAY))
  }
  return rm(dir, options)
}

const rmSync = fs.rmSync
fs.rmSync = (dir, options) => {
  if (isProfile(dir)) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, DELAY)
  }
  return rmSync(dir, options)
}
