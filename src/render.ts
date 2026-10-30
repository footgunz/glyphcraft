import type { Font } from 'opentype.js'
import {
  type GlyphTransform,
  type Shape,
  type WarpKind,
  difference,
  extrude,
  offset,
  shapeBounds,
  shapeToPathData,
  textToGlyphPolys,
  toShape,
  translate,
  union,
  warpGroups,
} from './geometry'

/** Internal layout size; every other length setting is relative to this. */
export const FONT_SIZE = 200

export interface Settings {
  text: string
  letterSpacing: number
  lineHeight: number
  align: 'left' | 'center' | 'right'
  scaleX: number
  scaleY: number
  warp: WarpKind
  bend: number // -100..100
  waveFreq: number
  letterOverlap: LetterOverlap
  tiltChars: string // base letters to tilt; accented forms match too (e → é, è, ê, ë)
  tiltAngle: number // degrees, negative = counter-clockwise
  wobble: number // alternating ± tilt on every letter, degrees
  bounce: number // alternating ± baseline shift on every letter, em fraction
  /** Manual adjustments by visible-letter index (whitespace not counted). */
  perLetter: GlyphTransform[]

  faceColor: string
  faceGradient: boolean
  faceColor2: string

  shadeOn: boolean
  shadeSize: number
  shadeColor: string

  outlineOn: boolean
  outlineWidth: number
  outlineColor: string

  extrudeOn: boolean
  extrudeDepth: number
  extrudeAngle: number // degrees, 90 = straight down
  extrudeColor: string

  outerOn: boolean
  outerWidth: number
  outerColor: string

  exportWidth: number
  exportUnit: 'mm' | 'in' | 'px'
  exportMode: ExportMode
  exportGradients: boolean
  previewShaded: boolean
  regMarks: boolean
  weedBox: boolean
  removeSmall: boolean
  minPieceMm: number // pieces/holes smaller across than this are dropped
  pngWidth: number // pixels
  pngTransparent: boolean

  bgColor: string
  bgInExport: boolean
}

export type LetterOverlap = 'rightOnTop' | 'leftOnTop' | 'merge'

export const LETTER_OVERLAPS: { id: LetterOverlap; label: string }[] = [
  { id: 'rightOnTop', label: 'Separate, right on top' },
  { id: 'leftOnTop', label: 'Separate, left on top' },
  { id: 'merge', label: 'Merge touching letters' },
]

export type ExportMode = 'dual' | 'stacked' | 'knockout'

export const EXPORT_MODES: { id: ExportMode; label: string }[] = [
  { id: 'dual', label: 'Dual color (2 vinyl layers)' },
  { id: 'stacked', label: 'Every layer, stacked' },
  { id: 'knockout', label: 'Every layer, knocked out (no overlap)' },
]

/**
 * A style preset sets colors, layer sizes, spacing, letter play and (optionally) the font. Text,
 * background and export settings are left as they are.
 */
export interface Preset {
  id: string
  label: string
  group: string
  /**
   * Fonts to switch to, most preferred first (file names without extension).
   * The first one installed wins, so a private font can fall back to an open one.
   */
  fonts?: string[]
  settings: Partial<Settings>
}

/** Yellow face + blue body, extruded down and slightly left */
export const POCKET_MONSTER_PRESET: Partial<Settings> = {
  letterSpacing: -0.04,
  letterOverlap: 'leftOnTop',
  tiltChars: 'e',
  tiltAngle: -15,
  wobble: 0,
  bounce: 0.03,
  perLetter: [],
  scaleX: 1,
  scaleY: 1,
  // Pinched middle: the end letters come out biggest.
  warp: 'bulge',
  bend: -22,
  faceColor: '#ffcb05',
  faceGradient: false,
  faceColor2: '#f2a900',
  shadeOn: true,
  shadeSize: 3,
  shadeColor: '#e0a100',
  outlineOn: true,
  outlineWidth: 9,
  outlineColor: '#2a75bb',
  extrudeOn: true,
  extrudeDepth: 18,
  extrudeAngle: 110,
  extrudeColor: '#1d4f9a',
  outerOn: true,
  outerWidth: 3,
  outerColor: '#163a78',
}

/** Blocky and level: no warp or letter play, a deep straight-down extrusion. */
const BLOCK_BASE: Partial<Settings> = {
  letterSpacing: 0.02,
  letterOverlap: 'rightOnTop',
  tiltAngle: 0,
  wobble: 0,
  bounce: 0,
  perLetter: [],
  scaleX: 1,
  scaleY: 1,
  warp: 'none',
  bend: 0,
  faceGradient: false,
  shadeOn: true,
  shadeSize: 4,
  outlineOn: true,
  outlineWidth: 7,
  extrudeOn: true,
  extrudeDepth: 20,
  extrudeAngle: 90,
  outerOn: true,
  outerWidth: 3,
}

/** A gentle arc with a little wobble and bounce, and a metallic face gradient. */
const MAGIC_BASE: Partial<Settings> = {
  letterSpacing: 0.01,
  letterOverlap: 'rightOnTop',
  tiltAngle: 0,
  wobble: 3,
  bounce: 0.015,
  perLetter: [],
  scaleX: 1,
  scaleY: 1,
  warp: 'arc',
  bend: 12,
  faceGradient: true,
  shadeOn: true,
  shadeSize: 3,
  outlineOn: true,
  outlineWidth: 8,
  extrudeOn: true,
  extrudeDepth: 14,
  extrudeAngle: 100,
  outerOn: true,
  outerWidth: 3,
}

export const PRESETS: Preset[] = [
  { id: 'pocket-monster', label: 'Pocket Monster', group: 'Video game', fonts: ['pokemonsolid', 'Luckiest Guy'], settings: POCKET_MONSTER_PRESET },
  {
    id: 'block-grass',
    label: 'Block Grass',
    group: 'Video game',
    fonts: ['Minecrafter.Reg', 'Upheaval', 'Press Start 2P'],
    settings: {
      ...BLOCK_BASE,
      faceColor: '#5fb83a',
      faceColor2: '#3f8a24',
      shadeColor: '#3f8a24',
      outlineColor: '#3b3b3b',
      extrudeColor: '#222222',
      outerColor: '#0d0d0d',
    },
  },
  {
    id: 'block-creeper',
    label: 'Block Creeper',
    group: 'Video game',
    fonts: ['Minecrafter.Reg', 'Upheaval', 'Press Start 2P'],
    settings: {
      ...BLOCK_BASE,
      faceColor: '#2e2e2e',
      faceColor2: '#1a1a1a',
      shadeColor: '#1a1a1a',
      outlineColor: '#4fae2e',
      extrudeColor: '#2f6b1b',
      outerColor: '#0d0d0d',
    },
  },
  {
    id: 'eight-bit',
    label: '8-bit console',
    group: 'Video game',
    fonts: ['Pretendo', 'Bungee'],
    // Clean and level: white letters on a bold red body.
    settings: {
      ...BLOCK_BASE,
      letterSpacing: 0.01,
      shadeOn: false,
      outlineWidth: 9,
      extrudeDepth: 12,
      extrudeAngle: 100,
      faceColor: '#ffffff',
      faceColor2: '#e6e6e6',
      shadeColor: '#d9d9d9',
      outlineColor: '#e60012',
      extrudeColor: '#a3000d',
      outerColor: '#5c0007',
    },
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    group: 'Video game',
    fonts: ['Cyberpunk-Regular', 'Audiowide'],
    // Neon cyan on hot magenta, rising to the right with a down-left extrusion.
    settings: {
      ...BLOCK_BASE,
      letterSpacing: 0.03,
      warp: 'rise',
      bend: 10,
      faceGradient: true,
      shadeOn: true,
      // Thinner layers suit the narrow strokes of the Cyberpunk font.
      shadeSize: 2,
      outlineWidth: 5,
      extrudeDepth: 12,
      extrudeAngle: 135,
      outerWidth: 2,
      faceColor: '#00f0ff',
      faceColor2: '#7df9ff',
      shadeColor: '#00a9c4',
      outlineColor: '#ff2bd6',
      extrudeColor: '#6a00a8',
      outerColor: '#12002b',
    },
  },
  {
    id: 'scarlet-lion',
    label: 'Scarlet Lion',
    group: 'Magic',
    fonts: ['Harry P', 'Pirata One'],
    settings: {
      ...MAGIC_BASE,
      faceColor: '#f5c518',
      faceColor2: '#c8941a',
      shadeColor: '#b07d12',
      outlineColor: '#ae0001',
      extrudeColor: '#740001',
      outerColor: '#3a0000',
    },
  },
  {
    id: 'emerald-serpent',
    label: 'Emerald Serpent',
    group: 'Magic',
    fonts: ['Parseltongue', 'Cinzel Decorative'],
    settings: {
      ...MAGIC_BASE,
      faceColor: '#d9dde1',
      faceColor2: '#9aa1a8',
      shadeColor: '#8a9097',
      outlineColor: '#1a472a',
      extrudeColor: '#0f2e1b',
      outerColor: '#06140b',
    },
  },
  {
    id: 'sapphire-raven',
    label: 'Sapphire Raven',
    group: 'Magic',
    fonts: ['MagicSchoolOne', 'MedievalSharp'],
    settings: {
      ...MAGIC_BASE,
      faceColor: '#cd8a46',
      faceColor2: '#8c5a2b',
      shadeColor: '#7a4e25',
      outlineColor: '#222f5b',
      extrudeColor: '#0e1a40',
      outerColor: '#050a1c',
    },
  },
  {
    id: 'honey-badger',
    label: 'Honey Badger',
    group: 'Magic',
    fonts: ['Harry Potter', 'Metamorphous'],
    settings: {
      ...MAGIC_BASE,
      faceColor: '#ffd800',
      faceColor2: '#d9a90f',
      shadeColor: '#b38a1c',
      outlineColor: '#372e29',
      extrudeColor: '#1c1714',
      outerColor: '#000000',
    },
  },
]

export const DEFAULTS: Settings = {
  text: 'Glyphcraft',
  letterSpacing: 0,
  lineHeight: 1.05,
  align: 'center',
  scaleX: 1,
  scaleY: 1,
  warp: 'none',
  bend: 0,
  waveFreq: 1,
  letterOverlap: 'rightOnTop',
  tiltChars: 'e',
  tiltAngle: 0,
  wobble: 0,
  bounce: 0,
  perLetter: [],
  faceColor: '#ffde00',
  faceGradient: false,
  faceColor2: '#f7a600',
  shadeOn: false,
  shadeSize: 4,
  shadeColor: '#c98a00',
  outlineOn: true,
  outlineWidth: 8,
  outlineColor: '#3b5ca8',
  extrudeOn: true,
  extrudeDepth: 14,
  extrudeAngle: 70,
  extrudeColor: '#1c2f63',
  outerOn: false,
  outerWidth: 4,
  outerColor: '#0b1533',
  exportWidth: 300,
  exportUnit: 'mm',
  exportMode: 'dual',
  exportGradients: false,
  previewShaded: true,
  regMarks: true,
  weedBox: true,
  removeSmall: true,
  minPieceMm: 1.5,
  pngWidth: 2400,
  pngTransparent: true,
  bgColor: '#d4d6db', // neutral gray: works under light faces and dark bodies alike
  bgInExport: false,
  ...POCKET_MONSTER_PRESET,
}

export interface Layer {
  id: string
  label: string
  shape: Shape
  color: string
  gradient?: [string, string]
  /** Which of the two vinyl colors this layer belongs to in dual-color mode. */
  vinyl: 'A' | 'B'
}

/** Stacking order of layer ids, bottom-most first. */
const LAYER_ORDER = ['outer', 'extrusion', 'outline', 'face', 'shade']

/** Build the decal layers, bottom-most first. */
export function buildLayers(font: Font, s: Settings): Layer[] {
  const groups = textToGlyphPolys(font, {
    text: s.text,
    fontSize: FONT_SIZE,
    letterSpacing: s.letterSpacing,
    lineHeight: s.lineHeight,
    align: s.align,
    scaleX: s.scaleX,
    scaleY: s.scaleY,
    glyphTransform: (char, i) => {
      const own = s.perLetter[i] ?? {}
      const tilted = s.tiltAngle && s.tiltChars && s.tiltChars.includes(baseLetter(char))
      return {
        rotate: (tilted ? s.tiltAngle : 0) + (i % 2 ? s.wobble : -s.wobble) + (own.rotate ?? 0),
        dx: own.dx ?? 0,
        dy: (i % 2 ? -s.bounce : s.bounce) + (own.dy ?? 0),
        scale: own.scale ?? 1,
      }
    },
  })
  if (groups.length === 0) return []

  const warped = warpGroups(groups, s.warp, s.bend / 100, s.waveFreq)
  if (s.letterOverlap === 'merge') return letterLayers(toShape(warped.flat()), s)

  // Every letter gets its own full outline/extrusion "sticker". Letters later in
  // the list sit on top, so each letter is cut away wherever a later one covers it.
  const faces = warped.map(toShape)
  if (s.letterOverlap === 'leftOnTop') faces.reverse()
  const stacks = faces.map((face) => letterLayers(face, s))
  let cover: Shape = []
  for (let i = stacks.length - 1; i >= 0; i--) {
    const silhouette = union(...stacks[i].map((l) => l.shape))
    if (cover.length) stacks[i] = stacks[i].map((l) => ({ ...l, shape: difference(l.shape, cover) }))
    cover = union(cover, silhouette)
  }

  const layers: Layer[] = []
  for (const id of LAYER_ORDER) {
    const parts = stacks.flatMap((st) => st.filter((l) => l.id === id))
    if (parts.length) layers.push({ ...parts[0], shape: union(...parts.map((p) => p.shape)) })
  }
  return layers
}

/** Strip diacritics so "é" matches "e". */
function baseLetter(char: string): string {
  return char.normalize('NFD').replace(/\p{M}/gu, '')
}

/** The full layer stack for one face shape (a single letter, or all text merged). */
function letterLayers(face: Shape, s: Settings): Layer[] {
  const rad = (s.extrudeAngle * Math.PI) / 180
  const dir = [Math.cos(rad), Math.sin(rad)]

  const outline = s.outlineOn ? offset(face, s.outlineWidth) : face
  const extrusion = s.extrudeOn && s.extrudeDepth > 0 ? extrude(outline, dir[0] * s.extrudeDepth, dir[1] * s.extrudeDepth) : null
  const body = extrusion ? union(outline, extrusion) : outline
  const outer = s.outerOn ? offset(body, s.outerWidth) : null

  const layers: Layer[] = []
  if (outer) layers.push({ id: 'outer', label: 'Outer outline', shape: outer, color: s.outerColor, vinyl: 'B' })
  if (extrusion)
    layers.push({ id: 'extrusion', label: '3D extrusion', shape: extrusion, color: s.extrudeColor, vinyl: 'B' })
  if (s.outlineOn) layers.push({ id: 'outline', label: 'Outline', shape: outline, color: s.outlineColor, vinyl: 'B' })
  layers.push({
    id: 'face',
    label: 'Face',
    shape: face,
    color: s.faceColor,
    gradient: s.faceGradient ? [s.faceColor, s.faceColor2] : undefined,
    vinyl: 'A',
  })
  if (s.shadeOn && s.shadeSize > 0) {
    // Inner bevel along the edges facing the extrusion direction.
    const shifted = translate(face, -dir[0] * s.shadeSize, -dir[1] * s.shadeSize)
    const shade = difference(face, shifted)
    if (shade.length) layers.push({ id: 'shade', label: 'Face shade', shape: shade, color: s.shadeColor, vinyl: 'A' })
  }
  return layers
}

/**
 * Collapse layers into the two vinyl colors: B = everything behind the face as
 * one silhouette (outline color), A = the face on top. Shading layers that only
 * exist for depth in the preview are folded into their vinyl color.
 */
export function dualColor(layers: Layer[]): Layer[] {
  const pick = (v: 'A' | 'B') => layers.filter((l) => l.vinyl === v)
  const a = pick('A')
  const b = pick('B')
  const face = a.find((l) => l.id === 'face')
  const out: Layer[] = []
  if (b.length) {
    const main = b.find((l) => l.id === 'outline') ?? b[b.length - 1]
    out.push({ id: 'color-b', label: 'Color B (body)', shape: union(...b.map((l) => l.shape)), color: main.color, vinyl: 'B' })
  }
  if (face) out.push({ ...face, id: 'color-a', label: 'Color A (face)', shape: union(...a.map((l) => l.shape)) })
  return out
}

/** Layers as they will be written to the exported SVG. */
export function exportLayers(layers: Layer[], mode: ExportMode): Layer[] {
  if (mode === 'dual') return dualColor(layers)
  if (mode === 'knockout') return knockout(layers)
  return layers
}

/** Make layers non-overlapping: each layer minus everything stacked above it. */
export function knockout(layers: Layer[]): Layer[] {
  const out: Layer[] = []
  let above: Shape = []
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]
    out.unshift({ ...l, shape: above.length ? difference(l.shape, above) : l.shape })
    above = union(above, l.shape)
  }
  return out
}

export interface SvgOptions {
  width?: number
  unit?: 'mm' | 'in' | 'px'
  gradients: boolean
  margin?: number
  /** Fill color for a full-size background rectangle on its own bottom layer. */
  background?: string
}

export function layersToSvg(layers: Layer[], o: SvgOptions): string {
  if (layers.length === 0) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"></svg>'
  const margin = o.margin ?? 4
  const b = shapeBounds(union(...layers.map((l) => l.shape)))
  const ox = b.minX - margin
  const oy = b.minY - margin
  const w = b.maxX - b.minX + margin * 2
  const h = b.maxY - b.minY + margin * 2

  let size = ''
  if (o.width && o.unit) {
    const height = (o.width * h) / w
    const r = (n: number) => Math.round(n * 1000) / 1000
    size = ` width="${r(o.width)}${o.unit === 'px' ? '' : o.unit}" height="${r(height)}${o.unit === 'px' ? '' : o.unit}"`
  }

  const defs: string[] = []
  const groups = layers.map((l) => {
    let fill = l.color
    if (o.gradients && l.gradient) {
      const gid = `grad-${l.id}`
      defs.push(
        `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
          `<stop offset="0" stop-color="${l.gradient[0]}"/><stop offset="1" stop-color="${l.gradient[1]}"/>` +
          `</linearGradient>`,
      )
      fill = `url(#${gid})`
    }
    const d = shapeToPathData(l.shape, ox, oy)
    return (
      `<g id="layer-${l.id}" inkscape:groupmode="layer" inkscape:label="${l.label}">` +
      `<path id="${l.id}" d="${d}" fill="${fill}" fill-rule="nonzero"/></g>`
    )
  })

  const r = (n: number) => Math.round(n * 100) / 100
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"` +
    `${size} viewBox="0 0 ${r(w)} ${r(h)}">` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
    (o.background
      ? `<g id="layer-background" inkscape:groupmode="layer" inkscape:label="Background">` +
        `<rect id="background" x="0" y="0" width="${r(w)}" height="${r(h)}" fill="${o.background}"/></g>`
      : '') +
    groups.join('') +
    `</svg>`
  )
}
