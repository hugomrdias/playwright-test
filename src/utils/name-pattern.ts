/**
 * Parse the value of `--test-name-pattern`, a regular expression that can also
 * be written as `/expression/flags`.
 */
export function toRegExp(pattern: string) {
  const match = pattern.match(/^\/(.*)\/([a-z]*)$/)
  return new RegExp(match?.[1] ?? pattern, match?.[2])
}
