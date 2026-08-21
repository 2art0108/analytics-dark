# Analitica NEW — Production Build

Self-contained static build of the Analytics dashboard (dark theme), exactly matching the working Preview: calendar-aligned Month view, responsive weekly bar spacing, swipe transitions, and gradient category bars.

## Contents

- `Analytics Screen Dark.dc.html` — main screen (entry point)
- `StatusBarDark.dc.html` — status bar, loaded by the main screen
- `support.js` — runtime that renders the above two files (do not remove or rename)
- `index.html` — redirects to the main screen
- `assets/` — card, envelope, and payment-network artwork
- `uploads/` — category icons (`icons/`) and the variable font (`PryvatSansUIVF.ttf`)

## Running it

This build is plain static files — any static file server works:

```
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:<port>/`. Opening the HTML file directly via `file://` may block the internal fetch that loads `StatusBarDark.dc.html`, depending on your browser — serving over HTTP avoids that.

## Notes

- No build step, bundler, or external dependencies (React/ReactDOM are loaded by `support.js` from a CDN at runtime).
- All relative paths must be preserved exactly as in this folder — `support.js` resolves `StatusBarDark.dc.html` and the asset paths relative to the main file's location.
- Do not edit `support.js`; it is a generated runtime file.
