# Glyphcraft

Turn a word into a chunky, layered "3D" logo and export it as a **cut-ready SVG** for vinyl decals, or as a PNG for printing and sharing.

Type some text, pick a font and a style preset, bend and tweak the letters, then download. The SVG is made of real closed shapes (no strokes or effects), split into one layer per vinyl color, with registration marks and a weeding box, so it imports cleanly into Cricut Design Space or any other cutter software.

## License, in plain English

**The code** is under the [GNU AGPL v3](LICENSE). Use it, change it, share it, host it for your friends. The one rule: if you run a modified version for other people, especially as a website, you have to share your source code with them under the same license. So nobody gets to take Glyphcraft, lock it behind a paywall and keep the code to themselves.

**Your designs are yours.** Anything you make with Glyphcraft (logos, SVGs, PNGs, the decals you cut from them) belongs to you. Keep it, give it away, sell it. The AGPL covers this app's code, not what you create with it.

**Fonts have their own licenses, not this one.** Every font is covered only by its own license, and that's what decides what you can do with it:

- `src/fonts/` holds fonts that are fine to share: open-licensed ones (SIL Open Font License, or Apache 2.0 for Luckiest Guy) plus Upheaval, which is freeware you can pass along with its license file but not sell. Their licenses are in `src/fonts/licenses/` and show up in the app under **About this font**.
- `src/fonts-private/` is for fonts you add yourself. It's empty in this repo on purpose. Whatever you put there is yours to sort out, and many fan-made fonts are personal use only, so check before you share or sell anything made with them.

**Preset styles** nod to some well-known games and stories, but they're just colors and shapes with generic names. Nothing here is official or endorsed by anyone.

## Quick start

### Just use it

Open **`dist/glyphcraft.html`** in a browser (double-click it). It is a single self-contained file with every bundled font inside: no install, server or internet needed.

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

### Publish to GitHub Pages

`.github/workflows/pages.yml` builds the public version and publishes it to GitHub Pages every time a **release is published** in the GitHub UI (it can also be run by hand from the **Actions** tab). Only open-licensed fonts are ever published; private fonts are not in the repo.

One-time setup in the repository settings:

1. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
2. **Settings → Environments → github-pages → Deployment branches and tags:** add a tag rule such as `v*` (or allow all), because releases deploy from their tag.

Then create a release (for example tag `v1.0.0`) and the site appears at `https://<user>.github.io/glyphcraft/`. On a free GitHub plan, Pages requires the repository to be public.

## Using the app

The left panel is the controls; the right side is a live preview. Settings are remembered in your browser between visits.

### 1. Pick a preset

**Presets** set the colors, layer sizes, spacing and letter play in one click, and switch to a matching font: each preset lists fonts in order of preference and uses the first one installed, so it picks a personal-use font when you have it and an open-licensed one otherwise. They keep your text, background and export settings.

| Group | Presets |
| --- | --- |
| Video game | Pocket Monster, Block Grass, Block Creeper, 8-bit console, Cyberpunk |
| Magic | Scarlet Lion, Emerald Serpent, Sapphire Raven, Honey Badger |

### 2. Text and font

- **Font**: grouped into *Your fonts (personal use)* and *Open-licensed (OK to share)*. **Add font…** loads a `.ttf`, `.otf` or `.woff` for this session. **About this font** shows the copyright, designer and license details stored in the font, plus its bundled license file.
- **Text**: multiple lines are fine. Mixing upper and lower case can add a playful look.
- **Letter spacing**: negative values make letters overlap.
- **Overlaps**: when letters overlap, *Separate* keeps each letter's own outline so they read like stacked stickers (choose whether left or right letters sit on top); *Merge* blends touching letters into one shape.

### 3. Shape it

- **Width / Height** stretch the whole text.
- **Warp**: Arc, Arch, Arc upper/lower, Bulge, Fisheye, Wave, Rise or Perspective, with a **Bend** amount. A negative Bulge pinches the middle so the end letters come out biggest.
- **Tilt letters / Tilt angle**: rotate specific letters. `e` also matches é, è, ê and ë.
- **Wobble all / Bounce all**: alternate rotation and baseline up and down across letters for a playful feel.
- **Per letter**: one row per letter to **Rotate**, **Shift** left/right, **Raise** and **Size** it by hand. Rows follow letter position, so editing earlier text shifts them; use **Reset all letters** if that happens.

Double-click any slider to reset it.

### 4. Style the layers

Each design is built from these layers, bottom to top:

| Layer | Vinyl color | What it is |
| --- | --- | --- |
| Outer edge | B | A thin outline around everything |
| 3D extrusion | B | The face and outline swept along an angle for depth |
| Outline | B | A thick border around each letter |
| Face | A | The letters themselves |
| Inner bevel shade | A | A darker sliver along the edges facing the extrusion |

The B layers can be turned off individually. The face can use a gradient, which shows in the preview and PNG; cutters ignore it.

### 5. Check what will be cut

- Turn off **Preview shaded 3D** to see exactly what goes into the SVG.
- Click the **Color A / Color B** chips above the preview to hide or show a layer in place.
- **Background** sets the preview color, and can optionally be added to the SVG as a rectangle layer.

### 6. Export

**Download SVG** or **Copy SVG** for cutting. **Export → Width** and **Unit** set the physical size (mm, inches or px) of the whole file, marks and box included.

| Layers mode | Output |
| --- | --- |
| **Dual color** (default) | Two layers: **Color B** is the outline, extrusion and outer edge merged into one body; **Color A** is the face. Apply A on top of B. |
| Every layer, stacked | Each layer as its own full shape, meant to be stacked. |
| Every layer, knocked out | Each layer with everything above it cut away, so nothing overlaps. |

Cutting helpers, all on by default:

- **Registration marks**: identical crosshairs at the corners of every color layer. Line them up when stacking colors, then peel them off.
- **Weeding box**: a thin frame around each color to make weeding easier.
- **Remove pieces too small to weed**: drops pieces and holes smaller across than **Smallest piece (mm)**. In the cut preview, removed pieces show in red and the status bar counts them.

**Download PNG** renders what the preview shows at **PNG image → Width (px)**, with a transparent background unless you turn that off.

## Cricut Design Space tips

1. Upload the SVG. Each color comes in as its own layer, with marks and box already attached to it, so pieces keep their positions.
2. Check the size after uploading. It should match the export width; if not, resize the whole group proportionally.
3. Cut each color, weed, then use transfer tape to lay **Color B** down first and **Color A** on top, matching the registration marks.
4. For iron-on (HTV), remember to mirror in Design Space before cutting.

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
