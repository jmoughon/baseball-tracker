# Scout Book — baseball scout tracker

A phone-first PWA for charting opposing batters from the stands: spray charts, hit type (GB/LD/FB/K), swing timing, and auto-generated tendency tags. Built with React + Vite.

**Live app:** https://jmoughon.github.io/baseball-tracker/

## Works offline, saves on-device

- All data (teams, lineups, at-bats) is stored in your browser's `localStorage` — nothing leaves the device.
- The service worker caches the whole app, so it works with zero signal at the field.
- Install it: open the link above, then **Share → Add to Home Screen** (iPhone) or the **Install** prompt (Android/Chrome). It launches full-screen like a native app.

> Because data lives in the browser, clearing the site's data (or "Clear History and Website Data" on iOS) erases your scouting book. Use **Export report / CSV** to back up.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # serve the production build
npm run icons    # regenerate PWA icons in public/
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the app and publishes `dist/` to GitHub Pages.
