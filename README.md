# Аналітика — Privat prototype

Interactive prototype of the Privat analytics flow: expense/income analytics with a
swipeable bar-chart carousel, radial breakdown, custom date ranges, category detail
screens and a light/dark theme.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle in dist/
npm run preview  # serve the built bundle
```

## What's in here

```
index.html                    Vite entry
vite.config.js                React plugin (set `base` if deploying to a subpath)
src/
  main.jsx                    mounts <App/>
  App.jsx                     mounts the screen
  index.css                   @font-face, resets, keyframes, pressed-state rules
  dc-runtime.js               tiny base class the screen extends
  screens/AnalyticsScreen.jsx the whole experience: state, data model, gestures
  components/StatusBar.jsx    iOS status bar glyphs
public/
  uploads/PryvatSansUIVF.ttf  variable font (weights 100–900)
  uploads/icons/*.svg         35 category icons
  assets/*                    card art, mastercard mark
```

## Screens and interactions

- **Analytics** — expenses/income tabs, week/month/year segments, bar and radial
  charts, category list, transaction list.
- **Chart carousel** — drag the chart to page through periods; it snaps on distance
  or velocity, the value scale stays fixed, the average line fades during the drag.
- **Category detail** — tap any category (expense or income) to push a detail screen
  with its own timeframe state; the nav bar's back button pops it.
- **Custom range** — the calendar picks a start and end date; the chart re-buckets by
  day, week, month, quarter or year depending on the span.
- **Card picker** — filter by cards and envelopes.
- **Theme** — tapping the navigation-bar title toggles light/dark across every screen.

## Notes

- The screen measures the DOM on mount, so `main.jsx` deliberately does not use
  `StrictMode` (a double mount would re-run those measurements).
- All data is generated deterministically from a seeded noise function — no network.
