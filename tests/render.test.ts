import { readFileSync } from 'node:fs'
import { parse } from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { DEFAULTS, buildLayers, exportLayers, knockout, layersToSvg } from '../src/render'

const buf = readFileSync(new URL('../src/fonts/Titan One.ttf', import.meta.url))
const font = parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

describe('buildLayers', () => {
  const layers = buildLayers(font, DEFAULTS)
  it('builds non-empty layers ending with the face', () => {
    expect(layers.length).toBeGreaterThan(1)
    expect(layers.some((l) => l.id === 'face')).toBe(true)
    for (const l of layers) expect(l.shape.length).toBeGreaterThan(0)
  })
  it('builds nothing for empty text', () => {
    expect(buildLayers(font, { ...DEFAULTS, text: '' }).every((l) => l.shape.length === 0)).toBe(true)
  })
  it('dual mode collapses to color B then color A', () => {
    expect(exportLayers(layers, 'dual').map((l) => l.id)).toEqual(['color-b', 'color-a'])
  })
  it('knockout keeps the layer count', () => {
    expect(knockout(layers)).toHaveLength(layers.length)
  })
})

describe('layersToSvg', () => {
  it('writes one Inkscape layer per layer at the requested size', () => {
    const layers = exportLayers(buildLayers(font, DEFAULTS), 'dual')
    const svg = layersToSvg(layers, { width: 300, unit: 'mm', gradients: false })
    expect(svg).toMatch(/^<svg [^>]*width="300mm"/)
    expect(svg.match(/inkscape:groupmode="layer"/g)).toHaveLength(layers.length)
  })
  it('handles no layers', () => {
    expect(layersToSvg([], { gradients: false })).toContain('<svg')
  })
})
