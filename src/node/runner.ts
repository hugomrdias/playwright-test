import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inspect } from 'node:util'
import { watch } from 'chokidar'
import { BaseRunner, removeFolder, removeFolderNow } from '../base-runner.ts'
import type { Config } from '../types.ts'
import { EXT } from '../utils/ext.ts'
import { log, UsageError, withTimeout } from '../utils/index.ts'
import { toPatterns } from '../utils/name-pattern.ts'
import {
  FORCE_KILL_DELAY,
  forceKill,
  isRunning,
  killTree,
  withLocalBins,
} from '../utils/process.ts'
import { startServer } from '../utils/server.ts'

// What a killed subprocess gets after its forced kill, to end
const EXIT_WAIT = 1000

const isolatedFile = fileURLToPath(
  new URL(`./isolated-file${EXT}`, import.meta.url)
)
const isolatedRun = fileURLToPath(
  new URL(`./isolated-run${EXT}`, import.meta.url)
)

/**
 * The processes of the files with `--test-isolation process`. Each one writes
 * its pid in `dir`, and removes it when it exits.
 */
interface Tests {
  child: ChildProcess
  finished: Promise<boolean>
  stop: () => Promise<void>
  workers?: Workers
}

class Workers {
  readonly dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-workers-'))

  #pids() {
    try {
      return fs.readdirSync(this.dir).map(Number).filter(isRunning)
    } catch {
      // Removed already
      return []
    }
  }

  signal(name: NodeJS.Signals) {
    for (const pid of this.#pids()) {
      try {
        process.kill(pid, name)
      } catch {
        // Gone
      }
    }
  }

  /** Ask them to end, and force the ones that don't in time */
  async end() {
    const deadline = Date.now() + FORCE_KILL_DELAY
    this.signal('SIGTERM')
    while (this.#pids().length > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    await this.remove()
  }

  /** Force the ones left, then delete the folder */
  async remove() {
    this.signal('SIGKILL')
    await removeFolder(this.dir)
  }

  /** {@link remove} right away, for when this process exits next */
  kill() {
    this.signal('SIGKILL')
    removeFolderNow(this.dir)
  }
}

/**
 * Preserve the stack for Error instances and turn any other thrown value into
 * a non-empty diagnostic so `BaseRunner.exit()` always logs it.
 */
function formatError(error: unknown): Error | string {
  if (error instanceof Error) {
    return error
  }
  if (typeof error === 'string' && error.length > 0) {
    return error
  }
  return `Runner failed: ${inspect(error)}`
}

/**
 * Runs tests directly in Node.js without bundling.
 *
 * The test runner entry is piped to `node --input-type=module` through stdin so
 * imports resolve from `options.cwd`, just like a module living in the project.
 * Files run as plain Node runs them, a loader goes in `NODE_OPTIONS`.
 */
export class NodeRunner extends BaseRunner {
  declare child: ChildProcess | undefined
  #tests: Tests | undefined

  constructor(options: Config, testFiles?: string[]) {
    super(options, testFiles)
    this.child = undefined
    // For reporters to remove our frames from stack traces. A path with forward
    // slashes, frames have `/D:/src` or `D:/src` on Windows. And the path of the
    // file URL, frames with one have it encoded, like `#` as `%23`.
    const src = new URL('../', import.meta.url)
    this.env.PW_TEST_SRC = fileURLToPath(src).replaceAll('\\', '/')
    this.env.PW_TEST_SRC_URL = src.pathname
  }

  assertOptions() {
    if (this.options.trace !== 'off') {
      throw new UsageError(
        'Tracing records the browser, it does not work with --mode node.'
      )
    }
  }

  async #setupServer() {
    // setup http server
    const { server, url } = await startServer(
      this.dir,
      this.options.cwd,
      this.options.assets
    )
    this.env.PW_SERVER = url
    this.server = server
  }

  /**
   * Compile the test runner entry module
   */
  #entry() {
    return this.options.testRunner.compileRuntime(
      this.options,
      this.tests.map(
        (t) => pathToFileURL(path.resolve(this.options.cwd, t)).href
      )
    )
  }

  /**
   * Run the tests in a node subprocess, with the same node running this one.
   *
   * @returns `finished` tells if the tests passed, it never rejects. `stop`
   * ends them, and waits until they ended.
   */
  runTests(): Tests {
    const workers = this.#isolated() ? new Workers() : undefined
    const child = workers ? this.#spawnIsolated(workers) : this.#spawnTogether()
    this.child = child

    const finished = new Promise<boolean>((resolve) => {
      child.once('error', (error) => {
        log.error(`Could not start tests: ${error.message}`)
        resolve(false)
      })
      child.once('close', (code) => resolve(code === 0))
    })
    const stop = async () => {
      killTree(child)
      await Promise.all([
        withTimeout(finished, FORCE_KILL_DELAY + EXIT_WAIT),
        workers?.end(),
      ])
    }
    // The files are gone once it ends by itself
    finished.then(() => workers?.remove())
    this.#tests = { child, finished, stop, workers }
    return this.#tests
  }

  /**
   * `run()` of `node:test` isolates the files itself, the other runners don't
   * have it yet.
   */
  #isolated() {
    const { testIsolation = 'process', testRunner } = this.options
    return testIsolation === 'process' && testRunner.name === 'node-test'
  }

  /**
   * All the files in one process, from an entry module on stdin.
   */
  #spawnTogether() {
    const nodeArgs = [
      '--enable-source-maps',
      '--input-type=module',
      ...(this.options.testRunner.nodeArgs?.(this.options) ?? []),
    ]

    const child = spawn(process.execPath, nodeArgs, {
      cwd: this.options.cwd,
      env: withLocalBins(this.env, this.options.cwd),
      stdio: ['pipe', 'inherit', 'inherit'],
    })
    // It's gone when it ends or fails to start before reading all of the entry
    child.stdin.on('error', () => {
      // noop
    })
    child.stdin.end(this.#entry())
    return child
  }

  /**
   * Each file in its own process, with `run()` of `node:test`.
   */
  #spawnIsolated(workers: Workers) {
    const { testConcurrency, testNamePattern, testRunner, testTimeout } =
      this.options
    const { reporter } = (testRunner.options ?? {}) as {
      reporter?: string | string[]
    }
    const env = withLocalBins(this.env, this.options.cwd)
    // From a test of node:test it would think it's one of its workers, and
    // skip the files as a recursive run
    delete env.NODE_TEST_CONTEXT
    env.PW_WORKER_PIDS = workers.dir

    const child = spawn(
      process.execPath,
      ['--enable-source-maps', isolatedRun],
      {
        cwd: this.options.cwd,
        env,
        stdio: ['pipe', 'inherit', 'inherit'],
      }
    )
    child.stdin.on('error', () => {
      // noop
    })
    child.stdin.end(
      JSON.stringify({
        files: this.tests.map((t) => path.resolve(this.options.cwd, t)),
        imports: [pathToFileURL(isolatedFile).href],
        concurrency: testConcurrency,
        testNamePatterns: toPatterns(testNamePattern),
        // 0 is no timeout, for node that's a test that always times out
        timeout: testTimeout || undefined,
        reporters: [reporter ?? []].flat(),
      })
    )
    return child
  }

  async run() {
    this.handleExit()

    try {
      await this.#setupServer()
      this.startRunTimeout()
      await this.runBeforeTests()
      // Stopped during the hook, nothing would stop the tests started now
      if (this.stopped) {
        return
      }

      const passed = await this.runTests().finished
      // A timeout or a signal stopping them already ended the run
      await this.stop(!passed, passed ? undefined : 'Tests failed.')
    } catch (error) {
      await this.stop(true, formatError(error))
    }
  }

  async watch() {
    this.handleExit()

    let tests: Tests
    try {
      await this.#setupServer()
      await this.runBeforeTests()
      // Stopped during the hook, nothing would stop the tests started now
      if (this.stopped) {
        return
      }

      tests = this.runTests()
    } catch (error) {
      await this.stop(true, formatError(error))
      return
    }

    const cwd = this.options.cwd
    const extensions = this.options.extensions.split(',')
    let restarting = false
    let pending = false

    // Wait for the previous run to exit before starting the next one, and
    // coalesce changes that happen while restarting into a single run
    const restart = async () => {
      if (this.stopped) {
        return
      }
      if (restarting) {
        pending = true
        return
      }
      restarting = true
      do {
        pending = false
        log.info('Reloading tests...')
        await tests.stop()
        // Stopped in the meantime, nothing would stop the tests started now
        if (this.stopped) {
          return
        }
        tests = this.runTests()
      } while (pending)
      restarting = false
    }

    // Watch for changes in the project, ignoring dot folders and node_modules
    watch(cwd, {
      ignored: (file, stats) => {
        const rel = path.relative(cwd, file)
        if (
          rel
            .split(path.sep)
            .some((part) => part.startsWith('.') || part === 'node_modules')
        ) {
          return true
        }
        return Boolean(
          stats?.isFile() && !extensions.includes(path.extname(file).slice(1))
        )
      },
      ignoreInitial: true,
      awaitWriteFinish: { pollInterval: 100, stabilityThreshold: 500 },
    }).on('change', restart)
  }

  cleanupWait() {
    return FORCE_KILL_DELAY + EXIT_WAIT
  }

  /**
   * Don't leave the tests running, also when this process gets stopped. The
   * forced kill comes too late once this process is gone.
   */
  killTests() {
    if (this.child) {
      forceKill(this.child)
    }
    this.#tests?.workers?.kill()
  }

  async stopTests() {
    await this.#tests?.stop()
  }
}
