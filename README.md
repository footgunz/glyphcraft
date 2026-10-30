# Glyphcraft

**[Try it: footgunz.github.io/glyphcraft](https://footgunz.github.io/glyphcraft/)** · [How to use it](docs/README.md)

Turn a word into a chunky, layered "3D" logo and export it as a **cut-ready SVG** for vinyl decals, or as a PNG for printing and sharing.

Type some text, pick a font and a style preset, bend and tweak the letters, then download. The SVG is made of real closed shapes (no strokes or effects), split into one layer per vinyl color, with registration marks and a weeding box, so it imports cleanly into Cricut Design Space or any other cutter software. The [docs](docs/README.md) walk through every control and the cutting workflow.

## License, in plain English

**The code** is under the [GNU AGPL v3](LICENSE). Use it, change it, share it, host it for your friends. The one rule: if you run a modified version for other people, especially as a website, you have to share your source code with them under the same license. So nobody gets to take Glyphcraft, lock it behind a paywall and keep the code to themselves.

**Your designs are yours.** Anything you make with Glyphcraft (logos, SVGs, PNGs, the decals you cut from them) belongs to you. Keep it, give it away, sell it. The AGPL covers this app's code, not what you create with it.

**Fonts have their own licenses, not this one.** Every font is covered only by its own license, and that's what decides what you can do with it:

- `src/fonts/` holds fonts that are fine to share: open-licensed ones (SIL Open Font License, or Apache 2.0 for Luckiest Guy) plus Upheaval, which is freeware you can pass along with its license file but not sell. Their licenses are in `src/fonts/licenses/` and show up in the app under **About this font**.
- `src/fonts-private/` is for fonts you add yourself. It's empty in this repo on purpose. Whatever you put there is yours to sort out, and many fan-made fonts are personal use only, so check before you share or sell anything made with them.

**Preset styles** nod to some well-known games and stories, but they're just colors and shapes with generic names. Nothing here is official or endorsed by anyone.

## Quick start

### Use it online

Open **[footgunz.github.io/glyphcraft](https://footgunz.github.io/glyphcraft/)**. It runs entirely in your browser; nothing is uploaded.

### Use it offline

Download **`glyphcraft-<version>.html`** from the latest [release](https://github.com/footgunz/glyphcraft/releases/latest) and open it in a browser. It's the same app as the website, in one file, with the open-licensed fonts built in.

Or build it yourself (see below), then open **`dist/glyphcraft.html`** in a browser (double-click it). It is a single self-contained file with every bundled font inside: no install, server or internet needed.

To give the app to someone else, send **`dist/glyphcraft-public.html`** instead. It leaves out the personal-use fonts (see [Fonts](#fonts)).

### Develop

Requires [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (current LTS recommended).

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Changes reload live.

### Build

```bash
npm run build
```

Type-checks, then writes `dist/glyphcraft.html` with every font, for your own use.

```bash
npm run build:public
```

Writes `dist/glyphcraft-public.html` with only the open-licensed fonts, safe to share. Presets automatically fall back to open fonts in it.

Rebuild after adding fonts or changing code; `dist/` is not committed. To try the public version while developing, run `npm run dev -- --mode public`.

### Docs images

The screenshot and animations in [`docs/assets/`](docs/assets/) are recorded from the public build (open-licensed fonts only). After changing the UI, regenerate them with:

```bash
npm run docs:screenshots
```

Add shot names (for example `-- warps presets`) to redo only those. It needs Node.js 22.18+ and an installed Chrome or Edge; set `CHROME_PATH` to pick a specific browser.

## Fonts

Fonts live in two folders, and appear in the font list automatically, named after the file:

| Folder | What goes there | Included in |
| --- | --- | --- |
| `src/fonts/` | Fonts you may share: open-licensed (OFL, Apache) or freeware that allows redistribution | Both builds |
| `src/fonts-private/` | Personal-use fonts | `npm run build` and dev only |

Put a font's license in the matching `licenses/` folder, named `<font file name>-<anything>.txt` (for example `Bungee-OFL.txt`); the app shows it under **About this font**.

To make a preset use a font, list it in the preset's `fonts` in `PRESETS` in `src/render.ts`, most preferred first, ending with an open font so the public build has a fallback.

Preset fonts and their fallbacks:

| Preset | Preferred (personal use) | Fallback (open) |
| --- | --- | --- |
| Pocket Monster | pokemonsolid | Luckiest Guy |
| Block Grass / Block Creeper | Minecrafter | Upheaval, then Press Start 2P |
| 8-bit console | Pretendo | Bungee |
| Cyberpunk | Cyberpunk | Audiowide |
| Scarlet Lion | Harry P | Pirata One |
| Emerald Serpent | Parseltongue | Cinzel Decorative |
| Sapphire Raven | Magic School One | MedievalSharp |
| Honey Badger | Harry Potter | Metamorphous |

## How it works

| File | Role |
| --- | --- |
| `src/geometry.ts` | Lays out text with [opentype.js](https://github.com/opentypejs/opentype.js), flattens glyphs to polygons, applies warps and per-letter transforms, and does unions, offsets and extrusion with [clipper-lib](https://sourceforge.net/projects/jsclipper/) |
| `src/render.ts` | Settings, defaults and presets; builds the layer stack per letter, handles overlaps, and writes the SVG |
| `src/cutting.ts` | Small-piece removal, registration marks, weeding box and physical sizing |
| `src/main.ts` | Controls, live preview, layer toggles, font loading and SVG/PNG downloads |
| `vite.config.ts` | Builds everything into one HTML file; `--mode public` leaves out `src/fonts-private` |

Outlines are true polygon offsets and the extrusion is an exact sweep of the outlined shape, so every layer is one clean `<path>` of closed, non-overlapping contours. Layers are written as Inkscape layers (`<g inkscape:groupmode="layer">`) so Inkscape also shows them as separate layers.
