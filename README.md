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
- `public/uploads/` — 46 category icons (SVG) and the Pryvat Sans UI variable font.
- `public/assets/` — card art and the Mastercard mark used by the card picker.

React and ReactDOM 18 load from unpkg at runtime (see the top of `support.js`); the
page needs network access on first load. Everything else is static — no API calls and
no build-time codegen. The chart data is generated deterministically at runtime.
