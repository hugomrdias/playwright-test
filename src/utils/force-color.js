/**
 * Whether `FORCE_COLOR` asks for colors, the only way to get them in an agent.
 */
export function isColorForced() {
  const value =
    typeof process === 'undefined' ? undefined : process.env?.FORCE_COLOR
  return value != null && value !== '0'
}
