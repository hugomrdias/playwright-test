const { upper } = require('./upper')

export const fromCts: string = 'fromCts'
export function shout(value: string): string {
  return `${upper(value)}!`
}
