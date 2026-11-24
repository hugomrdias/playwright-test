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
  tmpdir,
} from '../base-runner.ts'
import type { Config, Logger, RunResult, WatchHandle } from '../types.ts'
import { EXT } from '../utils/ext.ts'
import { UsageError, withTimeout } from '../utils/index.ts'
import { toPatterns } from '../utils/name-pattern.ts'
import {
  FORCE_KILL_DELAY,
  forceKill,
  isRunning,
  killTree,
  withLocalBins,
} from '../utils/process.ts'
import { runEachFile } from './each-file.ts'
import { canRunInProcess, runIsolated } from './node-test-run.ts'

// What a killed subprocess gets after its forced kill, to end
const EXIT_WAIT = 1000

const isolatedFile = fileURLToPath(
  new URL(`./isolated-file${EXT}`, import.meta.url)
)
const isolatedRun = fileURLToPath(
  new URL(`./isolated-run${EXT}`, import.meta.url)
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
  readonly dir: string
  readonly #log: Logger
  #removing?: Promise<void>

  constructor(tempDir: string, logger: Logger) {
    this.dir = fs.mkdtempSync(path.join(tempDir, 'pw-workers-'))
    this.#log = logger
  }

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
    this.#removing ??= removeFolder(this.dir, this.#log)
    await this.#removing
  }

  /** {@link remove} right away, for when this process exits next */
  kill() {
    this.signal('SIGKILL')
    removeFolderNow(this.dir, this.#log)
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
  #watcher: { close: () => Promise<void> } | undefined

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
    await this.startAssetServer(this.dir)
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

  #hasCustomStdio() {
    return this.stdout !== process.stdout || this.stderr !== process.stderr
  }

  #pipeToStreams(child: ChildProcess) {
    child.stdout?.on('data', (chunk: Buffer) => {
      this.stdout.write(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      this.stderr.write(chunk)
    })
  }

  /**
   * One subprocess for all the files, and the files it started if they wrote
   * their pids in `workers`.
   */
  #track(child: ChildProcess, workers?: Workers): Tests {
    const finished = new Promise<boolean>((resolve) => {
      child.once('error', (error) => {
        this.log.error(`Could not start tests: ${error.message}`)
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
      stdout: this.stdout,
      stderr: this.stderr,
      log: this.log,
      colors: this.colors,
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
    const pipe = stdio === 'pipe' || this.#hasCustomStdio()
    const streamMode = pipe ? 'pipe' : 'inherit'

    const child = spawn(process.execPath, nodeArgs, {
      cwd: this.options.cwd,
      env: withLocalBins(this.env, this.options.cwd),
      stdio: ['pipe', streamMode, streamMode] as ['pipe', 'pipe', 'pipe'],
    })
    if (stdio === 'inherit' && this.#hasCustomStdio()) {
      this.#pipeToStreams(child)
    }
    // It's gone when it ends or fails to start before reading all of the entry
    child.stdin.on('error', () => {
      // noop
    })
    child.stdin.end(this.#entry(files))
    return child
  }

  /**
   * Each file in its own process, with `run()` of `node:test` in this process
   * when it can, else in one more process with the env of the tests.
   */
  #runIsolated(): Tests {
    const { testConcurrency, testNamePattern, testRunner, testTimeout } =
      this.options
    const { reporter } = (testRunner.options ?? {}) as {
      reporter?: string | string[]
    }
    const workers = new Workers(tmpdir(this.initialEnv), this.log)
    const env = withLocalBins(this.env, this.options.cwd)
    // From a test of node:test it would think it's one of its workers, and
    // skip the files as a recursive run
    delete env.NODE_TEST_CONTEXT
    env.PW_WORKER_PIDS = workers.dir
    const options = {
      files: this.tests.map((t) => path.resolve(this.options.cwd, t)),
      imports: [pathToFileURL(isolatedFile).href],
      concurrency: testConcurrency,
      testNamePatterns: toPatterns(testNamePattern),
      // 0 is no timeout, for node that's a test that always times out
      timeout: testTimeout || undefined,
      reporters: [reporter ?? []].flat(),
    }

    if (!canRunInProcess(env, options.reporters)) {
      const pipe = this.#hasCustomStdio()
      const streamMode = pipe ? 'pipe' : 'inherit'
      const child = spawn(
        process.execPath,
        ['--enable-source-maps', isolatedRun],
        {
          cwd: this.options.cwd,
          env,
          stdio: ['pipe', streamMode, streamMode] as ['pipe', 'pipe', 'pipe'],
        }
      )
      if (pipe) {
        this.#pipeToStreams(child)
      }
      child.stdin.on('error', () => {
        // noop
      })
      child.stdin.end(JSON.stringify(options))
      return this.#track(child, workers)
    }

    const controller = new AbortController()
    const finished = runIsolated({
      ...options,
      cwd: this.options.cwd,
      env,
      signal: controller.signal,
      stdout: this.stdout,
    }).catch((error: Error) => {
      this.log.error(`Could not start tests: ${error.message}`)
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

  run(): Promise<RunResult> {
    return this.finish(async () => {
      try {
        await this.#setupServer()
        if (this.stopped) {
          return
        }
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
    })
  }

  async watch(): Promise<WatchHandle> {
    if (this.exitProcess) {
      this.handleExit()
    }
    const handle: WatchHandle = {
      done: this.done,
      stop: async () => (await this.stop(false)) as RunResult,
    }

    let tests: Tests
    try {
      await this.#setupServer()
      if (this.stopped) {
        return handle
      }
      await this.runBeforeTests()
      // Stopped during the hook, nothing would stop the tests started now
      if (this.stopped) {
        return handle
      }

      tests = this.runTests()
    } catch (error) {
      await this.stop(true, formatError(error))
      return handle
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
        this.log.info('Reloading tests...')
        await tests.stop()
        // Stopped in the meantime, nothing would stop the tests started now
        if (this.stopped) {
          return
        }
        tests = this.runTests()
      } while (pending)
      restarting = false
    }

    try {
      // Watch for changes in the project, ignoring dot folders and node_modules.
      // Imported here, only --watch needs it.
      const { watch } = await import('chokidar')
      if (this.stopped) {
        return handle
      }
      const watcher = watch(cwd, {
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
      this.#watcher = watcher

      const ready = new Promise<void>((resolve, reject) => {
        watcher.once('ready', () => {
          watcher.off('error', reject)
          watcher.on('error', (error) => {
            if (!this.stopped) {
              this.log.error(error)
            }
          })
          resolve()
        })
        watcher.once('error', reject)
      })
      await Promise.race([ready, this.done])
      if (this.stopped) {
        ready.catch(() => undefined)
        return handle
      }
    } catch (error) {
      await this.stop(true, formatError(error))
      return handle
    }

    return handle
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
    await this.#watcher?.close()
    this.#watcher = undefined
    await this.#tests?.stop()
  }
}
