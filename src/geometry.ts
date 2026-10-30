import type { Font, PathCommand } from 'opentype.js'
import ClipperLib, { type Paths as IntPaths } from 'clipper-lib'

/** A polygon in float coordinates (px, y down). */
export type Poly = [number, number][]

// Clipper works on integers; scale floats up so we keep sub-pixel precision.
const SCALE = 100

export interface LayoutOptions {
  text: string
  fontSize: number
  letterSpacing: number // em fraction
  lineHeight: number // multiple of fontSize
  align: 'left' | 'center' | 'right'
  scaleX: number
  scaleY: number
  /** Per-glyph adjustment, given its character and index among visible glyphs. */
  glyphTransform?: (char: string, index: number) => GlyphTransform
}

export interface GlyphTransform {
  rotate?: number // degrees, clockwise, about the glyph's center
  dx?: number // em fraction, positive = right
  dy?: number // em fraction, negative = raise
  scale?: number // about the glyph's baseline center
}

// ---------------------------------------------------------------------------
// Font → polygons
// ---------------------------------------------------------------------------

/** Lay out text with the font and return flattened contours, one group per visible glyph. */
export function textToGlyphPolys(font: Font, o: LayoutOptions): Poly[][] {
  const lines = o.text.split(/\r?\n/)
  const unit = o.fontSize / font.unitsPerEm
  const spacing = o.letterSpacing * o.fontSize

  const laid = lines.map((line) => {
    const glyphs = font.stringToGlyphs(line)
    // Characters line up 1:1 with glyphs unless the font substituted ligatures.
    const codepoints = Array.from(line)
    const chars = glyphs.map((g, i) =>
      codepoints.length === glyphs.length ? codepoints[i] : g.unicode ? String.fromCodePoint(g.unicode) : '',
    )
    const xs: number[] = []
    let x = 0
    glyphs.forEach((g, i) => {
      xs.push(x)
      x += (g.advanceWidth ?? 0) * unit + spacing
      if (i < glyphs.length - 1) x += font.getKerningValue(g, glyphs[i + 1]) * unit
    })
    return { glyphs, chars, xs, width: Math.max(0, x - spacing) }
  })
  const maxWidth = Math.max(0, ...laid.map((l) => l.width))

  const groups: Poly[][] = []
  laid.forEach((line, li) => {
    const offset =
      o.align === 'center' ? (maxWidth - line.width) / 2 : o.align === 'right' ? maxWidth - line.width : 0
    const baseline = li * o.lineHeight * o.fontSize
    line.glyphs.forEach((g, gi) => {
      const path = g.getPath(offset + line.xs[gi], baseline, o.fontSize)
      let polys = flattenCommands(path.commands).map((poly) =>
        poly.map(([x, y]): [number, number] => [x * o.scaleX, y * o.scaleY]),
      )
      if (!polys.length) return
      const t = o.glyphTransform?.(line.chars[gi], groups.length) ?? {}
      if (t.scale && t.scale !== 1) {
        const b = bounds(polys)
        const cx = (b.minX + b.maxX) / 2
        const by = baseline * o.scaleY
        const k = t.scale
        polys = polys.map((p) => p.map(([x, y]): [number, number] => [cx + (x - cx) * k, by + (y - by) * k]))
      }
      if (t.dx || t.dy) {
        const dx = (t.dx ?? 0) * o.fontSize * o.scaleX
        const dy = (t.dy ?? 0) * o.fontSize * o.scaleY
        polys = polys.map((p) => p.map(([x, y]): [number, number] => [x + dx, y + dy]))
      }
      if (t.rotate) polys = rotate(polys, t.rotate)
      groups.push(polys)
    })
  })
  return groups
}

/** Rotate polygons clockwise (y down) about the center of their bounding box. */
function rotate(polys: Poly[], deg: number): Poly[] {
  const b = bounds(polys)
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  const c = Math.cos((deg * Math.PI) / 180)
  const s = Math.sin((deg * Math.PI) / 180)
  return polys.map((p) =>
    p.map(([x, y]): [number, number] => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]),
  )
}

function flattenCommands(cmds: PathCommand[]): Poly[] {
  const out: Poly[] = []
  let cur: Poly = []
  let px = 0
  let py = 0
  const close = () => {
    if (cur.length > 2) out.push(cur)
    cur = []
  }
  for (const c of cmds) {
    switch (c.type) {
      case 'M':
        close()
        cur.push([c.x, c.y])
        px = c.x
        py = c.y
        break
      case 'L':
        cur.push([c.x, c.y])
        px = c.x
        py = c.y
        break
      case 'Q': {
        const n = curveSteps(px, py, c.x1, c.y1, c.x, c.y)
        for (let i = 1; i <= n; i++) {
          const t = i / n
          const a = (1 - t) * (1 - t)
          const b = 2 * (1 - t) * t
          const d = t * t
          cur.push([a * px + b * c.x1 + d * c.x, a * py + b * c.y1 + d * c.y])
        }
        px = c.x
        py = c.y
        break
      }
      case 'C': {
        const n = curveSteps(px, py, c.x1, c.y1, c.x2, c.y2, c.x, c.y)
        for (let i = 1; i <= n; i++) {
          const t = i / n
          const mt = 1 - t
          const a = mt * mt * mt
          const b = 3 * mt * mt * t
          const e = 3 * mt * t * t
          const d = t * t * t
          cur.push([
            a * px + b * c.x1 + e * c.x2 + d * c.x,
            a * py + b * c.y1 + e * c.y2 + d * c.y,
          ])
        }
        px = c.x
        py = c.y
        break
      }
      case 'Z':
        close()
        break
    }
  }
  close()
  return out
}

/** Pick a subdivision count from the control polygon length (~1.5px per step). */
function curveSteps(...pts: number[]): number {
  let len = 0
  for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1])
  return Math.min(48, Math.max(4, Math.ceil(len / 1.5)))
}

// ---------------------------------------------------------------------------
// Warps
// ---------------------------------------------------------------------------

export type WarpKind =
  | 'none'
  | 'arc'
  | 'arch'
  | 'arcUpper'
  | 'arcLower'
  | 'bulge'
  | 'wave'
  | 'rise'
  | 'perspective'
  | 'fisheye'

export const WARPS: { id: WarpKind; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'arc', label: 'Arc (bend on circle)' },
  { id: 'arch', label: 'Arch' },
  { id: 'arcUpper', label: 'Arc upper' },
  { id: 'arcLower', label: 'Arc lower' },
  { id: 'bulge', label: 'Bulge' },
  { id: 'fisheye', label: 'Fisheye' },
  { id: 'wave', label: 'Wave / flag' },
  { id: 'rise', label: 'Rise' },
  { id: 'perspective', label: 'Perspective' },
]

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function bounds(polys: Poly[]): Bounds {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const p of polys)
    for (const [x, y] of p) {
      if (x < b.minX) b.minX = x
      if (y < b.minY) b.minY = y
      if (x > b.maxX) b.maxX = x
      if (y > b.maxY) b.maxY = y
    }
  return b
}

/** Split long straight edges so they bend smoothly under a warp. */
function densify(poly: Poly, maxLen: number): Poly {
  const out: Poly = []
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % poly.length]
    out.push([x0, y0])
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / maxLen)
    for (let k = 1; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n])
  }
  return out
}

/**
 * Warp all polygons together. `bend` is -1..1. `freq` is used by the wave warp.
 */
export function warp(polys: Poly[], kind: WarpKind, bend: number, freq = 1): Poly[] {
  if (kind === 'none' || bend === 0 || polys.length === 0) return polys
  const b = bounds(polys)
  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2
  const amp = h * 0.9 // vertical displacement amplitude for full bend

  // Circle-arc parameters (Photoshop-style "Arc"): total sweep up to 180°.
  const theta = bend * Math.PI
  const R = w / theta

  const f = (x: number, y: number): [number, number] => {
    const u = w ? (x - cx) / (w / 2) : 0 // -1..1 across
    const v = h ? (y - cy) / (h / 2) : 0 // -1 top .. 1 bottom
    const t = (b.maxY - y) / (h || 1) // 0 bottom .. 1 top
    switch (kind) {
      case 'arc': {
        const phi = (x - cx) / R
        const r = R + (cy - y)
        return [cx + r * Math.sin(phi), cy + R - r * Math.cos(phi)]
      }
      case 'arch':
        return [x, y - bend * amp * (1 - u * u)]
      case 'arcUpper':
        return [x, y - bend * amp * (1 - u * u) * t]
      case 'arcLower':
        return [x, y + bend * amp * (1 - u * u) * (1 - t)]
      case 'bulge':
        return [x, cy + (y - cy) * (1 + bend * (1 - u * u))]
      case 'fisheye': {
        const s = 1 + bend * 0.6 * (1 - Math.min(1, u * u + v * v * 0.25))
        return [cx + (x - cx) * (1 + bend * 0.15 * (1 - u * u)), cy + (y - cy) * s]
      }
      case 'wave':
        return [x, y - bend * amp * 0.5 * Math.sin(u * Math.PI * freq)]
      case 'rise':
        return [x, y - bend * amp * 0.5 * u]
      case 'perspective':
        // Shrink the top (positive) or bottom (negative) edge horizontally.
        return [cx + (x - cx) * (1 + bend * 0.5 * v), y]
    }
    return [x, y]
  }

  const maxLen = Math.max(1, Math.max(w, h) / 300)
  return polys.map((p) => densify(p, maxLen).map(([x, y]) => f(x, y)))
}

/** Warp glyph groups together (one shared bounding box), keeping the grouping. */
export function warpGroups(groups: Poly[][], kind: WarpKind, bend: number, freq = 1): Poly[][] {
  const flat = warp(groups.flat(), kind, bend, freq)
  let k = 0
  return groups.map((g) => g.map(() => flat[k++]))
}

// ---------------------------------------------------------------------------
// Boolean / offset operations (clipper)
// ---------------------------------------------------------------------------

export type Shape = IntPaths

export function toShape(polys: Poly[]): Shape {
  return union(polys.map((p) => p.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }))))
}

export function union(...sets: Shape[]): Shape {
  const c = new ClipperLib.Clipper()
  for (const s of sets) c.AddPaths(s, ClipperLib.PolyType.ptSubject, true)
  const out: Shape = []
  c.Execute(ClipperLib.ClipType.ctUnion, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return out
}

export function difference(a: Shape, b: Shape): Shape {
  const c = new ClipperLib.Clipper()
  c.AddPaths(a, ClipperLib.PolyType.ptSubject, true)
  c.AddPaths(b, ClipperLib.PolyType.ptClip, true)
  const out: Shape = []
  c.Execute(ClipperLib.ClipType.ctDifference, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return out
}

export function offset(s: Shape, delta: number, join: 'round' | 'miter' = 'round'): Shape {
  if (delta === 0) return s
  const co = new ClipperLib.ClipperOffset(4, 0.05 * SCALE)
  co.AddPaths(
    s,
    join === 'round' ? ClipperLib.JoinType.jtRound : ClipperLib.JoinType.jtMiter,
    ClipperLib.EndType.etClosedPolygon,
  )
  const out: Shape = []
  co.Execute(out, delta * SCALE)
  return out
}

export function translate(s: Shape, dx: number, dy: number): Shape {
  const DX = Math.round(dx * SCALE)
  const DY = Math.round(dy * SCALE)
  return s.map((p) => p.map((pt) => ({ X: pt.X + DX, Y: pt.Y + DY })))
}

/**
 * Sweep a shape along the vector (dx, dy): the exact Minkowski sum of the shape
 * with a line segment. Union of the shape, its translated copy, and a quad for
 * every edge swept along the vector.
 */
export function extrude(s: Shape, dx: number, dy: number): Shape {
  const DX = Math.round(dx * SCALE)
  const DY = Math.round(dy * SCALE)
  if (DX === 0 && DY === 0) return s
  const moved = translate(s, dx, dy)
  const quads: Shape = []
  for (const p of s) {
    for (let i = 0; i < p.length; i++) {
      const a = p[i]
      const b = p[(i + 1) % p.length]
      const q = [a, b, { X: b.X + DX, Y: b.Y + DY }, { X: a.X + DX, Y: a.Y + DY }]
      // Give every quad positive winding so overlaps never cancel out.
      if (!ClipperLib.Clipper.Orientation(q)) q.reverse()
      quads.push(q)
    }
  }
  return union(s, moved, quads)
}

/** Split off every contour (piece or hole) whose area is below `minArea` (px²). */
export function splitSmall(s: Shape, minArea: number): { kept: Shape; removed: Shape } {
  const min = minArea * SCALE * SCALE
  const kept: Shape = []
  const removed: Shape = []
  for (const p of s) (Math.abs(ClipperLib.Clipper.Area(p)) >= min ? kept : removed).push(p)
  return { kept, removed }
}

export function rect(x0: number, y0: number, x1: number, y1: number): Shape {
  const r = (n: number) => Math.round(n * SCALE)
  return [[{ X: r(x0), Y: r(y0) }, { X: r(x1), Y: r(y0) }, { X: r(x1), Y: r(y1) }, { X: r(x0), Y: r(y1) }]]
}

/** A rectangular frame `width` thick whose outer edge is the given box. */
export function frame(b: Bounds, width: number): Shape {
  return difference(
    rect(b.minX, b.minY, b.maxX, b.maxY),
    rect(b.minX + width, b.minY + width, b.maxX - width, b.maxY - width),
  )
}

/** A plus-shaped crosshair centered on (cx, cy). */
export function crosshair(cx: number, cy: number, size: number, arm: number): Shape {
  const h = size / 2
  const a = arm / 2
  return union(rect(cx - h, cy - a, cx + h, cy + a), rect(cx - a, cy - h, cx + a, cy + h))
}

export function shapeBounds(s: Shape): Bounds {
  return bounds(s.map((p) => p.map((pt) => [pt.X / SCALE, pt.Y / SCALE] as [number, number])))
}

/** Serialize a shape to an SVG path `d`, simplified and shifted by (ox, oy). */
export function shapeToPathData(s: Shape, ox: number, oy: number, tolerance = 0.05): string {
  const simplified = ClipperLib.JS.Lighten(ClipperLib.Clipper.CleanPolygons(s, 0.02 * SCALE), tolerance * SCALE)
  const fmt = (n: number) => (Math.round(n * 100) / 100).toString()
  return simplified
    .filter((p) => p.length > 2)
    .map((p) => {
      const pts = p.map((pt) => `${fmt(pt.X / SCALE - ox)} ${fmt(pt.Y / SCALE - oy)}`)
      return `M${pts[0]}L${pts.slice(1).join(' ')}Z`
    })
    .join('')
}
