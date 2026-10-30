import { parse, type Font } from 'opentype.js'
import './style.css'
import { prepareForCutting, toMm } from './cutting'
import { WARPS, type GlyphTransform } from './geometry'
import {
  DEFAULTS,
  EXPORT_MODES,
  LETTER_OVERLAPS,
  PRESETS,
  type Layer,
  type Preset,
  type Settings,
  buildLayers,
  exportLayers,
  layersToSvg,
} from './render'

// ---------------------------------------------------------------------------
// Fonts: everything in src/fonts (open-licensed, always bundled) and
// src/fonts-private (personal use, left out of `npm run build:public`) is
// listed automatically; more can be uploaded for the session.
// ---------------------------------------------------------------------------

const openFonts = import.meta.glob('./fonts/*.{ttf,otf,woff,TTF,OTF,WOFF}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

// Lazy glob inside a branch that is constant-folded away in the public build,
// so private font files never make it into that bundle.
const privateFonts = (
  import.meta.env.MODE === 'public'
    ? {}
    : import.meta.glob('./fonts-private/*.{ttf,otf,woff,TTF,OTF,WOFF}', { query: '?url', import: 'default' })
) as Record<string, () => Promise<string>>

// License files that ship with the fonts, named "<font name>-<anything>.txt".
const openLicenses = import.meta.glob('./fonts/licenses/*.txt', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>
const privateLicenses = (
  import.meta.env.MODE === 'public'
    ? {}
    : import.meta.glob('./fonts-private/licenses/*.txt', { query: '?raw', import: 'default' })
) as Record<string, () => Promise<string>>

/** Bundled license text by font name. */
const licenseTexts = new Map<string, string>()

async function loadLicenses() {
  const fontOf = (path: string) => path.split('/').pop()!.replace(/-[^-]*\.txt$/i, '')
  for (const [path, text] of Object.entries(openLicenses)) licenseTexts.set(fontOf(path), text)
  for (const [path, load] of Object.entries(privateLicenses)) licenseTexts.set(fontOf(path), await load())
}

type FontKind = 'open' | 'private' | 'added'

const FONT_GROUPS: { kind: FontKind; label: string }[] = [
  { kind: 'private', label: 'Your fonts (personal use)' },
  { kind: 'open', label: 'Open-licensed (OK to share)' },
  { kind: 'added', label: 'Added this session' },
]

/** Fonts to start with, most preferred first; the first one installed is used. */
const DEFAULT_FONTS = ['pokemonsolid', 'Luckiest Guy']

const fonts = new Map<string, Font>()
const fontKinds = new Map<string, FontKind>()
let fontName = ''

const firstInstalled = (names: string[] | undefined) => names?.find((n) => fonts.has(n))

async function loadBundledFonts() {
  const fileName = (path: string) => path.split('/').pop()!.replace(/\.\w+$/, '')
  const entries = [
    ...Object.entries(openFonts).map(([path, url]) => ({ name: fileName(path), kind: 'open' as const, url: async () => url })),
    ...Object.entries(privateFonts).map(([path, url]) => ({ name: fileName(path), kind: 'private' as const, url })),
  ]
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  const failed: string[] = []
  for (const { name, kind, url } of entries) {
    // One unreadable font file should not take the whole app down.
    try {
      fonts.set(name, parse(await (await fetch(await url())).arrayBuffer()))
      fontKinds.set(name, kind)
    } catch (err) {
      console.warn(`Skipping font ${name}:`, err)
      failed.push(name)
    }
  }
  return failed
}

// ---------------------------------------------------------------------------
// Settings persistence (per-browser convenience only)
// ---------------------------------------------------------------------------

const STORE_KEY = 'glyphcraft.settings'
function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null')
    if (saved) return { ...DEFAULTS, ...saved }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS }
}
function saveSettings() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...settings, fontName }))
  } catch {
    /* ignore */
  }
}

let settings = loadSettings()

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

type Control =
  | { kind: 'textarea'; key: keyof Settings; label: string }
  | { kind: 'text'; key: keyof Settings; label: string }
  | { kind: 'range'; key: keyof Settings; label: string; min: number; max: number; step: number; show?: () => boolean }
  | { kind: 'select'; key: keyof Settings; label: string; options: { id: string; label: string }[]; show?: () => boolean }
  | { kind: 'color'; key: keyof Settings; label: string; show?: () => boolean }
  | { kind: 'check'; key: keyof Settings; label: string }
  | { kind: 'number'; key: keyof Settings; label: string; min: number; step: number }

interface Section {
  title: string
  toggle?: keyof Settings
  controls: Control[]
}

const sections: Section[] = [
  {
    title: 'Text',
    controls: [
      { kind: 'textarea', key: 'text', label: 'Text' },
      {
        kind: 'select',
        key: 'align',
        label: 'Align',
        options: [
          { id: 'left', label: 'Left' },
          { id: 'center', label: 'Center' },
          { id: 'right', label: 'Right' },
        ],
      },
      { kind: 'range', key: 'letterSpacing', label: 'Letter spacing', min: -0.2, max: 0.5, step: 0.005 },
      { kind: 'range', key: 'lineHeight', label: 'Line height', min: 0.6, max: 2, step: 0.01 },
      { kind: 'select', key: 'letterOverlap', label: 'Overlaps', options: LETTER_OVERLAPS },
    ],
  },
  {
    title: 'Scale & warp',
    controls: [
      { kind: 'range', key: 'scaleX', label: 'Width', min: 0.3, max: 2.5, step: 0.01 },
      { kind: 'range', key: 'scaleY', label: 'Height', min: 0.3, max: 2.5, step: 0.01 },
      { kind: 'text', key: 'tiltChars', label: 'Tilt letters' },
      { kind: 'range', key: 'tiltAngle', label: 'Tilt angle', min: -45, max: 45, step: 1 },
      { kind: 'range', key: 'wobble', label: 'Wobble all', min: 0, max: 20, step: 0.5 },
      { kind: 'range', key: 'bounce', label: 'Bounce all', min: 0, max: 0.2, step: 0.005 },
      { kind: 'select', key: 'warp', label: 'Warp', options: WARPS },
      { kind: 'range', key: 'bend', label: 'Bend', min: -100, max: 100, step: 1, show: () => settings.warp !== 'none' },
      { kind: 'range', key: 'waveFreq', label: 'Waves', min: 0.5, max: 4, step: 0.25, show: () => settings.warp === 'wave' },
    ],
  },
  {
    title: 'Color A · Face',
    controls: [
      { kind: 'color', key: 'faceColor', label: 'Face' },
      { kind: 'check', key: 'faceGradient', label: 'Gradient (preview / print only)' },
      { kind: 'color', key: 'faceColor2', label: 'Gradient end', show: () => settings.faceGradient },
      { kind: 'check', key: 'shadeOn', label: 'Inner bevel shade' },
      { kind: 'range', key: 'shadeSize', label: 'Bevel size', min: 0.5, max: 12, step: 0.5, show: () => settings.shadeOn },
      { kind: 'color', key: 'shadeColor', label: 'Bevel color', show: () => settings.shadeOn },
    ],
  },
  {
    title: 'Color B · Outline',
    toggle: 'outlineOn',
    controls: [
      { kind: 'range', key: 'outlineWidth', label: 'Thickness', min: 0.5, max: 40, step: 0.5 },
      { kind: 'color', key: 'outlineColor', label: 'Color' },
    ],
  },
  {
    title: 'Color B · 3D extrusion',
    toggle: 'extrudeOn',
    controls: [
      { kind: 'range', key: 'extrudeDepth', label: 'Depth', min: 0, max: 80, step: 0.5 },
      { kind: 'range', key: 'extrudeAngle', label: 'Angle', min: 0, max: 359, step: 1 },
      { kind: 'color', key: 'extrudeColor', label: 'Shade' },
    ],
  },
  {
    title: 'Color B · Outer edge',
    toggle: 'outerOn',
    controls: [
      { kind: 'range', key: 'outerWidth', label: 'Thickness', min: 0.5, max: 30, step: 0.5 },
      { kind: 'color', key: 'outerColor', label: 'Shade' },
    ],
  },
  {
    title: 'Background',
    controls: [
      { kind: 'color', key: 'bgColor', label: 'Color' },
      { kind: 'check', key: 'bgInExport', label: 'Include background in SVG (adds a rectangle layer)' },
    ],
  },
  {
    title: 'Export',
    controls: [
      { kind: 'select', key: 'exportMode', label: 'Layers', options: EXPORT_MODES },
      { kind: 'number', key: 'exportWidth', label: 'Width', min: 1, step: 1 },
      {
        kind: 'select',
        key: 'exportUnit',
        label: 'Unit',
        options: [
          { id: 'mm', label: 'mm' },
          { id: 'in', label: 'inches' },
          { id: 'px', label: 'px' },
        ],
      },
      { kind: 'check', key: 'regMarks', label: 'Registration marks on every color' },
      { kind: 'check', key: 'weedBox', label: 'Weeding box around each color' },
      { kind: 'check', key: 'removeSmall', label: 'Remove pieces too small to weed' },
      {
        kind: 'range',
        key: 'minPieceMm',
        label: 'Smallest piece (mm)',
        min: 0.5,
        max: 6,
        step: 0.25,
        show: () => settings.removeSmall,
      },
      { kind: 'check', key: 'exportGradients', label: 'Include gradients in SVG' },
      { kind: 'check', key: 'previewShaded', label: 'Preview shaded 3D (off = exactly what is cut)' },
    ],
  },
  {
    title: 'PNG image',
    controls: [
      { kind: 'number', key: 'pngWidth', label: 'Width (px)', min: 100, step: 100 },
      { kind: 'check', key: 'pngTransparent', label: 'Transparent background' },
    ],
  },
]

const controlsEl = document.getElementById('controls')!
const refreshers: (() => void)[] = []

function buildControls() {
  controlsEl.innerHTML = ''
  refreshers.length = 0

  const head = document.createElement('div')
  head.className = 'brand'
  head.innerHTML = `<h1>Glyphcraft</h1>`
  controlsEl.append(head)
  presetSection()

  // Font picker: the list gets the full panel width; "Add font…" sits on the
  // line below, next to the font details.
  const sel = document.createElement('select')
  sel.className = 'font-select'
  // Group the list by license so it is clear which fonts are safe to share.
  for (const g of FONT_GROUPS) {
    const names = [...fonts.keys()].filter((n) => (fontKinds.get(n) ?? 'added') === g.kind)
    if (!names.length) continue
    const group = document.createElement('optgroup')
    group.label = g.label
    for (const name of names) group.append(new Option(name, name))
    sel.append(group)
  }
  sel.value = fontName
  sel.addEventListener('change', () => {
    fontName = sel.value
    schedule()
  })
  const upload = document.createElement('label')
  upload.className = 'upload'
  upload.innerHTML = `<input type="file" accept=".ttf,.otf,.woff" hidden />Add font…`
  upload.querySelector('input')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    try {
      const name = file.name.replace(/\.\w+$/, '')
      fonts.set(name, parse(await file.arrayBuffer()))
      if (!fontKinds.has(name)) fontKinds.set(name, 'added')
      fontName = name
      buildControls()
      schedule()
    } catch (err) {
      setStatus(`Could not read font: ${(err as Error).message}`, true)
    }
  })
  const fontSection = section('Font')
  const info = document.createElement('details')
  info.className = 'font-info'
  const showInfo = () => renderFontInfo(info, fontName)
  sel.addEventListener('change', showInfo)
  showInfo()
  const tools = document.createElement('div')
  tools.className = 'font-tools'
  tools.append(info, upload)
  fontSection.append(sel, tools)

  for (const s of sections) {
    const sec = section(s.title, s.toggle)
    for (const c of s.controls) sec.append(control(c))
    if (s.title === 'Scale & warp') perLetterSection()
  }
  refresh()
}

/** Name-table fields worth showing, in display order. */
const FONT_INFO_FIELDS: [key: string, label: string][] = [
  ['fontFamily', 'Family'],
  ['designer', 'Designer'],
  ['manufacturer', 'Maker'],
  ['copyright', 'Copyright'],
  ['trademark', 'Trademark'],
  ['license', 'License'],
  ['licenseURL', 'License URL'],
  ['designerURL', 'Designer URL'],
  ['manufacturerURL', 'Maker URL'],
  ['description', 'Notes'],
]

/** Read one name-table entry, preferring English, from opentype.js 1.x or 2.x name layouts. */
function readNameField(font: Font, key: string): string | undefined {
  type Localized = Record<string, string>
  const names = font.names as unknown as Record<string, Record<string, Localized> | Localized>
  const tables = [names.windows, names.unicode, names.macintosh, names] as (Record<string, Localized> | undefined)[]
  for (const t of tables) {
    const entry = t?.[key]
    if (entry && typeof entry === 'object') {
      const v = entry.en ?? Object.values(entry)[0]
      if (v && v.trim()) return v.trim()
    }
  }
  return undefined
}

/**
 * Fill a collapsible box with the details (copyright, license, links) embedded
 * in the font, plus the license file bundled with it, if any.
 */
function renderFontInfo(box: HTMLDetailsElement, name: string) {
  box.replaceChildren()
  const summary = document.createElement('summary')
  summary.textContent = 'About this font'
  box.append(summary)
  const font = fonts.get(name)
  if (!font) return
  const rows = FONT_INFO_FIELDS.map(([key, label]) => [label, readNameField(font, key)] as const).filter(
    (r): r is readonly [string, string] => !!r[1],
  )
  const dl = document.createElement('dl')
  for (const [label, value] of rows) {
    const dt = document.createElement('dt')
    dt.textContent = label
    const dd = document.createElement('dd')
    if (/^https?:\/\/\S+$/i.test(value)) {
      const a = document.createElement('a')
      a.href = value
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.textContent = value
      dd.append(a)
    } else {
      dd.textContent = value
    }
    dl.append(dt, dd)
  }
  if (!rows.length) {
    const p = document.createElement('p')
    p.textContent = 'This font has no copyright or license information inside it.'
    box.append(p)
  } else box.append(dl)
  const license = licenseTexts.get(name)
  if (license) {
    const file = document.createElement('details')
    file.className = 'license-file'
    const s = document.createElement('summary')
    s.textContent = 'License file'
    const pre = document.createElement('pre')
    pre.textContent = license
    file.append(s, pre)
    box.append(file)
  }
  const note = document.createElement('p')
  note.className = 'muted'
  note.textContent = "Check the font's license before sharing or selling."
  box.append(note)
}

/** Buttons that apply a style preset, grouped, each with a face/body swatch. */
function presetSection() {
  const sec = section('Presets')
  const groups = [...new Set(PRESETS.map((p) => p.group))]
  for (const g of groups) {
    const label = document.createElement('div')
    label.className = 'preset-group'
    label.textContent = g
    const wrap = document.createElement('div')
    wrap.className = 'presets'
    for (const p of PRESETS.filter((p) => p.group === g)) {
      const b = document.createElement('button')
      b.className = 'preset'
      b.title =
        `Apply the ${p.label} colors and spacing` +
        (p.fonts?.length ? ` with the ${p.fonts.join(' font, or else ')} font` : '') +
        ' (keeps text, background and export settings)'
      const sw = document.createElement('i')
      sw.style.background = p.settings.faceColor ?? '#fff'
      sw.style.borderColor = p.settings.outlineColor ?? '#000'
      b.append(sw, p.label)
      b.addEventListener('click', () => applyPreset(p))
      wrap.append(b)
    }
    sec.append(label, wrap)
  }
}

/** Settings a preset never touches. */
const KEPT_ON_PRESET: (keyof Settings)[] = [
  'text',
  'bgColor',
  'bgInExport',
  'exportWidth',
  'exportUnit',
  'exportMode',
  'exportGradients',
  'previewShaded',
  'regMarks',
  'weedBox',
  'removeSmall',
  'minPieceMm',
  'pngWidth',
  'pngTransparent',
]

function applyPreset(p: Preset) {
  const kept = Object.fromEntries(KEPT_ON_PRESET.map((k) => [k, settings[k]]))
  settings = { ...DEFAULTS, ...p.settings, ...kept }
  fontName = firstInstalled(p.fonts) ?? fontName
  buildControls()
  schedule()
}

/** One row per visible letter: rotate, raise and size. Rebuilt when the text changes. */
function perLetterSection() {
  const sec = section('Per letter')
  const list = document.createElement('div')
  list.className = 'letters'
  const reset = document.createElement('button')
  reset.textContent = 'Reset all letters'
  reset.addEventListener('click', () => {
    settings.perLetter = []
    lastLetters = ''
    refresh()
    schedule()
  })
  sec.append(list, reset)

  let lastLetters = ''
  const update = (i: number, patch: GlyphTransform) => {
    const next = [...settings.perLetter]
    for (let k = next.length; k <= i; k++) next[k] = {}
    next[i] = { ...next[i], ...patch }
    settings.perLetter = next
    schedule()
  }
  const field = (title: string, value: number, step: number, onChange: (v: number) => void) => {
    const i = document.createElement('input')
    i.type = 'number'
    i.step = String(step)
    i.value = String(value)
    i.title = title
    i.addEventListener('input', () => {
      const v = parseFloat(i.value)
      if (!Number.isNaN(v)) onChange(v)
    })
    return i
  }

  refreshers.push(() => {
    // Whitespace has no outline, so it does not get an index.
    const letters = Array.from(settings.text).filter((c) => !/\s/.test(c))
    const key = letters.join('')
    if (key === lastLetters) return
    lastLetters = key
    list.innerHTML = `<div class="letter head"><span></span><span>Rotate °</span><span>Shift %</span><span>Raise %</span><span>Size %</span></div>`
    letters.forEach((ch, i) => {
      const t = settings.perLetter[i] ?? {}
      const r = document.createElement('div')
      r.className = 'letter'
      const label = document.createElement('b')
      label.textContent = ch
      r.append(
        label,
        field('Rotate (degrees, clockwise)', t.rotate ?? 0, 1, (v) => update(i, { rotate: v })),
        field('Shift right (% of font size, negative = left)', Math.round((t.dx ?? 0) * 100), 1, (v) =>
          update(i, { dx: v / 100 }),
        ),
        field('Raise (% of font size)', -Math.round((t.dy ?? 0) * 100), 1, (v) => update(i, { dy: -v / 100 })),
        field('Size (%)', Math.round((t.scale ?? 1) * 100), 5, (v) => v > 0 && update(i, { scale: v / 100 })),
      )
      list.append(r)
    })
  })
}

function section(title: string, toggle?: keyof Settings): HTMLElement {
  const sec = document.createElement('section')
  const h = document.createElement('h2')
  if (toggle) {
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = settings[toggle] as boolean
    cb.addEventListener('change', () => {
      ;(settings as any)[toggle] = cb.checked
      sec.classList.toggle('off', !cb.checked)
      schedule()
    })
    sec.classList.toggle('off', !cb.checked)
    const l = document.createElement('label')
    l.append(cb, title)
    h.append(l)
  } else {
    h.textContent = title
  }
  sec.append(h)
  controlsEl.append(sec)
  return sec
}

function row(label: string): HTMLElement {
  const r = document.createElement('div')
  r.className = 'row'
  const l = document.createElement('span')
  l.className = 'label'
  l.textContent = label
  r.append(l)
  return r
}

function control(c: Control): HTMLElement {
  const set = (v: unknown) => {
    ;(settings as any)[c.key] = v
    refresh()
    schedule()
  }
  if (c.kind === 'check') {
    const r = document.createElement('label')
    r.className = 'row check'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = settings[c.key] as boolean
    cb.addEventListener('change', () => set(cb.checked))
    r.append(cb, c.label)
    return r
  }
  const r = row(c.label)
  if (c.kind === 'textarea') {
    r.classList.add('stack')
    const t = document.createElement('textarea')
    t.rows = 2
    t.value = settings.text
    t.addEventListener('input', () => set(t.value))
    r.append(t)
  } else if (c.kind === 'text') {
    const t = document.createElement('input')
    t.type = 'text'
    t.value = String(settings[c.key])
    t.placeholder = 'e.g. e'
    t.addEventListener('input', () => set(t.value))
    r.append(t)
  } else if (c.kind === 'select') {
    const sel = document.createElement('select')
    for (const o of c.options) sel.add(new Option(o.label, o.id))
    sel.value = String(settings[c.key])
    sel.addEventListener('change', () => set(sel.value))
    r.append(sel)
  } else if (c.kind === 'color') {
    const i = document.createElement('input')
    i.type = 'color'
    i.value = String(settings[c.key])
    i.addEventListener('input', () => set(i.value))
    const hex = document.createElement('code')
    hex.textContent = i.value
    i.addEventListener('input', () => (hex.textContent = i.value))
    r.append(i, hex)
  } else if (c.kind === 'number') {
    const i = document.createElement('input')
    i.type = 'number'
    i.min = String(c.min)
    i.step = String(c.step)
    i.value = String(settings[c.key])
    i.addEventListener('input', () => {
      const v = parseFloat(i.value)
      if (v > 0) set(v)
    })
    r.append(i)
  } else if (c.kind === 'range') {
    const i = document.createElement('input')
    i.type = 'range'
    i.min = String(c.min)
    i.max = String(c.max)
    i.step = String(c.step)
    i.value = String(settings[c.key])
    const out = document.createElement('output')
    const fmt = () => (out.textContent = String(Math.round(parseFloat(i.value) * 1000) / 1000))
    fmt()
    i.addEventListener('input', () => {
      fmt()
      set(parseFloat(i.value))
    })
    // Double-click resets to the default value.
    i.addEventListener('dblclick', () => {
      i.value = String(DEFAULTS[c.key])
      fmt()
      set(DEFAULTS[c.key])
    })
    r.append(i, out)
  }
  if ('show' in c && c.show) {
    const show = c.show
    refreshers.push(() => (r.hidden = !show()))
  }
  return r
}

function refresh() {
  for (const f of refreshers) f()
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

const canvasEl = document.getElementById('canvas')!
const previewEl = document.getElementById('preview')!
const layersEl = document.getElementById('layers')!
const statusEl = document.getElementById('status')!
let layers: Layer[] = []
let exportSvg = ''
let pending = 0

const REMOVED_COLOR = '#ff2d55'

/** Cut layers hidden in the preview (preview only; the export always has every layer). */
const hidden = new Set<string>()

/**
 * Hide preview layers for the toggled-off chips. The SVG keeps its size and
 * position, so the remaining layers stay exactly in place. In the shaded
 * preview a dual-color chip hides every shading layer that belongs to it.
 */
function applyVisibility() {
  const dual = settings.exportMode === 'dual'
  const shownLayers = settings.previewShaded ? layers : []
  previewEl.querySelectorAll<SVGGElement>('g[id^="layer-"]').forEach((g) => {
    const id = g.id.slice('layer-'.length)
    const owner = shownLayers.find((l) => l.id === id)
    const key = owner && dual ? (owner.vinyl === 'A' ? 'color-a' : 'color-b') : id
    g.style.display = hidden.has(key) ? 'none' : ''
  })
  layersEl.querySelectorAll<HTMLElement>('[data-layer]').forEach((c) => {
    c.classList.toggle('off', hidden.has(c.dataset.layer!))
  })
}

layersEl.addEventListener('click', (e) => {
  const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-layer]')
  if (!chip) return
  const id = chip.dataset.layer!
  if (hidden.has(id)) hidden.delete(id)
  else hidden.add(id)
  applyVisibility()
})

function setStatus(msg: string, error = false) {
  statusEl.textContent = msg
  statusEl.classList.toggle('error', error)
}

function schedule() {
  saveSettings()
  cancelAnimationFrame(pending)
  pending = requestAnimationFrame(render)
}

function render() {
  const font = fonts.get(fontName)
  if (!font) return
  const t0 = performance.now()
  try {
    layers = buildLayers(font, settings)
  } catch (err) {
    setStatus(`Render failed: ${(err as Error).message}`, true)
    return
  }
  const cut = prepareForCutting(exportLayers(layers, settings.exportMode), {
    widthMm: toMm(settings.exportWidth, settings.exportUnit),
    regMarks: settings.regMarks,
    weedBox: settings.weedBox,
    removeSmall: settings.removeSmall,
    minPieceMm: settings.minPieceMm,
  })
  const out = cut.layers
  exportSvg = layersToSvg(out, {
    width: settings.exportWidth,
    unit: settings.exportUnit,
    gradients: settings.exportGradients,
    background: settings.bgInExport ? settings.bgColor : undefined,
    margin: cut.margin,
  })

  canvasEl.style.background = settings.bgColor
  // The cut preview marks pieces dropped as too small in red so the setting's effect is visible.
  const removedMarker: Layer[] = cut.removed.length
    ? [{ id: 'removed', label: 'Removed (too small)', shape: cut.removed, color: REMOVED_COLOR, vinyl: 'A' }]
    : []
  previewEl.innerHTML = settings.previewShaded
    ? layersToSvg(layers, { gradients: true })
    : layersToSvg([...out, ...removedMarker], { gradients: settings.exportGradients, margin: cut.margin })

  const chips = out.map(
    (l) =>
      `<button class="chip" data-layer="${l.id}" title="Show / hide this layer in the preview">` +
      `<i style="background:${l.color}"></i>${l.label}</button>`,
  )
  if (settings.bgInExport) chips.unshift(`<span class="chip"><i style="background:${settings.bgColor}"></i>Background</span>`)
  layersEl.innerHTML = chips.join('')
  applyVisibility()
  const kb = (new Blob([exportSvg]).size / 1024).toFixed(0)
  const n = cut.removedCount
  const removedNote = settings.removeSmall
    ? ` · ${n ? `${n} tiny piece${n === 1 ? '' : 's'} removed${settings.previewShaded ? '' : ' (red)'}` : 'no tiny pieces'}`
    : ''
  setStatus(
    `${out.length} cut layer${out.length === 1 ? '' : 's'}${removedNote} · ${kb} KB · ${settings.exportWidth} ${settings.exportUnit} wide · ${Math.round(performance.now() - t0)} ms`,
  )
}

function fileName(ext: 'svg' | 'png') {
  const base = settings.text.trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 40) || 'text'
  return `${base}.${ext}`
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

document.getElementById('download')!.addEventListener('click', () => {
  saveBlob(new Blob([exportSvg], { type: 'image/svg+xml' }), fileName('svg'))
})

/**
 * Rasterize what the preview shows (shaded or cut view, with any hidden layers
 * left out, without the red removed-piece markers) at the chosen pixel width.
 */
async function renderPng(): Promise<Blob> {
  const src = previewEl.querySelector('svg')
  if (!src) throw new Error('Nothing to export')
  const svg = src.cloneNode(true) as SVGSVGElement
  svg.querySelector('#layer-removed')?.remove()
  const [, , vw, vh] = svg.getAttribute('viewBox')!.split(' ').map(Number)
  const width = Math.max(1, Math.round(settings.pngWidth))
  const height = Math.max(1, Math.round((width * vh) / vw))
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))

  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg))
  await img.decode()

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  if (!settings.pngTransparent) {
    ctx.fillStyle = settings.bgColor
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(img, 0, 0, width, height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
  )
}

document.getElementById('download-png')!.addEventListener('click', async () => {
  try {
    saveBlob(await renderPng(), fileName('png'))
  } catch (err) {
    setStatus(`PNG export failed: ${(err as Error).message}`, true)
  }
})

document.getElementById('copy')!.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(exportSvg)
    setStatus('SVG copied to clipboard')
  } catch {
    setStatus('Clipboard not available', true)
  }
})

// ---------------------------------------------------------------------------

const [failedFonts] = await Promise.all([loadBundledFonts(), loadLicenses()])
const savedFont = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}').fontName as string | undefined
  } catch {
    return undefined
  }
})()
fontName =
  savedFont && fonts.has(savedFont)
    ? savedFont
    : (firstInstalled(DEFAULT_FONTS) ?? fonts.keys().next().value ?? '')
if (!fontName) setStatus('No fonts found in src/fonts — add one with "Add font…"', true)
buildControls()
schedule()
if (failedFonts.length) setTimeout(() => setStatus(`Could not read font(s): ${failedFonts.join(', ')}`, true), 500)
