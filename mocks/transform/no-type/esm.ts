import { noTypeView } from './view'

enum Value {
  Two = 2,
}

export const fromNoType: number = Value.Two
export const metaUrl: string = import.meta.url
export { noTypeView }
