import { describe, expect, it } from 'vitest'
import {
  type Poly,
  bounds,
  crosshair,
  difference,
  extrude,
  frame,
  offset,
  rect,
  shapeBounds,
  shapeToPathData,
  splitSmall,
  translate,
  union,
  warp,
  warpGroups,
} from '../src/geometry'

const square: Poly = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
]

describe('bounds', () => {
  it('spans all polygons', () => {
    expect(bounds([square, [[-5, 3], [20, 30], [1, 1]]])).toEqual({ minX: -5, minY: 0, maxX: 20, maxY: 30 })
  })
})

describe('warp', () => {
  it('leaves polygons alone with no warp or zero bend', () => {
    expect(warp([square], 'none', 1)).toEqual([square])
    expect(warp([square], 'arch', 0)).toEqual([square])
  })
  it('arch lifts the middle more than the ends', () => {
    const line: Poly = [
      [0, 0],
      [100, 0],
      [100, 10],
      [0, 10],
    ]
    const [out] = warp([line], 'arch', 0.5)
    const top = out.filter(([, y]) => y <= 0)
    const mid = top.reduce((a, p) => (Math.abs(p[0] - 50) < Math.abs(a[0] - 50) ? p : a))
    const end = top.find(([x]) => x === 0)!
    expect(mid[1]).toBeLessThan(end[1])
  })
  it('warpGroups keeps the grouping', () => {
    const out = warpGroups([[square], [square, square]], 'wave', 0.3)
    expect(out.map((g) => g.length)).toEqual([1, 2])
  })
})

describe('boolean ops', () => {
  it('union of overlapping rects covers both', () => {
    expect(shapeBounds(union(rect(0, 0, 10, 10), rect(5, 5, 20, 15)))).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 15 })
  })
  it('difference removes the clip', () => {
    expect(shapeBounds(difference(rect(0, 0, 10, 10), rect(5, -1, 11, 11)))).toEqual({ minX: 0, minY: 0, maxX: 5, maxY: 10 })
  })
  it('offset grows and shrinks', () => {
    expect(shapeBounds(offset(rect(0, 0, 10, 10), 2, 'miter'))).toEqual({ minX: -2, minY: -2, maxX: 12, maxY: 12 })
    expect(shapeBounds(offset(rect(0, 0, 10, 10), -2, 'miter'))).toEqual({ minX: 2, minY: 2, maxX: 8, maxY: 8 })
  })
  it('translate shifts', () => {
    expect(shapeBounds(translate(rect(0, 0, 1, 1), 3, -2))).toEqual({ minX: 3, minY: -2, maxX: 4, maxY: -1 })
  })
  it('extrude sweeps into one solid piece', () => {
    const s = extrude(rect(0, 0, 10, 10), 5, 5)
    expect(s).toHaveLength(1)
    expect(shapeBounds(s)).toEqual({ minX: 0, minY: 0, maxX: 15, maxY: 15 })
  })
  it('frame is an outer contour with a hole', () => {
    expect(frame({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 1)).toHaveLength(2)
  })
  it('crosshair is one plus-shaped contour', () => {
    const c = crosshair(0, 0, 10, 2)
    expect(c).toHaveLength(1)
    expect(shapeBounds(c)).toEqual({ minX: -5, minY: -5, maxX: 5, maxY: 5 })
  })
})

describe('splitSmall', () => {
  it('separates contours by area', () => {
    const { kept, removed } = splitSmall(union(rect(0, 0, 10, 10), rect(20, 20, 21, 21)), 4)
    expect(shapeBounds(kept)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 })
    expect(shapeBounds(removed)).toEqual({ minX: 20, minY: 20, maxX: 21, maxY: 21 })
  })
})

describe('shapeToPathData', () => {
  it('writes one closed subpath per contour, shifted by the origin', () => {
    const d = shapeToPathData(rect(10, 10, 20, 20), 10, 10)
    expect(d.match(/M/g)).toHaveLength(1)
    expect(d.endsWith('Z')).toBe(true)
    for (const n of d.match(/-?\d+(\.\d+)?/g)!.map(Number)) expect([0, 10]).toContain(n)
  })
})
