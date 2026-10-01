# FitTrack

A personal training & body-weight tracker that runs entirely on your device. No accounts, no internet needed, no app store. Plain HTML/CSS/JavaScript — nothing to install or build.

> ⚠️ **Your data lives ONLY on your device** (in the browser's storage). Nobody else can see it — but if you delete the app from your home screen, clear Safari website data, or lose the phone, the data is gone. **Use Settings → Export backup regularly** and keep the file somewhere safe (iCloud Files, email it to yourself, etc.).

## Running it locally (computer)

Option A — just open it: double-click `index.html`. Everything works (logging, charts, backup). You may see a harmless warning in the browser console about `manifest.json`; ignore it.

Option B — with a tiny local server (needed only for the installable/offline PWA features):

```
cd FitTrack
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Putting it on your iPhone (step by step)

The app needs to be reachable from your iPhone over HTTP(S) **once**, to install it. After that it works with no internet at all. The easiest options:

**Option 1 — free static hosting (simplest long-term):**
1. Upload the FitTrack folder to any free static host (GitHub Pages, Netlify Drop — drag the folder onto netlify.com/drop, done).
2. Open that URL in **Safari** on your iPhone.

**Option 2 — from your computer over Wi-Fi:**
1. On the computer, run the local server (Option B above).
2. Find your computer's local IP (e.g. `192.168.1.20` — on Windows: `ipconfig`).
3. On the iPhone (same Wi-Fi), open `http://192.168.1.20:8000` in Safari.

**Then, in Safari on the iPhone:**
1. Tap the **Share** button (square with arrow, bottom of screen).
2. Scroll down and tap **Add to Home Screen**.
3. Tap **Add**. A green **FT** icon appears on your home screen.
4. Open it from the icon — it launches full-screen like a native app and works offline from then on.

> Note (Option 2): the app is tied to the address you installed it from. If your computer's IP changes, the already-installed app keeps working offline, but prefer Option 1 for a stable setup.

## Using the app

- **Today** — log today's weight, an interactive weight graph (drag across it to read any day; 1M/3M/6M/All), and your next or completed workout.
- **Workouts** — your program. Tap **Start session** on a day and enter weight and reps per set (last session's numbers are shown so you know what to beat). Tap any exercise to see its history graph. **Edit program** changes exercises, sets, reps, rest and supersets.
- **Progress** — weight graph and full weight log (add past days, delete mistakes), per-exercise graphs (top set, estimated 1RM, volume or reps), photos and notes. Exercises with the same name are linked, ignoring capitals and extra spaces.
- **Settings** — goal weight, backup and erase.

## Backup & Restore

- **Export backup** (Settings) downloads a single `fittrack-backup-YYYY-MM-DD.json` file containing *everything* — weights, workouts, program, notes, photos, goal weight. On iPhone it saves to Files.
- **Import backup** picks a backup file and **replaces** all current data with it (it asks for confirmation first).
- Do an export after any week you'd be sad to lose.

## Files

```
index.html      app shell
manifest.json   PWA manifest (installable app)
sw.js           service worker (offline caching)
css/style.css   styling (light & dark)
js/             db.js (IndexedDB), app.js (shell), charts.js, workouts.js,
                progress.js, today.js, settings.js
icons/          app icons
```
