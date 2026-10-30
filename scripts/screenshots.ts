/**
 * Regenerate the annotated screenshots in docs/assets/.
 *
 *   npm run docs:screenshots
 *
 * Starts the public build's dev server (open-licensed fonts only, so the images
 * are safe to publish) and drives an installed Chrome or Edge. Set CHROME_PATH
 * to use a specific browser.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { type Page, chromium } from 'playwright-core'
import { createServer } from 'vite'

const OUT = 'docs/assets'
const ACCENT = '#e5197a'

/** A highlight: a CSS selector, or a section title / row label to look up in the panel. */
type Target = { css: string } | { section: string } | { row: string; in?: string } | { button: string }
interface Mark {
  target: Target
  /** Stretch one box from `target` down to this element, to group related rows. */
  to?: Target
  /** Box every match of a CSS target, not just the first; the badge goes on the first. */
  all?: boolean
  /** Number shown in the badge; omit for a plain outline. */
  n?: number
}

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

/** Draw outlines and numbered badges over the targets. Runs in the page. */
async function annotate(page: Page, marks: Mark[]) {
  await page.evaluate(
    ({ marks, accent }) => {
      document.getElementById('shot-overlay')?.remove()
      const overlay = document.createElement('div')
      overlay.id = 'shot-overlay'
      overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999'
      document.body.append(overlay)

      const sections = [...document.querySelectorAll<HTMLElement>('#controls section')]
      const sectionByTitle = (t: string) => sections.find((s) => s.querySelector('h2')?.textContent?.trim() === t)
      const find = (t: any): HTMLElement | null => {
        if (t.css) return document.querySelector<HTMLElement>(t.css)
        if (t.section) return sectionByTitle(t.section) ?? null
        if (t.button) return [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.trim() === t.button) ?? null
        const scope = t.in ? sectionByTitle(t.in) : document.getElementById('controls')
        const rows = [...(scope?.querySelectorAll<HTMLElement>('.row') ?? [])]
        return rows.find((r) => (r.querySelector('.label')?.textContent ?? r.textContent)?.trim() === t.row) ?? null
      }

      const PAD = 5
      const draw = (r: { left: number; top: number; right: number; bottom: number }, n?: number) => {
        const box = document.createElement('div')
        box.style.cssText =
          `position:absolute;left:${r.left - PAD}px;top:${r.top - PAD}px;` +
          `width:${r.right - r.left + 2 * PAD}px;height:${r.bottom - r.top + 2 * PAD}px;` +
          `border:2.5px solid ${accent};border-radius:7px;box-sizing:border-box;box-shadow:0 0 0 2px #fff8`
        overlay.append(box)
        if (n === undefined) return
        const badge = document.createElement('div')
        badge.textContent = String(n)
        badge.style.cssText =
          `position:absolute;left:${Math.max(2, r.left - PAD - 11)}px;top:${Math.max(2, r.top - PAD - 11)}px;` +
          `width:22px;height:22px;border-radius:50%;background:${accent};color:#fff;` +
          `font:bold 13px/22px system-ui,sans-serif;text-align:center;box-shadow:0 1px 3px #0006`
        overlay.append(badge)
      }

      for (const m of marks) {
        const els = m.all ? [...document.querySelectorAll<HTMLElement>((m.target as any).css)] : [find(m.target)]
        if (!els.length || els.some((e) => !e)) throw new Error(`No element for ${JSON.stringify(m.target)}`)
        els.forEach((el, i) => {
          const r = el!.getBoundingClientRect()
          const end = m.to ? find(m.to) : null
          if (m.to && !end) throw new Error(`No element for ${JSON.stringify(m.to)}`)
          const e = end?.getBoundingClientRect() ?? r
          draw(
            { left: Math.min(r.left, e.left), top: r.top, right: Math.max(r.right, e.right), bottom: e.bottom },
            i === 0 ? m.n : undefined,
          )
        })
      }
    },
    { marks, accent: ACCENT },
  )
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

/** Screenshot the panel area from the top of one section to the bottom of another. */
async function panelShot(page: Page, file: string, from: string, to: string) {
  const clip = await page.evaluate(
    ({ from, to }) => {
      const secs = [...document.querySelectorAll('#controls section')]
      const get = (t: string) => secs.find((s) => s.querySelector('h2')?.textContent?.trim() === t)!.getBoundingClientRect()
      const panel = document.getElementById('controls')!.getBoundingClientRect()
      const top = Math.max(panel.top, get(from).top - 2)
      const bottom = Math.min(panel.bottom, get(to).bottom + 6)
      return { x: panel.left, y: top, width: panel.width, height: bottom - top }
    },
    { from, to },
  )
  await page.screenshot({ path: `${OUT}/${file}`, clip })
}

/** Set a select-type control by its row label. */
async function choose(page: Page, label: string, value: string) {
  await page.locator('#controls .row', { has: page.locator('.label', { hasText: new RegExp(`^${label}$`) }) }).locator('select').selectOption(value)
}

async function check(page: Page, label: string, on: boolean) {
  await page.locator('#controls label.row', { hasText: label }).locator('input').setChecked(on)
}

/** Wait until the preview has re-rendered after a settings change. */
async function settle(page: Page) {
  await page.waitForTimeout(400)
  await page.waitForFunction(() => !!document.querySelector('#preview svg'))
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const server = await createServer({ mode: 'public', server: { port: 5199, strictPort: true }, logLevel: 'warn' })
  await server.listen()
  const browser = await chromium.launch({ executablePath: findBrowser() })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2, colorScheme: 'light' })
    await page.goto('http://localhost:5199/')
    await settle(page)
    await page.evaluate(() => document.fonts.ready)

    // Whole app, with the main areas numbered.
    await annotate(page, [
      { target: { css: '#controls' }, n: 1 },
      { target: { css: '#canvas' }, n: 2 },
      { target: { css: '#layers' }, n: 3 },
      { target: { css: '.toolbar .actions' }, n: 4 },
      { target: { css: '#status' }, n: 5 },
    ])
    await page.screenshot({ path: `${OUT}/overview.png` })

    await annotate(page, [])
    await panelShot(page, 'presets.png', 'Presets', 'Presets')

    await annotate(page, [
      { target: { css: '.font-select' }, n: 1 },
      { target: { css: '.font-info' }, n: 2 },
      { target: { css: '.upload' }, n: 3 },
      { target: { row: 'Text', in: 'Text' }, n: 4 },
      { target: { row: 'Letter spacing' }, n: 5 },
      { target: { row: 'Overlaps' }, n: 6 },
    ])
    await panelShot(page, 'font-text.png', 'Font', 'Text')

    // Shaping, with a warp on so Bend shows up.
    await choose(page, 'Warp', 'arch')
    await settle(page)
    await scrollTo(page, 'Scale & warp')
    await annotate(page, [
      { target: { row: 'Width' }, to: { row: 'Height' }, n: 1 },
      { target: { row: 'Tilt letters' }, to: { row: 'Tilt angle' }, n: 2 },
      { target: { row: 'Wobble all' }, to: { row: 'Bounce all' }, n: 3 },
      { target: { row: 'Warp' }, to: { row: 'Bend' }, n: 4 },
    ])
    await panelShot(page, 'shape.png', 'Scale & warp', 'Scale & warp')
    await annotate(page, [])
    await page.screenshot({ path: `${OUT}/warp-arch.png`, clip: await page.locator('#canvas').boundingBox() ?? undefined })
    await choose(page, 'Warp', 'none')
    await settle(page)

    await scrollTo(page, 'Per letter')
    await annotate(page, [
      { target: { css: '.letters .letter:not(.head)' }, n: 1 },
      { target: { button: 'Reset all letters' }, n: 2 },
    ])
    await panelShot(page, 'per-letter.png', 'Per letter', 'Per letter')

    await scrollTo(page, 'Color A · Face')
    await annotate(page, [
      { target: { section: 'Color A · Face' }, n: 1 },
      { target: { css: 'section:has(> h2 input) h2 label' }, all: true, n: 2 },
    ])
    await panelShot(page, 'layers.png', 'Color A · Face', 'Color B · Outer edge')

    // What will be cut: unshaded preview with the layer chips.
    await check(page, 'Preview shaded 3D', false)
    await settle(page)
    await scrollTo(page, 'Export')
    await annotate(page, [
      { target: { css: '#layers' }, n: 1 },
      { target: { row: 'Preview shaded 3D (off = exactly what is cut)' }, n: 2 },
    ])
    await page.screenshot({ path: `${OUT}/cut-preview.png` })
    await check(page, 'Preview shaded 3D', true)
    await settle(page)

    await scrollTo(page, 'Export')
    await annotate(page, [
      { target: { row: 'Layers', in: 'Export' }, n: 1 },
      { target: { row: 'Width', in: 'Export' }, to: { row: 'Unit', in: 'Export' }, n: 2 },
      { target: { row: 'Registration marks on every color' }, n: 3 },
      { target: { row: 'Weeding box around each color' }, n: 4 },
      { target: { row: 'Remove pieces too small to weed' }, to: { row: 'Smallest piece (mm)' }, n: 5 },
      { target: { section: 'PNG image' }, n: 6 },
    ])
    await panelShot(page, 'export.png', 'Export', 'PNG image')
  } finally {
    await browser.close()
    await server.close()
  }
  console.log(`Screenshots written to ${OUT}/`)
}

await main()
