import { type Bounds, type Shape, crosshair, frame, shapeBounds, splitSmall, union } from './geometry'
import type { Layer } from './render'

// Physical sizes, in mm.
const GAP = 4 // clearance between artwork, marks and weeding box
const MARK = 8 // registration crosshair size
const MARK_ARM = 1.2 // crosshair arm thickness
const FRAME = 0.8 // weeding box frame thickness
const SVG_MARGIN = 1 // blank border around everything

export interface CutOptions {
  /** Final SVG width in mm (everything included). */
  widthMm: number
  regMarks: boolean
  weedBox: boolean
  removeSmall: boolean
  minPieceMm: number
}

/**
 * Make export layers friendlier to cut and apply:
 * - drop pieces and holes too small to weed,
 * - add identical registration crosshairs to every color so layers line up,
 * - add a weeding box frame around each color.
 * Marks and box are merged into each layer's shape, so they stay locked in
 * position with the artwork when the file is imported into Cricut Design Space.
 *
 * Returns the new layers, the SVG margin (layout units) and the contours that
 * were dropped as too small, so the preview can point them out.
 */
export function prepareForCutting(
  layers: Layer[],
  o: CutOptions,
): { layers: Layer[]; margin: number; removed: Shape; removedCount: number } {
  if (layers.length === 0) return { layers, margin: 0, removed: [], removedCount: 0 }
  const b = shapeBounds(union(...layers.map((l) => l.shape)))
  const artW = b.maxX - b.minX

  // Solve for layout units per mm so the whole SVG, extras included, is widthMm wide.
  const markExtent = o.regMarks ? GAP + MARK : 0
  const boxExtent = o.weedBox ? markExtent + GAP + FRAME : markExtent
  const pad = boxExtent + SVG_MARGIN
  const usable = o.widthMm - 2 * pad
  const k = usable > 0 ? artW / usable : artW / o.widthMm

  const grow = (mm: number): Bounds => ({
    minX: b.minX - mm * k,
    minY: b.minY - mm * k,
    maxX: b.maxX + mm * k,
    maxY: b.maxY + mm * k,
  })

  const extras: Shape[] = []
  if (o.regMarks) {
    const c = grow(GAP + MARK / 2)
    for (const [x, y] of [
      [c.minX, c.minY],
      [c.maxX, c.minY],
      [c.minX, c.maxY],
      [c.maxX, c.maxY],
    ])
      extras.push(crosshair(x, y, MARK * k, MARK_ARM * k))
  }
  if (o.weedBox) extras.push(frame(grow(boxExtent), FRAME * k))

  const minArea = (Math.PI / 4) * (o.minPieceMm * k) ** 2
  const removed: Shape = []
  const out = layers.map((l) => {
    let shape = l.shape
    if (o.removeSmall) {
      const split = splitSmall(shape, minArea)
      shape = split.kept
      removed.push(...split.removed)
    }
    return { ...l, shape: extras.length ? union(shape, ...extras) : shape }
  })
  return { layers: out, margin: SVG_MARGIN * k, removed, removedCount: removed.length }
}

export function toMm(value: number, unit: 'mm' | 'in' | 'px'): number {
  return unit === 'mm' ? value : unit === 'in' ? value * 25.4 : (value * 25.4) / 96
}
