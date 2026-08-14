# Аналітика — PrivatBank prototype

The analytics screen: expenses / income, four timeframes (Тиж / Міс / 6 міс / Рік),
bar and radial charts with selection, swipe paging, a Free Scroll continuous-timeline
chart mode, long-press scrubbing on the ring, category details and settings (Chart
View, Column Style).

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
- `support.js` — the runtime that compiles that template and mounts it, loaded via a
  `document.write` loader in `<head>` (deliberate — a plain `<script src>` gets
  rewritten by Vite's HTML pipeline into a hashed ES module, which defers execution
  past template parsing and leaves raw `{{ }}` in the built output). Exists twice
  (root + `public/`) so the folder opens from a plain static server too; same for
  `StatusBarDark.dc.html` / `StatusBar.dc.html`, fetched at load.
- `uploads/` (+ `public/uploads/`) — 43 category icons (SVG) and the Pryvat Sans UI
  variable font.
- `assets/` (+ `public/assets/`) — card art and the Mastercard mark for the card
  picker.

React and ReactDOM 18 load from unpkg at runtime; the page needs network access on
first load. Everything else is static — no API calls, no build-time codegen. Chart
data is generated deterministically at runtime.

## Chart View modes (Settings → Вигляд діаграми)

- **Приховувати порожні стовпці** — only elapsed data, stretched to fill.
- **Фіксована сітка** — fixed slots, rolling window.
- **Календарна сітка** — always calendar-aligned periods, future slots empty.
- **Вільна прокрутка (Free Scroll)** — one continuous, infinitely-scrollable bar
  timeline (no calendar pages): drag by any distance, light capped inertia, settles to
  the nearest whole bar. Bar count/width/gaps at rest are pixel-identical to Фіксована
  сітка for the same timeframe (Тиж 7, Міс 5, 6 міс 6, Рік 12); the badge/total/period
  recompute from the visible window. Implemented via `Component.FREE_META` /
  `freeOn()` in the logic block — Fixed Grid / Calendar Grid / Hide Empty Bars are
  untouched by it.

## Radial chart

- Gradient column style: multicolour bars on the main screen; a category detail's own
  bars fall back to the flat semantic colour (orange expenses / green income).
- Grey utility categories (cash withdrawals, "Інше") never enter the radial line-up —
  segment colour, icon and selection colour always agree.
- Selected-category ambient light (outward segment bloom + centre bloom) is
  implemented but off by default: set `Component.RADIAL_GLOW_ON = true` in
  `index.html`'s logic block to re-enable it.

## Current-period labelling

A still-running month (Six Months / Year views) labels as its elapsed range
("1–14 серпня") instead of the bare month name; finished months keep the plain name.
Reads the live system date — see `monthLabel()`.
