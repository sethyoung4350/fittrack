# FitTrack — BUILD_LOG

Build date: 2026-07-07 (overnight, unattended). This log records every decision, assumption, and verification result.

## Architecture decisions

- **Plain HTML/CSS/vanilla JS, no build step** — as required. Files: `index.html`, `css/style.css`, `js/*.js` (7 small modules loaded as classic scripts, no ES modules so it also works from `file://`), `manifest.json`, `sw.js`, `icons/`.
- **Storage**: IndexedDB database `fittrack` with object stores: `nutrition`, `sessions` (workouts), `program` (single record holding the editable program), `notes`, `photos`. Daily targets live in `localStorage` (`fittrack.targets`) since they're tiny settings — allowed by spec.
- **Single-page app**: 5 `<section>` screens toggled by a fixed bottom tab bar. Each screen re-renders from the DB when shown. Entry lists are capped at 60 visible items with a "Show all" button so hundreds of entries stay fast.
- **Custom confirm modal** instead of native `confirm()` — nicer on iOS standalone PWAs and doesn't block automation during testing. All destructive actions (delete entry/session/day/exercise/note/photo, import-overwrite, erase-all) go through it.
- **Charts**: hand-rolled inline SVG line charts (no library, no CDN). Empty data → friendly empty state, never a crash.
- **Dark theme, one accent colour** (green `#30d158`), 44px+ tap targets, `inputmode="decimal"/"numeric"` on number fields, 16px input font (prevents iOS auto-zoom).

## Assumptions / interpretations (spec ambiguities resolved)

- **Notes screen**: spec lists 5 tabs and also a "Notes screen". To keep the 5-tab layout, Notes is a section at the bottom of the **Progress** tab (add/edit/delete dated free-text notes).
- **Day 4 placeholders**: named "Exercise 1"–"Exercise 5", 3×10, rest 120s — fully renameable/editable in the program editor.
- **Two entries on the same date**: allowed. The daily vs-target view **sums** macros/steps across that date's entries; fasted weight uses the **latest** non-empty value for the date.
- **7-day rolling average**: average over the last 7 calendar days ending today, counting only days that have data for that field (no divide-by-zero; empty week shows "–").
- **Over/under indicator**: ▲ (orange) when over target, ▼ when under, plus a progress bar. Kept deliberately simple as spec asked.
- **Weight unit**: kg (matches "72.5kg @ 2 RIR" example in the spec). Label says kg; it's just a number field, so any unit works.
- **RIR**: allows decimals (e.g. 1.5).
- **Numbers**: any non-numeric text in a numeric field is treated as blank (ignored gracefully, never crashes averages).
- **Progressive overload surfacing**: each exercise in a session shows "Last (date): 72.5kg @2 · …" from the most recent prior session containing that exercise (matched by name, case-insensitive), and each set input's placeholder shows last time's value for that set number. A per-exercise "History" button shows all past performances.
- **Service worker & `file://`**: service workers don't run on `file://` (browser limitation, not fixable). The app itself still works fully when opening `index.html` directly (all logic + IndexedDB work). For install-as-PWA / offline caching it must be served over HTTP(S) once — README explains the simple options.

## Skills/process notes

- Skipped interactive brainstorming/questions per the explicit autonomy rules in the task (user instructions take precedence). Verification follows the spec's own self-verification plan (local server + headless browser E2E).

## Verification results

Method: served the folder with `python -m http.server 8642`, drove the app in a headless Chromium (Playwright, 390×844 iPhone-sized viewport). Playwright was used **for testing only** — it is not a dependency of the app. All test data was erased through the app's own "Erase all data" flow afterwards; **the app ships empty**.

| # | Check | Result |
|---|-------|--------|
| 1 | App loads with **zero console errors/warnings** (entire session: 0) | **PASS** |
| 2 | Add / edit / delete a nutrition entry via the UI; persists across reload | **PASS** |
| 3 | Targets editable in Settings and reflected in vs-target display (protein 190 → "185 / 190 g") | **PASS** |
| 4 | 7-day averages correct vs hand-computed values (cal avg 2716.7, protein 165, weight 81.17 from 3 known days) | **PASS** |
| 5 | Two entries on the same date sum correctly in the daily view (3000+500=3500 kcal) | **PASS** |
| 6 | Non-numeric input ("abc" as weight) ignored gracefully — no NaN, no crash | **PASS** |
| 7 | Over-target indicator shows ▲ (protein 185/180) | **PASS** |
| 8 | Log workout session (weight + RIR + note); next session shows "Last (date): 72.5kg @2 RIR" and last-time placeholders per set | **PASS** |
| 9 | Per-exercise history modal shows past performances + notes | **PASS** |
| 10 | Edit program: rename exercise, change sets/rest, add/delete exercise, add/delete day — all persist | **PASS** |
| 11 | Export downloads `fittrack-backup-YYYY-MM-DD.json`; erase-all then import restores everything exactly (entries, sessions, notes, photo blob, program edits, targets) | **PASS** |
| 12 | Charts render with data (2 SVG line charts, ~300 points) and show friendly empty states with zero data — no crash, no NaN | **PASS** |
| 13 | Progress photo: canvas-downscaled to JPEG (<200 KB), stored as blob in IndexedDB, thumbnail rendered, deletable | **PASS** |
| 14 | Notes: add / edit / delete with confirm | **PASS** |
| 15 | manifest.json valid (name FitTrack, standalone, 192+512 icons); service worker active; 14 assets precached | **PASS** |
| 16 | **Full offline reload** (network cut): app loads from SW cache with all data available | **PASS** |
| 17 | Stress: 304 entries — renders in 5–12 ms per screen; list capped at 60 with "Show all" button | **PASS** |
| 18 | Fresh-install state after erase: welcome screen, empty states everywhere, starter program present, default targets | **PASS** |
| 19 | Opening `index.html` directly via `file://` works and persists data (see note below) | **PASS** |

### Notes from testing

- On `file://` the browser logs 2 console errors about fetching `manifest.json` (CORS) — a browser limitation for local files, harmless; the app runs fully. Service worker + install-as-PWA require serving over HTTP(S), which "Add to Home Screen" from any hosted/served copy provides.
- **iOS "Add to Home Screen" confirmation**: `display: standalone` in manifest.json + `apple-mobile-web-app-capable=yes` + `apple-mobile-web-app-status-bar-style=black-translucent` + `apple-touch-icon` (180px) are all present, so iOS Safari will install it as a full-screen app with the FT icon. (Not testable in headless Chromium; verified by meeting Apple's documented requirements.)
- Chart accent colour `#2aa84a` was validated with a palette validator (lightness band, chroma, contrast vs dark surface) — all checks pass.
- One flaky **test** (not app bug): the async photo-save re-render raced a notes form fill in the test script; re-ran cleanly.

## Design polish pass (2026-07-07, after user feedback)

User feedback: app felt "cheap / vibe coded". Full visual redesign, still vanilla HTML/CSS/JS, no libraries:

- **Design tokens**: layered surfaces with vertical gradients, hairline `rgba` borders, card shadows, consistent radius scale, subtle green radial glow behind the page.
- **Typography**: large 27px bold header title with contextual subtitle (date on Today, section tagline elsewhere), tighter letter-spacing, tabular numerals everywhere numbers appear.
- **Today screen**: Apple-style activity **rings** (Calories / Protein / Steps) with % readouts replace the duplicated bar list; over-target rings turn amber.
- **Charts**: smooth Catmull-Rom curves, gradient area fill, emphasized latest point (halo + value label), Low/High/day-count meta strip, "Today"/"Yesterday" axis labels.
- **Micro-interactions**: screen fade-up transitions, button press scale, animated bar/ring fills, modal scale-in, toast slide-up, tab icon pill highlight. `prefers-reduced-motion` disables all of it.
- **Workout session**: prescription shown as a pill ("3×8 · rest 4:00" — m:ss instead of raw seconds); set rows highlight green once weight + RIR are both filled; centered numeric inputs.
- **Dates**: entries/sessions/notes/photos now say "Today" / "Yesterday" instead of raw dates where applicable.
- **Empty states**: icon badge treatment.
- **App icon**: green gradient with bold FT mark (regenerated 180/192/512).
- Service worker cache bumped to `fittrack-v2` so already-installed copies pick up the redesign on next online launch (verified: v1 cache is deleted and replaced on second load — the PWA update cycle means users see a new version one launch after it ships).
- Post-redesign regression: fresh load, entry add + vs-target, rings, both charts, session logging with filled-state, erase-all — all PASS with 0 console errors/warnings. App re-verified to ship empty.

## Goal weight (2026-07-08)

- Optional **Goal weight (kg)** field in Settings → Daily targets (stored as `goalWeight` in `fittrack.targets`; blank clears it — no default). Rides along with backup export/import automatically.
- When set: Today's weight card shows "Goal 78 kg — 4.5 kg to go ▼" (▲ to gain, "at goal 🎯" within 0.3 kg); the Progress weight chart draws a dashed goal line (goal included in the y-range so it's always visible).
- **SW precache bug fixed**: `cache.addAll` was fetching through the HTTP cache, so a new service worker could precache *stale* files (this bit us: v4 precached the old JS). Precache requests now use `cache: 'reload'`. Cache bumped to `fittrack-v5`.
- Verified end-to-end (set goal → Today line → chart line → clear goal removes all traces → goal round-trips in Settings); test data removed after.

## Workout auto-save (2026-10-01)

- The session being logged is copied to `localStorage` (`fittrack.sessionDraft`) on every change: typing a weight/reps/note, changing the date, adding or removing a set. If the app is closed mid-workout, the next launch opens straight back into that session with a "Restored your unsaved workout" toast.
- The draft is cleared only after **Save session** succeeds (a failed save now shows an error and keeps your sets), on **Cancel → Discard**, and on **Erase all data**. A corrupt or malformed draft is ignored and removed, never crashes boot.
- Small fix along the way: **+ Add set** created `{weight, rir}` instead of `{weight, reps}`.
- Cache bumped to `fittrack-v15`.
- Verified in headless Chromium: log sets, close page without saving, reopen → all values, extra set and note restored; save → reopen lands on Today; discard clears draft; corrupt draft ignored; 0 console errors.

## Continue today's session (2026-10-01)

- Sessions saved **today** get a **Continue** button on the Today card and on Workouts ("Done today", with how many sets were logged). It reopens the session with everything filled in; **Save session** updates the same session (keeps its id), so no duplicates. Auto-save covers a reopened session too.
- Only today's sessions can be continued (checked in `continueTodaySession`, not just hidden in the UI). Older sessions can still be corrected via History → Edit.
- **Cancel** on a reopened session says "Discard your changes? The saved session stays as it was." and leaves the saved copy untouched.
- Guard: while a session is open, the Today card shows "In progress → Back to session" instead of Start/Continue, so an unsaved workout can't be overwritten from the Today tab.
- Cache bumped to `fittrack-v16`.
- Verified in headless Chromium: save 2 sets → Continue from Today → add a 3rd → force-close → restored → save → still 1 session with 3 sets; cancel keeps saved values; yesterday's session refused; 0 console errors.

## Skipped / known limitations

- Nothing from Layers 1–3 was skipped — progress photos made it in (with automatic downscaling to keep IndexedDB small).
- No rest-timer during sessions (not in spec; rest seconds are displayed per exercise).
- Notes live at the bottom of the Progress tab rather than a 6th tab (spec fixed the tab bar at 5 tabs).
- iOS can evict website data for sites unused for ~7 days; installing to the home screen and using it regularly avoids this, and Export backup exists precisely for this risk (called out in README).
