import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inspect } from 'node:util'
import {
  BaseRunner,
  REMOVE_WAIT,
  removeFolder,
  removeFolderNow,
} from '../base-runner.ts'
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
import { runEachFile } from './each-file.ts'
import { runIsolated } from './isolated-run.ts'

// What a killed subprocess gets after its forced kill, to end
const EXIT_WAIT = 1000

const isolatedFile = fileURLToPath(
  new URL(`./isolated-file${EXT}`, import.meta.url)
)

interface Tests {
  /** If they passed, it never rejects */
  finished: Promise<boolean>
  /** End them, and wait until they ended */
  stop: () => Promise<void>
  /** End them now, this process is about to exit */
  kill: () => void
}

/**
 * The processes of the files with `--test-isolation process`. Each one writes
 * its pid in `dir`, and removes it when it exits.
 */
class Workers {
  readonly dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-workers-'))
  #removing?: Promise<void>

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

  /**
   * Force the ones left, then delete the folder. Once, the tests ending and
   * stopping them both get here.
   */
  async remove() {
    this.signal('SIGKILL')
    this.#removing ??= removeFolder(this.dir)
    await this.#removing
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
  #tests: Tests | undefined

  constructor(options: Config, testFiles?: string[]) {
    super(options, testFiles)
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
  #entry(files: string[]) {
    return this.options.testRunner.compileRuntime(
      this.options,
      files.map((t) => pathToFileURL(path.resolve(this.options.cwd, t)).href)
    )
  }

  /**
   * Run the tests in node subprocesses, with the same node running this one.
   */
  runTests(): Tests {
    const { testIsolation = 'process', testRunner } = this.options
    let tests: Tests
    if (testIsolation === 'none') {
      tests = this.#track(this.#spawnTogether(this.tests))
    } else if (testRunner.name === 'node-test') {
      // `run()` of `node:test` isolates the files itself
      tests = this.#runIsolated()
    } else {
      tests = this.#runEachFile()
    }
    this.#tests = tests
    return tests
  }

  /**
   * One subprocess for all the files, and the files it started if they wrote
   * their pids in `workers`.
   */
  #track(child: ChildProcess, workers?: Workers): Tests {
    const finished = new Promise<boolean>((resolve) => {
      child.once('error', (error) => {
        log.error(`Could not start tests: ${error.message}`)
        resolve(false)
      })
      child.once('close', (code) => resolve(code === 0))
    })
    // The files are gone once it ends by itself
    finished.then(() => workers?.remove())
    return {
      finished,
      async stop() {
        killTree(child)
        await Promise.all([
          withTimeout(finished, FORCE_KILL_DELAY + EXIT_WAIT),
          workers?.end(),
        ])
      },
      kill() {
        forceKill(child)
        workers?.kill()
      },
    }
  }

  /**
   * Each file in a subprocess of its own, with the entry of the runner for
   * only that file.
   */
  #runEachFile() {
    const { testConcurrency, testRunner } = this.options
    const { bail = false } = (testRunner.options ?? {}) as { bail?: boolean }
    return runEachFile({
      files: this.tests,
      cwd: this.options.cwd,
      concurrency:
        testConcurrency ?? Math.max(os.availableParallelism() - 1, 1),
      bail: testRunner.name === 'mocha' && bail,
      spawn: (file, stdio) => this.#spawnTogether([file], stdio),
    })
  }

  /**
   * The files in one process, from an entry module on stdin.
   */
  #spawnTogether(files: string[], stdio: 'inherit' | 'pipe' = 'inherit') {
    const nodeArgs = [
      '--enable-source-maps',
      '--input-type=module',
      ...(this.options.testRunner.nodeArgs?.(this.options) ?? []),
    ]

    const child = spawn(process.execPath, nodeArgs, {
      cwd: this.options.cwd,
      env: withLocalBins(this.env, this.options.cwd),
      stdio: ['pipe', stdio, stdio] as ['pipe', 'pipe', 'pipe'],
    })
    // It's gone when it ends or fails to start before reading all of the entry
    child.stdin.on('error', () => {
      // noop
    })
    child.stdin.end(this.#entry(files))
    return child
  }

  /**
   * Each file in its own process, with `run()` of `node:test` in this one.
   */
  #runIsolated(): Tests {
    const { testConcurrency, testNamePattern, testRunner, testTimeout } =
      this.options
    const { reporter } = (testRunner.options ?? {}) as {
      reporter?: string | string[]
    }
    const workers = new Workers()
    const env = withLocalBins(this.env, this.options.cwd)
    // From a test of node:test it would think it's one of its workers, and
    // skip the files as a recursive run
    delete env.NODE_TEST_CONTEXT
    env.PW_WORKER_PIDS = workers.dir
    const controller = new AbortController()

    const finished = runIsolated({
      files: this.tests.map((t) => path.resolve(this.options.cwd, t)),
      cwd: this.options.cwd,
      env,
      imports: [pathToFileURL(isolatedFile).href],
      concurrency: testConcurrency,
      testNamePatterns: toPatterns(testNamePattern),
      // 0 is no timeout, for node that's a test that always times out
      timeout: testTimeout || undefined,
      reporters: [reporter ?? []].flat(),
      signal: controller.signal,
    }).catch((error: Error) => {
      log.error(`Could not start tests: ${error.message}`)
      return false
    })
    // The files are gone once it ends by itself
    finished.then(() => workers.remove())
    return {
      finished,
      async stop() {
        controller.abort()
        await Promise.all([
          withTimeout(finished, FORCE_KILL_DELAY + EXIT_WAIT),
          workers.end(),
        ])
      },
      kill() {
        controller.abort()
        workers.kill()
      },
    }
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

    // Watch for changes in the project, ignoring dot folders and node_modules.
    // Imported here, only --watch needs it.
    const { watch } = await import('chokidar')
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

  /** Stopping the tests, then deleting the folder of their workers */
  cleanupWait() {
    return FORCE_KILL_DELAY + EXIT_WAIT + REMOVE_WAIT
  }

  /**
   * Don't leave the tests running, also when this process gets stopped. The
   * forced kill comes too late once this process is gone.
   */
  killTests() {
    this.#tests?.kill()
  }

  async stopTests() {
    await this.#tests?.stop()
  }
}
