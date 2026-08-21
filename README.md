# Analitica NEW — Production Build

Self-contained static build of the Analytics dashboard (dark theme), exactly matching the working Preview: calendar-aligned Month view, responsive weekly bar spacing, swipe transitions, and gradient category bars.

## Contents

- `Analytics Screen Dark.dc.html` — main screen (entry point)
- `StatusBarDark.dc.html` — status bar, loaded by the main screen
- `support.js` — runtime that renders the above two files (do not remove or rename)
- `index.html` — redirects to the main screen
- `assets/` — card, envelope, and payment-network artwork
- `uploads/` — category icons (`icons/`) and the variable font (`PryvatSansUIVF.ttf`)

All static files (the two `.dc.html` screens, `support.js`, `assets/`, `uploads/`) live in `public/`, which Vite copies verbatim into `dist/` on build — nothing in this app needs bundling, so Vite is used purely as the build/deploy wrapper Vercel expects.

## Local build

```
npm install
npm run build
npm run preview   # serves dist/ locally
```

## Deploying

Push to GitHub and import into Vercel — `vercel.json` sets the build command (`npm run build`) and output directory (`dist`). No other configuration needed.

## Running without a build step

You can still open the app as plain static files:

```
npx serve public
```

Then open `http://localhost:<port>/`. Opening via `file://` may block the internal fetch that loads `StatusBarDark.dc.html`, depending on your browser — serving over HTTP avoids that.

## Notes

- No bundler transforms the app code itself; React/ReactDOM are loaded by `support.js` from a CDN at runtime.
- All relative paths must be preserved exactly as in `public/` — `support.js` resolves `StatusBarDark.dc.html` and the asset paths relative to the main file's location.
- Do not edit `support.js`; it is a generated runtime file.
