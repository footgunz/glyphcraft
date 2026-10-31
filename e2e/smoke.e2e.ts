/// <reference types="node" />
import { readFile } from 'node:fs/promises'
import { expect, test, type Download, type Page } from '@playwright/test'

// The shipped app: one self-contained file, opened from disk.
const APP = new URL('../dist/glyphcraft-public.html', import.meta.url).href

const status = (page: Page) => page.locator('#status')
const preset = (page: Page, name: string) => page.locator('button.preset', { hasText: name })
const userPresets = (page: Page) => page.locator('.user-preset button.preset')

async function downloaded(page: Page, button: string): Promise<{ name: string; data: Buffer }> {
  const [download]: [Download, void] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button, exact: true }).click(),
  ])
  return { name: download.suggestedFilename(), data: await readFile(await download.path()) }
}

/** Wait for the preview to finish redrawing after a change. */
async function rendered(page: Page) {
  await expect(status(page)).toContainText('cut layers')
}

let errors: string[]

test.beforeEach(async ({ page }) => {
  errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(APP)
  await rendered(page)
})

test.afterEach(() => expect(errors).toEqual([]))

test('opens from disk and draws the default design', async ({ page }) => {
  await expect(page.locator('#preview svg path').first()).toBeVisible()
  await expect(status(page)).toContainText('2 cut layers')
  await expect(page.locator('#layers .chip')).toHaveText(['Color B (body)', 'Color A (face)'])
  await expect(page.locator('.brand .version')).not.toBeEmpty()
  // Only open-licensed fonts ship in the public build.
  await expect(page.locator('.font-select optgroup')).toHaveAttribute('label', 'Open-licensed (OK to share)')
})

test('downloads a two-color SVG named after the text, at the export width', async ({ page }) => {
  await page.locator('#controls textarea').fill('Hi there')
  await rendered(page)
  const { name, data } = await downloaded(page, 'Download SVG')
  const svg = data.toString('utf8')
  expect(name).toBe('Hi-there.svg')
  expect(svg).toMatch(/^<svg [^>]*width="300mm"/)
  expect(svg).toContain('id="layer-color-b"')
  expect(svg).toContain('id="layer-color-a"')
  expect(svg.match(/inkscape:groupmode="layer"/g)).toHaveLength(2)
})

test('downloads a PNG', async ({ page }) => {
  const { name, data } = await downloaded(page, 'Download PNG')
  expect(name).toBe('Glyphcraft.png')
  expect(data.subarray(1, 4).toString('latin1')).toBe('PNG')
})

test('a preset restyles the design and switches font, keeping the text', async ({ page }) => {
  await page.locator('#controls textarea').fill('Keep me')
  await rendered(page)
  await preset(page, 'Block Grass').click()
  await rendered(page)
  await expect(page.locator('#controls textarea')).toHaveValue('Keep me')
  await expect(page.locator('.font-select')).not.toHaveValue('Luckiest Guy')
  const { data } = await downloaded(page, 'Download SVG')
  expect(data.toString('utf8')).toContain('fill="#5fb83a"')
})

test('saves, reapplies and deletes a user preset', async ({ page }) => {
  await preset(page, 'Cyberpunk').click()
  await rendered(page)
  const font = await page.locator('.font-select').inputValue()

  await page.getByRole('button', { name: 'Save as preset…' }).click()
  const name = page.getByLabel('Preset name')
  await name.fill('cyberpunk')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('.save-preset-error')).toContainText('built-in')
  await name.fill('Mine')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(userPresets(page)).toHaveText(['Mine'])

  // Survives a reload, and brings back its font.
  await preset(page, 'Pocket Monster').click()
  await page.reload()
  await rendered(page)
  await userPresets(page).first().click()
  await expect(page.locator('.font-select')).toHaveValue(font)

  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete the Mine preset' }).click()
  await expect(userPresets(page)).toHaveCount(0)
  await page.reload()
  await rendered(page)
  await expect(userPresets(page)).toHaveCount(0)
})

test('the layer chips hide and show colors in the cut view', async ({ page }) => {
  await page.locator('label.row', { hasText: 'Preview shaded 3D' }).locator('input').uncheck()
  await rendered(page)
  const chipB = page.locator('#layers .chip', { hasText: 'Color B' })
  await chipB.click()
  await expect(chipB).toHaveClass(/off/)
  await expect(page.locator('#preview g[id="layer-color-b"]')).toBeHidden()
  await chipB.click()
  await expect(page.locator('#preview g[id="layer-color-b"]')).toBeVisible()
})
