/**
 * What test files print, a file at a time in the order of the files. The first
 * file that isn't done prints as it goes, the ones after it wait for it, like
 * the output of `node --test`.
 */
export class FileOutput {
  #head = 0
  readonly #queued: (() => void)[][]
  readonly #done: boolean[]

  constructor(count: number) {
    this.#queued = Array.from({ length: count }, () => [])
    this.#done = Array.from({ length: count }, () => false)
  }

  /**
   * Print for the file at `index` now, or once the files before it are done.
   * Without a file, like for what the runner prints itself, it's now.
   */
  write(index: number | undefined, print: () => void) {
    if (index === undefined || index <= this.#head) {
      print()
    } else {
      this.#queued[index]?.push(print)
    }
  }

  /**
   * The file at `index` printed everything, the next ones can go.
   */
  done(index: number) {
    this.#done[index] = true
    while (this.#done[this.#head]) {
      this.#head++
      this.#flush(this.#head)
    }
  }

  /**
   * Print what every file is still waiting with, in order, and the rest as it
   * comes. For when the run ends before the files do.
   */
  flushAll() {
    while (this.#head < this.#queued.length) {
      this.#flush(this.#head)
      this.#head++
    }
  }

  #flush(index: number) {
    const queued = this.#queued[index]
    if (queued) {
      this.#queued[index] = []
      for (const print of queued) {
        print()
      }
    }
  }
}
