/**
 * Parse the value of `--test-name-pattern`, a regular expression that can also
 * be written as `/expression/flags`.
 *
 * @param {string} pattern
 */
export function toRegExp(pattern) {
  const match = pattern.match(/^\/(.*)\/([a-z]*)$/)
  return new RegExp(match?.[1] ?? pattern, match?.[2])
}
