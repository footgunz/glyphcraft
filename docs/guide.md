# Using Glyphcraft

A walkthrough of the app, from picking a style to downloading a file you can cut. Try it at **[footgunz.github.io/glyphcraft](https://footgunz.github.io/glyphcraft/)**.

Once your SVG is ready, see [Cutting with Cricut Design Space](cricut.md).

![The Glyphcraft window](assets/overview.png)

The left panel is the controls; the right side is a live preview. Settings are remembered in your browser between visits.

## 1. Pick a preset

**Presets** set the colors, layer sizes, spacing and letter play in one click, and switch to a matching font: each preset lists fonts in order of preference and uses the first one installed, so it picks a personal-use font when you have it and an open-licensed one otherwise. They keep your text, background and export settings.

![Clicking through presets restyles the whole design](assets/presets.gif)

| Group | Presets |
| --- | --- |
| Video game | Pocket Monster, Block Grass, Block Creeper, 8-bit console, Cyberpunk |
| Magic | Scarlet Lion, Emerald Serpent, Sapphire Raven, Honey Badger |

## 2. Text and font

- **Font**: grouped into *Your fonts (personal use)* and *Open-licensed (OK to share)*. **Add font…** loads a `.ttf`, `.otf` or `.woff` for this session. **About this font** shows the copyright, designer and license details stored in the font, plus its bundled license file.
- **Text**: multiple lines are fine. Mixing upper and lower case can add a playful look.
- **Letter spacing**: negative values make letters overlap.
- **Overlaps**: when letters overlap, *Separate* keeps each letter's own outline so they read like stacked stickers (choose whether left or right letters sit on top); *Merge* blends touching letters into one shape.

![Squeezing letters together, then switching between right on top, left on top and merge](assets/overlaps.gif)

## 3. Shape it

- **Width / Height** stretch the whole text.
- **Warp**: Arc, Arch, Arc upper/lower, Bulge, Fisheye, Wave, Rise or Perspective, with a **Bend** amount. A negative Bulge pinches the middle so the end letters come out biggest.

![Sweeping Bend through the Arch, Arc, Bulge and Wave warps](assets/warps.gif)

- **Tilt letters / Tilt angle**: rotate specific letters. `e` also matches é, è, ê and ë.
- **Wobble all / Bounce all**: alternate rotation and baseline up and down across letters for a playful feel.

![Tilting the A, then adding wobble and bounce](assets/letter-play.gif)

- **Per letter**: one row per letter to **Rotate**, **Shift** left/right, **Raise** and **Size** it by hand. Rows follow letter position, so editing earlier text shifts them; use **Reset all letters** if that happens.

Double-click any slider to reset it.

## 4. Style the layers

Each design is built from these layers, bottom to top:

| Layer | Vinyl color | What it is |
| --- | --- | --- |
| Outer edge | B | A thin outline around everything |
| 3D extrusion | B | The face and outline swept along an angle for depth |
| Outline | B | A thick border around each letter |
| Face | A | The letters themselves |
| Inner bevel shade | A | A darker sliver along the edges facing the extrusion |

The B layers can be turned off individually. The face can use a gradient, which shows in the preview and PNG; cutters ignore it.

![Swinging the 3D extrusion angle around](assets/extrusion.gif)

## 5. Check what will be cut

- Turn off **Preview shaded 3D** to see exactly what goes into the SVG.
- Click the **Color A / Color B** chips above the preview to hide or show a layer in place.
- **Background** sets the preview color, and can optionally be added to the SVG as a rectangle layer.

![Switching to the cut view, then hiding each color in turn](assets/cut-check.gif)

## 6. Export

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
