# Аналітика — PrivatBank prototype

The analytics screen prototype: expenses / income, four timeframes, bar and radial
charts, category details, settings.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/
npm run preview
```

## Deploy (Vercel)

Framework preset **Vite** — build `npm run build`, output `dist`. No env vars.

## Layout

- `index.html` — the whole screen: markup, styles and the component logic
  (in the `<script type="text/x-dc">` block at the end of the file).
- `public/support.js` — the small runtime that compiles the template and mounts it.
- `public/uploads/` — category icons (SVG) and the Pryvat Sans UI variable font.

Everything is static: no API calls, no environment configuration, no build-time
codegen. Data shown in the charts is generated deterministically at runtime.
