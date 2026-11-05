// `at fn (url:1:2)` or `fn@url:1:2`, with names like `module code` and
// `promise callback*fn` in webkit and firefox
const FRAME = /^\s*(?:at\s|[^@]*@[^@\s]*:\d+:\d+\s*$)/
// `at Array.map (<anonymous>)`, `at async Promise.all (index 0)`, `map@[native code]`
const NATIVE =
  /^\s*at\s.*\((?:<anonymous>|index \d+)\)\s*$|^\s*[^@]*@(?:\[native code\])?\s*$/

/**
 * @param {string} line
 */
export function isFrame(line) {
  return FRAME.test(line)
}

/**
 * Remove the frames of the runner from a stack trace. Native frames have no
 * location to tell who they belong to, so they follow the frames next to them.
 *
 * @param {{ text: string, internal: boolean }[]} lines
 */
export function removeInternalFrames(lines) {
  /**
   * @param {number} index
   * @param {number} step
   */
  const nextToInternal = (index, step) => {
    let i = index + step
    while (lines[i] && NATIVE.test(lines[i].text)) {
      i += step
    }
    return lines[i]?.internal === true
  }

  return lines
    .filter(
      ({ text, internal }, index) =>
        !internal &&
        !(
          NATIVE.test(text) &&
          (nextToInternal(index, -1) || nextToInternal(index, 1))
        )
    )
    .map(({ text }) => text)
}
