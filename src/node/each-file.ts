/**
 * `--test-isolation process` for the runners that don't have it themselves:
 * each file in a process of its own, at most `concurrency` at once. What
 * they print comes out a file at a time, in the order of the files.
 */
import type { ChildProcess } from 'node:child_process'
import path from 'node:path'
import { colors } from '../utils/colors.ts'
import { log } from '../utils/index.ts'
import { FORCE_KILL_DELAY, forceKill, killTree } from '../utils/process.ts'

/** What a runner does with the files, see {@link runEachFile} */
export interface EachFile {
  /** Relative to `cwd`, to show them */
  files: string[]
  cwd: string
  concurrency: number
  /** The first failed file ends the others and skips the rest */
  bail: boolean
  /**
   * Start one file, with `stdio` for its stdout and stderr. `pipe` when what it
   * prints has to wait for the files before it.
   */
  spawn: (file: string, stdio: 'inherit' | 'pipe') => ChildProcess
}

export interface EachFileRun {
  /** If every file passed, it never rejects */
  finished: Promise<boolean>
  /** End the files and wait for them */
  stop: () => Promise<void>
  /** End the files now, for when this process is about to exit */
  kill: () => void
}

type Chunk = ['stdout' | 'stderr', Buffer]

/** How a file ended, see {@link summary} */
export interface FileStatus {
  passed: boolean
  /** Ended by the run, it didn't fail by itself */
  cancelled: boolean
}

interface FileResult extends FileStatus {
  output: Chunk[]
}

/** Grace period of the processes, and some more for them to exit */
const STOP_WAIT = FORCE_KILL_DELAY + 1000

export function runEachFile(options: EachFile): EachFileRun {
  const { bail, concurrency, files, spawn } = options
  // One at a time they can print as they go, and keep their TTY
  const stdio = Math.min(concurrency, files.length) > 1 ? 'pipe' : 'inherit'
  const running = new Set<ChildProcess>()
  // Ended by the run, even if they exit with 0 on SIGTERM
  const ended = new WeakSet<ChildProcess>()
  // Their tests are done, what they started may still hold their output
  const exited = new WeakSet<ChildProcess>()
  const results: (FileResult | undefined)[] = []
  let next = 0
  let printed = 0
  let stopping = false
  let bailed = false

  // The files in order, as far as they are done
  const print = () => {
    let result = results[printed]
    while (result) {
      for (const [stream, chunk] of result.output) {
        process[stream].write(chunk)
      }
      // Only the summary needs the file after this
      result.output = []
      result = results[++printed]
    }
  }

  const runFile = (file: string) =>
    new Promise<FileResult>((resolve) => {
      const output: Chunk[] = []
      const child = spawn(file, stdio)
      running.add(child)
      child.stdout?.on('data', (chunk: Buffer) =>
        output.push(['stdout', chunk])
      )
      child.stderr?.on('data', (chunk: Buffer) =>
        output.push(['stderr', chunk])
      )
      // Like the other runs, the file is in the message of node
      child.once('error', (error) => {
        log.error(`Could not start tests: ${error.message}`)
      })
      child.once('exit', () => exited.add(child))
      child.once('close', (code) => {
        running.delete(child)
        const cancelled = ended.has(child)
        resolve({ passed: code === 0 && !cancelled, cancelled, output })
      })
    })

  const endAll = () => {
    for (const child of running) {
      if (!exited.has(child)) {
        ended.add(child)
      }
      killTree(child)
    }
  }

  const worker = async () => {
    while (!stopping && next < files.length) {
      const index = next++
      const result = await runFile(files[index] as string)
      results[index] = result
      if (!result.passed && bail && !stopping) {
        bailed = true
        stopping = true
        endAll()
      }
      print()
    }
  }

  const finished = (async () => {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, files.length) }, worker)
    )
    // What the ended files printed, a skipped one has nothing
    for (let i = 0; i < files.length; i++) {
      results[i] ??= { passed: false, cancelled: false, output: [] }
    }
    print()
    const passed = results.every((result) => result?.passed)
    if (files.length > 1 && (bailed || !stopping)) {
      summary(options, results as FileResult[], next)
    }
    return passed
  })()

  return {
    finished,
    async stop() {
      stopping = true
      endAll()
      await Promise.race([
        finished,
        new Promise((resolve) => setTimeout(resolve, STOP_WAIT).unref()),
      ])
    },
    kill() {
      stopping = true
      for (const child of running) {
        forceKill(child)
      }
    },
  }
}

/**
 * How many files passed, failed or didn't run, like the end of the `spec`
 * reporter of `node:test`.
 *
 * @param started - How many of the files started
 */
export function summary(
  { cwd, files }: { cwd: string; files: string[] },
  results: FileStatus[],
  started: number
) {
  const ran = results.slice(0, started)
  const failed = files.filter(
    (_, i) => i < started && !results[i]?.passed && !results[i]?.cancelled
  )
  const lines = [
    '',
    colors.blue(`ℹ files ${files.length}`),
    colors.blue(`ℹ pass ${ran.filter((result) => result.passed).length}`),
    colors.blue(`ℹ fail ${failed.length}`),
    colors.blue(
      `ℹ cancelled ${ran.filter((result) => result.cancelled).length}`
    ),
    colors.blue(`ℹ skipped ${files.length - started}`),
  ]
  if (failed.length > 0) {
    lines.push('', colors.red('✖ failing files:'))
    for (const file of failed) {
      lines.push(`  ${path.relative(cwd, path.resolve(cwd, file))}`)
    }
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}
