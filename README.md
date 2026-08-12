# Аналітика — PrivatBank prototype

The analytics screen: expenses / income, four timeframes (Тиж / Міс / 6 міс / Рік),
bar and radial charts with selection, swipe paging, long-press scrubbing on the ring,
category details and settings (Chart View, Column Style).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/
npm run preview    # serve the built output
```

The folder also opens as-is from any plain static server (`npx serve .`) — every
asset exists both at the app root and under `public/`.

## Deploy (Vercel)

Framework preset **Vite** — build command `npm run build`, output directory `dist`.
No environment variables, no server code.

## Layout

- `index.html` — the whole screen: markup, inline styles, and the component logic in
  the `<script type="text/x-dc" data-dc-script>` block at the end of the file.
- `support.js` — the runtime that compiles that template and mounts it. It is loaded
  through a tiny `document.write` loader in `<head>`; that indirection is deliberate.
  A plain `<script src>` is rewritten by Vite's HTML pipeline into a hashed ES module,
  which defers execution past template parsing and leaves raw `{{ }}` in the built
  output. Written this way the file is served verbatim and runs synchronously.
  It exists twice on purpose: `public/support.js` is what `vite build` emits to the
  site root, and the copy beside `index.html` lets the folder also be opened by a
  plain static server. Same for `StatusBarDark.dc.html` / `StatusBar.dc.html`, which
  the runtime fetches at load.
- `uploads/` (and `public/uploads/`) — 46 category icons (SVG) and the Pryvat Sans UI
  variable font.
- `assets/` (and `public/assets/`) — card art and the Mastercard mark used by the
  card picker.

React and ReactDOM 18 load from unpkg at runtime (see the top of `support.js`); the
page needs network access on first load. Everything else is static — no API calls and
no build-time codegen. The chart data is generated deterministically at runtime.

## Current state of the radial chart

- Gradient column style: multicolour bars on the main screen; inside a category detail
  the bars fall back to the flat semantic colour (orange expenses / green income).
- Grey utility categories (cash withdrawals, "Інше") never enter the radial line-up, so
  segment colour, icon and selection colour always agree.
- The selected-category light treatment (outward segment bloom + centre bloom) is
  implemented but switched off: set `Component.RADIAL_GLOW_ON = true` in the logic
  block of `index.html` to bring it back.
