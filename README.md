# Аналітика — PrivatBank prototype

The analytics screen: expenses / income, timeframes, bar and radial charts with
selection, swipe paging, a Free Scroll continuous-timeline chart mode, a Smart
Scroll sticky toolbar, category details and settings.

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

## Default state (baked in)

This build's defaults match the last state shown in the design preview:
Витрати tab, Місяць timeframe, bar chart, Календарна сітка chart view, Градієнт по
списку column style, and **Розумний скрол ON**. Users can change any of this from
Settings; nothing here is hardcoded past the initial state.

## Layout

- `index.html` — the whole screen: markup, inline styles, component logic in the
  `<script type="text/x-dc" data-dc-script>` block.
- `support.js` — the runtime that compiles/mounts that template, loaded via a
  `document.write` loader (a plain `<script src>` gets rewritten into a hashed ES
  module by Vite's HTML pipeline, deferring it past template parsing). Duplicated at
  root + `public/` so the folder works from a plain static server too; same for
  `StatusBar(Dark).dc.html`.
- `uploads/` (+ `public/uploads/`) — 43 category icons and the Pryvat Sans UI font.
- `assets/` (+ `public/assets/`) — card art and the Mastercard mark.

React/ReactDOM 18 load from unpkg at runtime — the page needs network access on first
load. Chart data is generated deterministically; no API calls, no server code.

## Smart Scroll

When on, the cards/envelopes dropdown + chart-type row pins 8px below the nav bar via
`position: fixed` once scrolled past its natural offset (measured once through the
offsetParent chain — CSS `position: sticky` doesn't track correctly inside a scaled
ancestor). A gradient in the nav bar's own colour fades in behind it.

## Free Scroll chart mode

A continuous, bar-by-bar scrollable timeline, pixel-identical at rest to Фіксована
сітка's geometry per timeframe. See `FREE_META` / `freeOn()` in `index.html`'s logic
block for the full model (absolute-offset colour keys, shared axis max across
overlapping windows, `noGrow` on settle — all fixes for issues already resolved).
