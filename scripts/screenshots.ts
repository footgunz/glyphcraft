/**
 * Regenerate the screenshot and animations in docs/assets/.
 *
 *   npm run docs:screenshots [-- name ...]
 *
 * Starts the public build's dev server (open-licensed fonts only, so the images
 * are safe to publish) and drives an installed Chrome or Edge, recording each
 * animation frame by frame into a GIF. Pass shot names to redo only those. Set
 * CHROME_PATH to use a specific browser.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import gifenc from 'gifenc'
import { type Browser, type Page, chromium } from 'playwright-core'
import pngjs from 'pngjs'
import { createServer } from 'vite'

// Both are CommonJS packages.
const { GIFEncoder, applyPalette, quantize } = gifenc
const { PNG } = pngjs

const OUT = 'docs/assets'
const URL = 'http://localhost:5199/'
const ACCENT = '#e5197a'
/** Animations are recorded in a small window so the panel and preview both fit. */
const ANIM_VIEWPORT = { width: 960, height: 540 }

function findBrowser(): string {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/microsoft-edge',
  ]
  const found = candidates.find((p) => p && existsSync(p))
  if (!found) throw new Error('No Chrome or Edge found; set CHROME_PATH.')
  return found
}

// ---------------------------------------------------------------------------
// Driving the app
// ---------------------------------------------------------------------------

/** A fresh page with default settings, counting preview renders. */
async function open(browser: Browser, viewport: { width: number; height: number }, scale = 1): Promise<Page> {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale, colorScheme: 'light' })
  await page.addInitScript(() => {
    localStorage.clear()
    ;(window as any).__renders = 0
    addEventListener('DOMContentLoaded', () =>
      new MutationObserver(() => (window as any).__renders++).observe(document.getElementById('preview')!, {
        childList: true,
        subtree: true,
        attributes: true,
      }),
    )
  })
  await page.goto(URL)
  await page.waitForFunction(() => !!document.querySelector('#preview svg'))
  await page.evaluate(() => document.fonts.ready)
  return page
}

/** Run a change and wait for the preview to redraw (or move on if nothing changed). */
async function apply(page: Page, change: () => Promise<unknown>) {
  const before = await page.evaluate(() => (window as any).__renders)
  await change()
  await page.waitForFunction((n) => (window as any).__renders > n, before, { timeout: 1500 }).catch(() => {})
  await page.waitForTimeout(60)
}

const rowInput = (page: Page, label: string, tag: string) =>
  page
    .locator('#controls .row', { has: page.locator('.label', { hasText: new RegExp(`^${label}$`) }) })
    .locator(tag)
    .first()

function setRange(page: Page, label: string, value: number) {
  return apply(page, () =>
    rowInput(page, label, 'input[type=range]').evaluate((el: HTMLInputElement, v) => {
      el.value = String(v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, value),
  )
}

function choose(page: Page, label: string, value: string) {
  return apply(page, () => rowInput(page, label, 'select').selectOption(value))
}

function click(page: Page, selector: string, text: string) {
  return apply(page, () => page.locator(selector, { hasText: text }).first().click())
}

function setCheck(page: Page, label: string, on: boolean) {
  return apply(page, () => page.locator('#controls label.row', { hasText: label }).locator('input').setChecked(on))
}

/** Scroll the panel so the given section is at the top. */
async function scrollTo(page: Page, title: string) {
  await page.evaluate((title) => {
    const sec = [...document.querySelectorAll('#controls section')].find((s) => s.querySelector('h2')?.textContent?.trim() === title)
    if (!sec) throw new Error(`No section ${title}`)
    const panel = document.getElementById('controls')!
    panel.scrollTop += sec.getBoundingClientRect().top - panel.getBoundingClientRect().top - 8
  }, title)
}

/** Outline the control being changed, so it's easy to follow in the animation. */
async function spotlight(page: Page, selector: string, text: string) {
  await page.evaluate(
    ({ selector, text, accent }) => {
      document.getElementById('shot-spot')?.remove()
      const el = [...document.querySelectorAll<HTMLElement>(selector)].find((e) => e.textContent?.includes(text))
      if (!el) throw new Error(`No element for ${selector} ${text}`)
      const r = el.getBoundingClientRect()
      const box = document.createElement('div')
      box.id = 'shot-spot'
      box.style.cssText =
        `position:fixed;left:${r.left - 4}px;top:${r.top - 3}px;width:${r.width + 8}px;height:${r.height + 6}px;` +
        `border:2px solid ${accent};border-radius:7px;pointer-events:none;z-index:9999`
      document.body.append(box)
    },
    { selector, text, accent: ACCENT },
  )
}

/** Spotlight a panel row by its label. */
const spotRow = (page: Page, label: string) => spotlight(page, '#controls .row', label)

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

class Recorder {
  frames: { rgba: Uint8Array; delay: number }[] = []
  width = 0
  height = 0
  page: Page
  constructor(page: Page) {
    this.page = page
  }

  async frame(delay = 70) {
    const png = PNG.sync.read(await this.page.screenshot())
    this.width = png.width
    this.height = png.height
    this.frames.push({ rgba: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length), delay })
  }

  /** Stay on the last frame a little longer. */
  hold(ms: number) {
    this.frames[this.frames.length - 1].delay += ms
  }

  /**
   * Write a looping GIF. After the first frame only changed pixels are stored
   * (the rest are transparent), which keeps files small since most of the
   * window stays still.
   */
  save(file: string) {
    const gif = GIFEncoder()
    let prev: Uint8Array | null = null
    for (const f of this.frames) {
      const palette = quantize(f.rgba, prev ? 255 : 256)
      const index = applyPalette(f.rgba, palette)
      let transparentIndex = -1
      if (prev) {
        transparentIndex = palette.length
        palette.push([255, 0, 255])
        for (let i = 0; i < index.length; i++) {
          const p = i * 4
          if (f.rgba[p] === prev[p] && f.rgba[p + 1] === prev[p + 1] && f.rgba[p + 2] === prev[p + 2]) index[i] = transparentIndex
        }
      }
      gif.writeFrame(index, this.width, this.height, {
        palette,
        delay: f.delay,
        transparent: transparentIndex >= 0,
        transparentIndex: Math.max(0, transparentIndex),
        dispose: 1,
      })
      prev = f.rgba
    }
    gif.finish()
    writeFileSync(`${OUT}/${file}`, gif.bytes())
    console.log(`  ${file}: ${this.frames.length} frames, ${Math.round(gif.bytes().length / 1024)} KB`)
  }
}

/** Evenly spaced values from a to b, inclusive. */
const steps = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)

// ---------------------------------------------------------------------------
// The shots
// ---------------------------------------------------------------------------

async function overview(browser: Browser) {
  const page = await open(browser, { width: 1280, height: 760 }, 2)
  await page.screenshot({ path: `${OUT}/overview.png` })
  await page.close()
}

/** Click through presets: one click restyles everything. */
async function presets(browser: Browser) {
  const page = await open(browser, ANIM_VIEWPORT)
  const rec = new Recorder(page)
  await rec.frame(1200)
  for (const name of ['Block Grass', '8-bit console', 'Cyberpunk', 'Scarlet Lion', 'Sapphire Raven', 'Pocket Monster']) {
    await spotlight(page, 'button.preset', name)
    await click(page, 'button.preset', name)
    await rec.frame(1300)
  }
  rec.save('presets.gif')
  await page.close()
}

/** Sweep the Bend slider through several warps. */
async function warps(browser: Browser) {
  const page = await open(browser, ANIM_VIEWPORT)
  await scrollTo(page, 'Scale & warp')
  const rec = new Recorder(page)
  const sweeps: [string, number][] = [
    ['arch', 60],
    ['arc', 45],
    ['bulge', -60],
    ['wave', 50],
  ]
  for (const [warp, bend] of sweeps) {
    await spotRow(page, 'Warp')
    await choose(page, 'Warp', warp)
    await setRange(page, 'Bend', 0)
    await rec.frame(500)
    await spotRow(page, 'Bend')
    for (const v of steps(0, bend, 10).slice(1)) {
      await setRange(page, 'Bend', v)
      await rec.frame()
    }
    rec.hold(900)
  }
  rec.save('warps.gif')
  await page.close()
}

/** Squeeze letters together, then compare the overlap modes. */
async function overlaps(browser: Browser) {
  const page = await open(browser, ANIM_VIEWPORT)
  await scrollTo(page, 'Text')
  await choose(page, 'Overlaps', 'rightOnTop')
  await setRange(page, 'Letter spacing', 0.05)
  const rec = new Recorder(page)
  await rec.frame(700)
  await spotRow(page, 'Letter spacing')
  for (const v of steps(0.05, -0.14, 12).slice(1)) {
    await setRange(page, 'Letter spacing', v)
    await rec.frame()
  }
  rec.hold(1000)
  await spotRow(page, 'Overlaps')
  for (const mode of ['leftOnTop', 'merge', 'rightOnTop']) {
    await choose(page, 'Overlaps', mode)
    await rec.frame(1500)
  }
  rec.save('overlaps.gif')
  await page.close()
}

/** Swing the 3D extrusion around. */
async function extrusion(browser: Browser) {
  const page = await open(browser, ANIM_VIEWPORT)
  await scrollTo(page, 'Color B · 3D extrusion')
  await setRange(page, 'Depth', 24)
  await spotRow(page, 'Angle')
  const rec = new Recorder(page)
  for (const a of steps(0, 345, 23)) {
    await setRange(page, 'Angle', a)
    await rec.frame(90)
  }
  rec.save('extrusion.gif')
  await page.close()
}

/** Tilt, wobble and bounce letters for a hand-made look. */
async function letterPlay(browser: Browser) {
  const page = await open(browser, ANIM_VIEWPORT)
  await scrollTo(page, 'Scale & warp')
  await setRange(page, 'Tilt angle', 0)
  await setRange(page, 'Bounce all', 0)
  const rec = new Recorder(page)
  await rec.frame(700)
  const sweep = async (label: string, from: number, to: number, n: number) => {
    await spotRow(page, label)
    for (const v of steps(from, to, n).slice(1)) {
      await setRange(page, label, v)
      await rec.frame()
    }
    rec.hold(700)
  }
  // The default tilts "e", which isn't in the default text.
  await spotRow(page, 'Tilt letters')
  await apply(page, () => rowInput(page, 'Tilt letters', 'input').fill('a'))
  await rec.frame(700)
  await sweep('Tilt angle', 0, -30, 8)
  await sweep('Wobble all', 0, 10, 8)
  await sweep('Bounce all', 0, 0.08, 8)
  rec.save('letter-play.gif')
  await page.close()
}

/** Switch to the cut view, then hide and show each vinyl color. */
async function cutCheck(browser: Browser) {
  const page = await open(browser, ANIM_VIEWPORT)
  await scrollTo(page, 'Export')
  const rec = new Recorder(page)
  await rec.frame(1000)
  await spotlight(page, '#controls label.row', 'Preview shaded 3D')
  await setCheck(page, 'Preview shaded 3D', false)
  await rec.frame(1600)
  for (const chip of ['Color B', 'Color A']) {
    await spotlight(page, '#layers .chip', chip)
    await click(page, '#layers .chip', chip)
    await rec.frame(1300)
    await click(page, '#layers .chip', chip)
    await rec.frame(800)
  }
  await spotlight(page, '#controls label.row', 'Preview shaded 3D')
  await setCheck(page, 'Preview shaded 3D', true)
  await rec.frame(1200)
  rec.save('cut-check.gif')
  await page.close()
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const server = await createServer({ mode: 'public', server: { port: 5199, strictPort: true }, logLevel: 'warn' })
  await server.listen()
  const browser = await chromium.launch({ executablePath: findBrowser() })
  try {
    const only = process.argv.slice(2)
    const shots = { overview, presets, warps, overlaps, extrusion, letterPlay, cutCheck }
    for (const [name, shot] of Object.entries(shots)) if (!only.length || only.includes(name)) await shot(browser)
  } finally {
    await browser.close()
    await server.close()
  }
  console.log(`Written to ${OUT}/`)
}

await main()
