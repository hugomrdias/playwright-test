import { equal, is } from 'uvu/assert'

enum Color {
  Red = 1,
  Green = 2,
}

// biome-ignore lint/style/noNamespace: the transform has to support it
namespace Geometry {
  export const sides = 4
  export function area(side: number): number {
    return side * side
  }
}

class Point {
  constructor(
    public x: number,
    private readonly y: number
  ) {}

  sum(): number {
    return this.x + this.y
  }
}

function double<T extends new () => object>(
  target: T,
  _context: ClassDecoratorContext
) {
  return class extends target {
    doubled = true
  }
}

@double
class Decorated {}

describe('typescript syntax', () => {
  it('enum', () => {
    is(Color.Green, 2)
    is(Color[1], 'Red')
  })

  it('namespace with runtime values', () => {
    is(Geometry.sides, 4)
    is(Geometry.area(3), 9)
  })

  it('parameter properties', () => {
    is(new Point(1, 2).x, 1)
    is(new Point(1, 2).sum(), 3)
  })

  it('decorators', () => {
    equal(new Decorated(), Object.assign(new Decorated(), { doubled: true }))
    is((new Decorated() as { doubled?: boolean }).doubled, true)
  })
})
