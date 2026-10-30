import { describe, expect, it } from 'vitest'
import { DEFAULTS, PRESETS } from '../src/render'
import {
  KEPT_ON_PRESET,
  USER_PRESETS_KEY,
  addUserPreset,
  loadUserPresets,
  makeUserPreset,
  nameProblem,
  removeUserPreset,
  storeUserPresets,
} from '../src/userPresets'

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data }
}

describe('makeUserPreset', () => {
  const settings = { ...DEFAULTS, text: 'Hello', faceColor: '#123456', perLetter: [{ rotate: 5 }] }
  const p = makeUserPreset('  Mine ', settings, 'Bungee')

  it('keeps the font and style but not text or export settings', () => {
    expect(p.label).toBe('Mine')
    expect(p.fonts).toEqual(['Bungee'])
    expect(p.settings.faceColor).toBe('#123456')
    for (const k of KEPT_ON_PRESET) expect(p.settings).not.toHaveProperty(k)
  })
  it('copies per-letter tweaks rather than sharing them', () => {
    settings.perLetter[0].rotate = 30
    expect(p.settings.perLetter).toEqual([{ rotate: 5 }])
  })
})

describe('nameProblem', () => {
  const saved = [makeUserPreset('Mine', DEFAULTS, 'Bungee')]
  it('needs a name', () => expect(nameProblem('   ', saved)).toMatch(/name/))
  it('rejects built-in names, ignoring case', () => expect(nameProblem(PRESETS[0].label.toUpperCase(), saved)).toMatch(/built-in/))
  it('rejects saved names, ignoring case and spaces', () => expect(nameProblem(' mINE ', saved)).toMatch(/already/))
  it('accepts a new name', () => expect(nameProblem('Theirs', saved)).toBeNull())
})

describe('add / remove', () => {
  it('adds unique names and refuses duplicates', () => {
    const one = addUserPreset([], makeUserPreset('A', DEFAULTS, 'Bungee'))
    expect(one).toHaveLength(1)
    expect(() => addUserPreset(one, makeUserPreset('a', DEFAULTS, 'Bungee'))).toThrow(/already/)
  })
  it('removes by id', () => {
    const a = { ...makeUserPreset('A', DEFAULTS, 'Bungee'), id: 'a' }
    const b = { ...makeUserPreset('B', DEFAULTS, 'Bungee'), id: 'b' }
    expect(removeUserPreset([a, b], 'a')).toEqual([b])
  })
})

describe('storage', () => {
  it('round-trips', () => {
    const s = memory()
    const saved = [makeUserPreset('A', { ...DEFAULTS, outlineWidth: 12 }, 'Bungee')]
    expect(storeUserPresets(s, saved)).toBe(true)
    expect(loadUserPresets(s)).toEqual(saved)
  })
  it('is empty when nothing is stored or the data is unreadable', () => {
    expect(loadUserPresets(memory())).toEqual([])
    const s = memory()
    s.setItem(USER_PRESETS_KEY, '{not json')
    expect(loadUserPresets(s)).toEqual([])
  })
  it('skips malformed entries', () => {
    const s = memory()
    s.setItem(USER_PRESETS_KEY, JSON.stringify([{ id: 'x' }, null, { id: 'y', label: 'Y', settings: {}, fonts: [1, 'Bungee'] }]))
    expect(loadUserPresets(s)).toEqual([{ id: 'y', label: 'Y', group: 'User presets', fonts: ['Bungee'], settings: {} }])
  })
  it('reports when the browser refuses to store', () => {
    expect(storeUserPresets({ setItem: () => { throw new Error('quota') } }, [])).toBe(false)
  })
})
