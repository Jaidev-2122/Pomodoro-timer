# Tempo

A calm, editorial focus timer for the browser. Pomodoro, custom countdowns, a stopwatch, and a world clock — all in a single file, with no build step, no dependencies, and no tracking. Everything you change is saved to your browser.

## Live demo

After deploying (see below), drop your URL here:

> https://your-tempo-app.vercel.app

## What it does

**Five modes** — Pomodoro for focus sessions, Break (short or long, sized automatically), Timer for free-form countdowns, Stopwatch with lap tracking, and World Clock for a passive live-time display of any major city.

**The pomodoro cycle** — Each finished Pomodoro earns a break, and every Nth break (4 by default) is a long one. The dot row under the timer shows where you are in the current cycle. Auto-start chains focus and break together so you don't have to touch the app mid-flow.

**Everything is editable** — Pomodoro length, short break, long break, custom timer length, and the cycle count. Each number has +/− steppers, but you can also click the little pencil and type the value directly.

**A two-colour palette** — Pick a Primary colour (drives buttons, ring, active tab) and a Secondary colour (drives dots, badges, accents) from preset swatches or a full colour picker.

**A playful animated background** — Two large soft-edged colour blobs slowly drift across the screen on a 26-second loop. By default they use your palette colours; in the Colours mode you can choose two independent colours just for the background. Or upload an image from your device — opacity, brightness, blur, and overlay-darkness sliders only appear after you've added an image, keeping the settings clean otherwise.

**A large local clock and three world clocks** — The local time sits prominently in the header at editorial size, with the smaller seconds digits aligned to the top of the larger ones. The sidebar holds three more clocks, each with a dropdown of 160+ cities grouped by continent.

**The World Clock module** — A dedicated tab with a giant clock display and a dropdown to switch between local time and any city. Pairs especially well with fullscreen.

**Fullscreen mode** — The fullscreen icon in the header hides everything except the ring, digits, phase label, and three controls, scaled up to fill your screen. Works on the World Clock module too — perfect for a second monitor or a phone propped on your desk.

**A floating widget** — While a timer or stopwatch runs, a compact panel appears in the bottom-right corner. Drag it anywhere on the screen; it remembers where you put it. On Chromium browsers (Chrome, Edge, Brave, Opera) the Pop out button detaches it into a real always-on-top floating window that survives switching to other tabs or apps.

**Statistics** — Completed Pomodoros, accumulated focus time, and a day-streak counter that survives across sessions. Reset whenever you like.

**Extras** — A soft chime and desktop notification when a session ends, a live countdown in the browser tab title, and keyboard shortcuts (`Space` to start/pause, `R` to reset). The app is fully responsive down to phone screens, respects `prefers-reduced-motion`, leaves pinch-zoom enabled, and uses 48px+ touch targets throughout.

## Repository contents

```
├── index.html      ← the entire app
├── vercel.json     ← deployment config + cache headers
├── .gitignore
├── LICENSE
└── README.md
```

That's it. No `node_modules`, no build pipeline, no environment variables.

## Deploying to Vercel

There are two equally easy paths. Pick whichever you prefer.

### Option A — through the Vercel dashboard (recommended)

1. **Push this repo to GitHub.** Create an empty repository on GitHub, then in this folder run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. **Import the repo on Vercel.** Go to <https://vercel.com/new>, sign in with GitHub, and select your repo. Vercel will detect this as a static project automatically.

3. **Accept the defaults.** No framework preset, no build command, no output directory. Just click Deploy.

About thirty seconds later you'll get a `.vercel.app` URL. Every future `git push` to `main` re-deploys automatically.

### Option B — through the Vercel CLI

1. Install the CLI once: `npm i -g vercel`
2. From this folder, run `vercel`. The first time it asks a few questions; defaults are fine.
3. To go straight to a production URL, run `vercel --prod`.

### Custom domain

In the Vercel dashboard, open your project → Settings → Domains → Add. Point your DNS at Vercel's nameservers (or add the records it shows you) and you're done.

## Running it locally

You don't actually need a server. The app is just `index.html` — double-click it, drag it into a browser, or open `file://` and it runs.

If you'd like clean URLs and proper `https` for testing (the Document Picture-in-Picture API and a few other browser features prefer it), use any tiny static server:

```bash
# Python (already installed on most systems)
python3 -m http.server 8000

# or Node, if you have it
npx serve .
```

Then visit <http://localhost:8000>.

## Browser support

Tested on current Chrome, Edge, Firefox, and Safari, and on mobile Chrome/Safari. The **Pop out** floating-window feature requires Chromium ≥116 (Chrome, Edge, Brave, Opera); on Firefox and Safari the button is hidden and the in-page widget is used instead. **Fullscreen** works everywhere except iOS Safari, which is famously fussy about the Fullscreen API on non-video elements.

## Privacy

Tempo runs entirely in your browser. There are no analytics, no telemetry, no cookies, no server. Every setting — your palette, background, durations, chosen cities, statistics — is stored in `localStorage` on the device you used. Clearing your browser data clears your Tempo settings.

## Licence

MIT. See [LICENSE](./LICENSE).
