# Private fonts

Put personal-use fonts (`.ttf`, `.otf`, `.woff`) here. They show up in the app under
*Your fonts (personal use)* and are bundled by `npm run build` and the dev server,
but never by `npm run build:public`.

Everything in this folder except this README is ignored by git, so these fonts are
never committed or pushed.

License files go in `licenses/`, named `<font file name>-<anything>.txt`, and show
under **About this font** in the app.

Presets prefer these fonts (see `fonts` in `PRESETS` in `src/render.ts`):
`pokemonsolid`, `Minecrafter.Reg`, `Pretendo`, `Cyberpunk-Regular`, `Harry P`,
`Parseltongue`, `MagicSchoolOne`, `Harry Potter`. Without them, presets fall back to
the open-licensed fonts in `src/fonts/`.
