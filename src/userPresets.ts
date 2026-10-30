import { PRESETS, type Preset, type Settings } from './render'

/**
 * Presets people save themselves. Like the built-in ones they hold the font
 * and the style settings, never text, background or export settings. They are
 * not edited in place: to change one, apply it, adjust, and save a new one.
 */

export const USER_PRESET_GROUP = 'User presets'
export const USER_PRESETS_KEY = 'glyphcraft.userPresets'

/** Settings a preset never touches. */
export const KEPT_ON_PRESET: (keyof Settings)[] = [
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

const sameName = (a: string, b: string) => a.trim().localeCompare(b.trim(), undefined, { sensitivity: 'accent' }) === 0

/** Why a name can't be used, or null if it can. Names are unique among built-in and saved presets, ignoring case. */
export function nameProblem(name: string, saved: Preset[]): string | null {
  if (!name.trim()) return 'Give the preset a name.'
  if (PRESETS.some((p) => sameName(p.label, name))) return `"${name.trim()}" is a built-in preset; pick another name.`
  if (saved.some((p) => sameName(p.label, name))) return `You already have a preset called "${name.trim()}".`
  return null
}

/** A preset capturing the current font and style. */
export function makeUserPreset(name: string, settings: Settings, font: string): Preset {
  const style: Partial<Settings> = { ...settings }
  for (const k of KEPT_ON_PRESET) delete style[k]
  // Copy nested data so later edits to the live settings don't leak in.
  style.perLetter = settings.perLetter.map((t) => ({ ...t }))
  return { id: `user-${Date.now().toString(36)}`, label: name.trim(), group: USER_PRESET_GROUP, fonts: font ? [font] : [], settings: style }
}

export function addUserPreset(saved: Preset[], preset: Preset): Preset[] {
  const problem = nameProblem(preset.label, saved)
  if (problem) throw new Error(problem)
  return [...saved, preset]
}

export function removeUserPreset(saved: Preset[], id: string): Preset[] {
  return saved.filter((p) => p.id !== id)
}

/** Saved presets from storage; anything unreadable is skipped rather than breaking the app. */
export function loadUserPresets(storage: Pick<Storage, 'getItem'>): Preset[] {
  try {
    const raw = JSON.parse(storage.getItem(USER_PRESETS_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((p) => p && typeof p.id === 'string' && typeof p.label === 'string' && p.settings && typeof p.settings === 'object')
      .map((p) => ({
        id: p.id,
        label: p.label,
        group: USER_PRESET_GROUP,
        fonts: Array.isArray(p.fonts) ? p.fonts.filter((f: unknown) => typeof f === 'string') : [],
        settings: p.settings,
      }))
  } catch {
    return []
  }
}

/** Returns false if the browser refused to store them (private mode, quota). */
export function storeUserPresets(storage: Pick<Storage, 'setItem'>, saved: Preset[]): boolean {
  try {
    storage.setItem(USER_PRESETS_KEY, JSON.stringify(saved))
    return true
  } catch {
    return false
  }
}
