// @ts-nocheck
'use strict'

import { SourceMapConsumer } from 'source-map'
import { dirname, resolve } from 'path'

let fs

try {
  fs = require('fs')
  if (!fs.existsSync || !fs.readFileSync) {
    // fs doesn't have all methods we need
    fs = null
  }
} catch (err) {
  /* nop */
}

import { Buffer } from 'buffer'

/**
 * Requires a module which is protected against bundler minification.
 *
 * @param {NodeModule} mod
 * @param {string} request
 */
function dynamicRequire(mod, request) {
  return mod.require(request)
}

// Only install once if called multiple times
let errorFormatterInstalled = false
let uncaughtShimInstalled = false

// If true, the caches are reset before a stack trace formatting operation
let emptyCacheBetweenOperations = false

// Supports {browser, node, auto}
let environment = 'auto'

// Maps a file path to a string containing the file contents
let fileContentsCache = {}

// Maps a file path to a source map for that file
let sourceMapCache = {}

// Regex for detecting source maps
const reSourceMap = /^data:application\/json[^,]+base64,/

// Priority list of retrieve handlers
let retrieveFileHandlers = []
let retrieveMapHandlers = []

function isInBrowser() {
  if (environment === 'browser') {
    return true
  }
  if (environment === 'node') {
    return false
  }

  return (
    typeof window !== 'undefined' &&
    typeof XMLHttpRequest === 'function' &&
    !(
      window.require &&
      window.module &&
      window.process &&
      window.process.type === 'renderer'
    )
  )
}

function hasGlobalProcessEventEmitter() {
  return (
    typeof process === 'object' &&
    process !== null &&
    typeof process.on === 'function'
  )
}

function handlerExec(list) {
  return function (arg) {
    for (let i = 0; i < list.length; i++) {
      const ret = list[i](arg)

      if (ret) {
        return ret
      }
    }

    return null
  }
}

let retrieveFile = handlerExec(retrieveFileHandlers)

retrieveFileHandlers.push((path) => {
  // Trim the path to make sure there is no extra whitespace.
  path = path.trim()
  if (/^file:/.test(path)) {
    // existsSync/readFileSync can't handle file protocol, but once stripped, it works
    path = path.replace(
      /file:\/\/\/(\w:)?/,
      (protocol, drive) =>
        drive
          ? '' // file:///C:/dir/file -> C:/dir/file
          : '/' // file:///root-dir/file -> /root-dir/file
    )
  }
  if (path in fileContentsCache) {
    return fileContentsCache[path]
  }

  let contents = ''

  try {
    if (!fs) {
      // Use SJAX if we are in the browser
      const xhr = new XMLHttpRequest()

      xhr.open('GET', path, /** async */ false)
      xhr.send(null)
      if (xhr.readyState === 4 && xhr.status === 200) {
        contents = xhr.responseText
      }
    } else if (fs.existsSync(path)) {
      // Otherwise, use the filesystem
      contents = fs.readFileSync(path, 'utf8')
    }
  } catch (er) {
    /* ignore any errors */
  }

  return (fileContentsCache[path] = contents)
})

// Support URLs relative to a directory, but be careful about a protocol prefix
// in case we are in the browser (i.e. directories may start with "http://" or "file:///")
function supportRelativeURL(file, url, tweak) {
  if (!file) {
    return url
  }
  const dir = dirname(file)
  const match = /^\w+:\/\/[^\/]*/.exec(dir)
  let protocol = match ? match[0] : ''
  const startPath = dir.slice(protocol.length)

  if (protocol && /^\/\w\:/.test(startPath)) {
    // handle file:///C:/ paths
    protocol += '/'

    return (
      protocol + resolve(dir.slice(protocol.length), url).replace(/\\/g, '/')
    )
  }
  if (tweak && PW_TEST_SOURCEMAP === true) {
    return resolve(PW_TEST_SOURCEMAP_PATH, url)
    // return PW_TEST_SOURCEMAP_PATH + resolve(dir.slice(protocol.length), url)
  }

  return protocol + resolve(dir.slice(protocol.length), url)
}

function retrieveSourceMapURL(source) {
  let fileData

  if (isInBrowser()) {
    try {
      const xhr = new XMLHttpRequest()

      xhr.open('GET', source, false)
      xhr.send(null)
      fileData = xhr.readyState === 4 ? xhr.responseText : null

      // Support providing a sourceMappingURL via the SourceMap header
      const sourceMapHeader =
        xhr.getResponseHeader('SourceMap') ||
        xhr.getResponseHeader('X-SourceMap')

      if (sourceMapHeader) {
        return sourceMapHeader
      }
    } catch (e) {}
  }

  // Get the URL of the source map
  fileData = retrieveFile(source)
  const re =
    /(?:\/\/[@#][\s]*sourceMappingURL=([^\s'"]+)[\s]*$)|(?:\/\*[@#][\s]*sourceMappingURL=([^\s*'"]+)[\s]*(?:\*\/)[\s]*$)/gm
  // Keep executing the search to find the *last* sourceMappingURL to avoid
  // picking up sourceMappingURLs from comments, strings, etc.
  let lastMatch, match

  while ((match = re.exec(fileData))) {
    lastMatch = match
  }
  if (!lastMatch) {
    return null
  }

  return lastMatch[1]
}

// Can be overridden by the retrieveSourceMap option to install. Takes a
// generated source filename; returns a {map, optional url} object, or null if
// there is no source map.  The map field may be either a string or the parsed
// JSON object (ie, it must be a valid argument to the SourceMapConsumer
// constructor).
let retrieveSourceMap = handlerExec(retrieveMapHandlers)

retrieveMapHandlers.push((source) => {
  let sourceMappingURL = retrieveSourceMapURL(source)

  if (!sourceMappingURL) {
    return null
  }

  // Read the contents of the source map
  let sourceMapData

  if (reSourceMap.test(sourceMappingURL)) {
    // Support source map URL as a data url
    const rawData = sourceMappingURL.slice(sourceMappingURL.indexOf(',') + 1)

    sourceMapData = Buffer.from(rawData, 'base64').toString()
    sourceMappingURL = source
  } else {
    // Support source map URLs relative to the source URL
    sourceMappingURL = supportRelativeURL(source, sourceMappingURL, true)
    sourceMapData = retrieveFile(sourceMappingURL)
  }

  if (!sourceMapData) {
    return null
  }

  return {
    url: sourceMappingURL,
    map: sourceMapData,
  }
})

function mapSourcePosition(position) {
  let sourceMap = sourceMapCache[position.source]

  if (!sourceMap) {
    // Call the (overrideable) retrieveSourceMap function to get the source map.
    const urlAndMap = retrieveSourceMap(position.source)

    if (urlAndMap) {
      sourceMap = sourceMapCache[position.source] = {
        url: urlAndMap.url,
        map: new SourceMapConsumer(urlAndMap.map),
      }

      // Load all sources stored inline with the source map into the file cache
      // to pretend like they are already loaded. They may not exist on disk.
      if (sourceMap.map.sourcesContent) {
        sourceMap.map.sources.forEach((source, i) => {
          const contents = sourceMap.map.sourcesContent[i]

          if (contents) {
            const url = supportRelativeURL(sourceMap.url, source, true)

            fileContentsCache[url] = contents
          }
        })
      }
    } else {
      sourceMap = sourceMapCache[position.source] = {
        url: null,
        map: null,
      }
    }
  }

  // Resolve the source URL relative to the URL of the source map
  if (
    sourceMap &&
    sourceMap.map &&
    typeof sourceMap.map.originalPositionFor === 'function'
  ) {
    const originalPosition = sourceMap.map.originalPositionFor(position)

    // Only return the original position if a matching line was found. If no
    // matching line is found then we return position instead, which will cause
    // the stack trace to print the path and line for the compiled file. It is
    // better to give a precise location in the compiled file than a vague
    // location in the original file.
    if (originalPosition.source !== null) {
      originalPosition.source = supportRelativeURL(
        sourceMap.url,
        originalPosition.source,
        true
      )

      return originalPosition
    }
  }

  return position
}

// Parses code generated by FormatEvalOrigin(), a function inside V8:
// https://code.google.com/p/v8/source/browse/trunk/src/messages.js
function mapEvalOrigin(origin) {
  // Most eval() calls are in this format
  let match = /^eval at ([^(]+) \((.+):(\d+):(\d+)\)$/.exec(origin)

  if (match) {
    const position = mapSourcePosition({
      source: match[2],
      line: Number(match[3]),
      column: match[4] - 1,
    })

    return (
      'eval at ' +
      match[1] +
      ' (' +
      position.source +
      ':' +
      position.line +
      ':' +
      (position.column + 1) +
      ')'
    )
  }

  // Parse nested eval() calls using recursion
  match = /^eval at ([^(]+) \((.+)\)$/.exec(origin)
  if (match) {
    return 'eval at ' + match[1] + ' (' + mapEvalOrigin(match[2]) + ')'
  }

  // Make sure we still return useful information if we didn't find anything
  return origin
}

// This is copied almost verbatim from the V8 source code at
// https://code.google.com/p/v8/source/browse/trunk/src/messages.js. The
// implementation of wrapCallSite() used to just forward to the actual source
// code of CallSite.prototype.toString but unfortunately a new release of V8
// did something to the prototype chain and broke the shim. The only fix I
// could find was copy/paste.
function CallSiteToString() {
  let fileName
  let fileLocation = ''

  if (this.isNative()) {
    fileLocation = 'native'
  } else {
    fileName = this.getScriptNameOrSourceURL()
    if (!fileName && this.isEval()) {
      fileLocation = this.getEvalOrigin()
      fileLocation += ', ' // Expecting source position to follow.
    }

    if (fileName) {
      fileLocation += fileName
    } else {
      // Source code does not originate from a file and is not native, but we
      // can still get the source position inside the source string, e.g. in
      // an eval string.
      fileLocation += '<anonymous>'
    }
    const lineNumber = this.getLineNumber()

    if (lineNumber != null) {
      fileLocation += ':' + lineNumber
      const columnNumber = this.getColumnNumber()

      if (columnNumber) {
        fileLocation += ':' + columnNumber
      }
    }
  }

  let line = ''
  const functionName = this.getFunctionName()
  let addSuffix = true
  const isConstructor = this.isConstructor()
  const isMethodCall = !(this.isToplevel() || isConstructor)

  if (isMethodCall) {
    let typeName = this.getTypeName()

    // Fixes shim to be backward compatable with Node v0 to v4
    if (typeName === '[object Object]') {
      typeName = 'null'
    }
    const methodName = this.getMethodName()

    if (functionName) {
      if (typeName && functionName.indexOf(typeName) != 0) {
        line += typeName + '.'
      }
      line += functionName
      if (
        methodName &&
        functionName.indexOf('.' + methodName) !=
          functionName.length - methodName.length - 1
      ) {
        line += ' [as ' + methodName + ']'
      }
    } else {
      line += typeName + '.' + (methodName || '<anonymous>')
    }
  } else if (isConstructor) {
    line += 'new ' + (functionName || '<anonymous>')
  } else if (functionName) {
    line += functionName
  } else {
    line += fileLocation
    addSuffix = false
  }
  if (addSuffix) {
    line += ' (' + fileLocation + ')'
  }

  return line
}

function cloneCallSite(frame) {
  const object = {}

  Object.getOwnPropertyNames(Object.getPrototypeOf(frame)).forEach((name) => {
    object[name] = /^(?:is|get)/.test(name)
      ? function () {
          return frame[name].call(frame)
        }
      : frame[name]
  })
  object.toString = CallSiteToString

  return object
}

function wrapCallSite(frame, state) {
  // provides interface backward compatibility
  if (state === undefined) {
    state = {
      nextPosition: null,
      curPosition: null,
    }
  }
  if (frame.isNative()) {
    state.curPosition = null

    return frame
  }

  // Most call sites will return the source file from getFileName(), but code
  // passed to eval() ending in "//# sourceURL=..." will return the source file
  // from getScriptNameOrSourceURL() instead
  const source = frame.getFileName() || frame.getScriptNameOrSourceURL()

  if (source) {
    const line = frame.getLineNumber()
    let column = frame.getColumnNumber() - 1

    // Fix position in Node where some (internal) code is prepended.
    // See https://github.com/evanw/node-source-map-support/issues/36
    // Header removed in node at ^10.16 || >=11.11.0
    // v11 is not an LTS candidate, we can just test the one version with it.
    // Test node versions for: 10.16-19, 10.20+, 12-19, 20-99, 100+, or 11.11
    const noHeader =
      /^v(10\.1[6-9]|10\.[2-9][0-9]|10\.[0-9]{3,}|1[2-9]\d*|[2-9]\d|\d{3,}|11\.11)/
    const headerLength = noHeader.test(process.version) ? 0 : 62

    if (
      line === 1 &&
      column > headerLength &&
      !isInBrowser() &&
      !frame.isEval()
    ) {
      column -= headerLength
    }

    const position = mapSourcePosition({
      source: source,
      line: line,
      column: column,
    })

    state.curPosition = position
    frame = cloneCallSite(frame)
    const originalFunctionName = frame.getFunctionName

    frame.getFunctionName = function () {
      if (state.nextPosition == null) {
        return originalFunctionName()
      }

      return state.nextPosition.name || originalFunctionName()
    }
    frame.getFileName = function () {
      return position.source
    }
    frame.getLineNumber = function () {
      return position.line
    }
    frame.getColumnNumber = function () {
      return position.column + 1
    }
    frame.getScriptNameOrSourceURL = function () {
      return position.source
    }

    return frame
  }

  // Code called using eval() needs special handling
  let origin = frame.isEval() && frame.getEvalOrigin()

  if (origin) {
    origin = mapEvalOrigin(origin)
    frame = cloneCallSite(frame)
    frame.getEvalOrigin = function () {
      return origin
    }

    return frame
  }

  // If we get here then we were unable to change the source position
  return frame
}

// This function is part of the V8 stack trace API, for more info see:
// https://v8.dev/docs/stack-trace-api
function prepareStackTrace(error, stack) {
  if (emptyCacheBetweenOperations) {
    fileContentsCache = {}
    sourceMapCache = {}
  }

  const name = error.name || 'Error'
  const message = error.message || ''
  const errorString = name + ': ' + message

  const state = {
    nextPosition: null,
    curPosition: null,
  }
  const processedStack = []

  for (let i = stack.length - 1; i >= 0; i--) {
    processedStack.push('\n    at ' + wrapCallSite(stack[i], state))
    state.nextPosition = state.curPosition
  }
  state.curPosition = state.nextPosition = null

  return errorString + processedStack.reverse().join('')
}

// Generate position and snippet of original source with pointer
function getErrorSource(error) {
  const match = /\n {4}at [^(]+ \((.*):(\d+):(\d+)\)/.exec(error.stack)

  if (match) {
    const source = match[1]
    const line = Number(match[2])
    const column = Number(match[3])

    // Support the inline sourceContents inside the source map
    let contents = fileContentsCache[source]

    // Support files on disk
    if (!contents && fs && fs.existsSync(source)) {
      try {
        contents = fs.readFileSync(source, 'utf8')
      } catch (er) {
        contents = ''
      }
    }

    // Format the line from the original source code like node does
    if (contents) {
      const code = contents.split(/(?:\r\n|\r|\n)/)[line - 1]

      if (code) {
        return (
          source +
          ':' +
          line +
          '\n' +
          code +
          '\n' +
          new Array(column).join(' ') +
          '^'
        )
      }
    }
  }

  return null
}

function printErrorAndExit(error) {
  const source = getErrorSource(error)

  // Ensure error is printed synchronously and not truncated
  if (process.stderr._handle && process.stderr._handle.setBlocking) {
    process.stderr._handle.setBlocking(true)
  }

  if (source) {
    console.error()
    console.error(source)
  }

  console.error(error.stack)
  process.exit(1)
}

function shimEmitUncaughtException() {
  const origEmit = process.emit

  process.emit = function (type) {
    if (type === 'uncaughtException') {
      const hasStack = arguments[1] && arguments[1].stack
      const hasListeners = this.listeners(type).length > 0

      if (hasStack && !hasListeners) {
        return printErrorAndExit(arguments[1])
      }
    }

    return origEmit.apply(this, arguments)
  }
}

const originalRetrieveFileHandlers = retrieveFileHandlers.slice(0)
const originalRetrieveMapHandlers = retrieveMapHandlers.slice(0)

const _wrapCallSite = wrapCallSite
export { _wrapCallSite as wrapCallSite }
const _getErrorSource = getErrorSource
export { _getErrorSource as getErrorSource }
const _mapSourcePosition = mapSourcePosition
export { _mapSourcePosition as mapSourcePosition }
const _retrieveSourceMap = retrieveSourceMap
export { _retrieveSourceMap as retrieveSourceMap }

export function install(options) {
  options = options || {}

  if (options.environment) {
    environment = options.environment
    if (['node', 'browser', 'auto'].indexOf(environment) === -1) {
      throw new Error(
        'environment ' +
          environment +
          ' was unknown. Available options are {auto, browser, node}'
      )
    }
  }

  // Allow sources to be found by methods other than reading the files
  // directly from disk.
  if (options.retrieveFile) {
    if (options.overrideRetrieveFile) {
      retrieveFileHandlers.length = 0
    }

    retrieveFileHandlers.unshift(options.retrieveFile)
  }

  // Allow source maps to be found by methods other than reading the files
  // directly from disk.
  if (options.retrieveSourceMap) {
    if (options.overrideRetrieveSourceMap) {
      retrieveMapHandlers.length = 0
    }

    retrieveMapHandlers.unshift(options.retrieveSourceMap)
  }

  // Support runtime transpilers that include inline source maps
  if (options.hookRequire && !isInBrowser()) {
    // Use dynamicRequire to avoid including in browser bundles
    const Module = dynamicRequire(module, 'module')
    const $compile = Module.prototype._compile

    if (!$compile.__sourceMapSupport) {
      Module.prototype._compile = function (content, filename) {
        fileContentsCache[filename] = content
        sourceMapCache[filename] = undefined

        return $compile.call(this, content, filename)
      }

      Module.prototype._compile.__sourceMapSupport = true
    }
  }

  // Configure options
  if (!emptyCacheBetweenOperations) {
    emptyCacheBetweenOperations =
      'emptyCacheBetweenOperations' in options
        ? options.emptyCacheBetweenOperations
        : false
  }

  // Install the error reformatter
  if (!errorFormatterInstalled) {
    errorFormatterInstalled = true
    Error.prepareStackTrace = prepareStackTrace
  }

  if (!uncaughtShimInstalled) {
    let installHandler =
      'handleUncaughtExceptions' in options
        ? options.handleUncaughtExceptions
        : true

    // Do not override 'uncaughtException' with our own handler in Node.js
    // Worker threads. Workers pass the error to the main thread as an event,
    // rather than printing something to stderr and exiting.
    try {
      // We need to use `dynamicRequire` because `require` on it's own will be optimized by WebPack/Browserify.
      const worker_threads = dynamicRequire(module, 'worker_threads')

      if (worker_threads.isMainThread === false) {
        installHandler = false
      }
    } catch (e) {}

    // Provide the option to not install the uncaught exception handler. This is
    // to support other uncaught exception handlers (in test frameworks, for
    // example). If this handler is not installed and there are no other uncaught
    // exception handlers, uncaught exceptions will be caught by node's built-in
    // exception handler and the process will still be terminated. However, the
    // generated JavaScript code will be shown above the stack trace instead of
    // the original source code.
    if (installHandler && hasGlobalProcessEventEmitter()) {
      uncaughtShimInstalled = true
      shimEmitUncaughtException()
    }
  }
}

export function resetRetrieveHandlers() {
  retrieveFileHandlers.length = 0
  retrieveMapHandlers.length = 0

  retrieveFileHandlers = originalRetrieveFileHandlers.slice(0)
  retrieveMapHandlers = originalRetrieveMapHandlers.slice(0)

  retrieveSourceMap = handlerExec(retrieveMapHandlers)
  retrieveFile = handlerExec(retrieveFileHandlers)
}
