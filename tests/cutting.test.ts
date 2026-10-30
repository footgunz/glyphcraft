import { describe, expect, it } from 'vitest'
import { prepareForCutting, toMm } from '../src/cutting'
import { rect, shapeBounds, union } from '../src/geometry'
import type { Layer } from '../src/render'

const layer = (id: string, shape: Layer['shape']): Layer => ({ id, label: id, shape, color: '#000', vinyl: 'A' })
const opts = { widthMm: 100, regMarks: false, weedBox: false, removeSmall: false, minPieceMm: 1.5 }

describe('toMm', () => {
  it('converts units', () => {
    expect(toMm(2, 'mm')).toBe(2)
    expect(toMm(1, 'in')).toBeCloseTo(25.4)
    expect(toMm(96, 'px')).toBeCloseTo(25.4)
  })
})

describe('prepareForCutting', () => {
  it('passes empty input through', () => {
    expect(prepareForCutting([], opts)).toEqual({ layers: [], margin: 0, removed: [], removedCount: 0 })
  })
  it('adds the same marks and box to every layer, outside the artwork', () => {
    const a = layer('a', rect(0, 0, 100, 40))
    const b = layer('b', rect(10, 10, 90, 30))
    const out = prepareForCutting([a, b], { ...opts, regMarks: true, weedBox: true }).layers
    const [ba, bb] = out.map((l) => shapeBounds(l.shape))
    expect(ba).toEqual(bb)
    expect(ba.minX).toBeLessThan(0)
    expect(ba.maxX).toBeGreaterThan(100)
  })
  it('drops pieces too small to weed', () => {
    const l = layer('a', union(rect(0, 0, 100, 40), rect(120, 0, 120.1, 0.1)))
    const r = prepareForCutting([l], { ...opts, removeSmall: true })
    expect(r.removedCount).toBe(1)
    expect(shapeBounds(r.layers[0].shape).maxX).toBe(100)
  })
})
