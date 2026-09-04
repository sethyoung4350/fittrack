# Weight goal — design (2026-07-08)

Approved in-session. Single optional target weight; no rates, no deadlines.

## Data
- `goalWeight` (number | null) stored inside the existing `fittrack.targets` localStorage object.
- Unset/blank/≤0 → treated as no goal; the feature is invisible everywhere.
- Rides along with backup export/import automatically (targets are already included).

## UI
- **Settings → Daily targets**: new "Goal weight (kg) — optional" field (`inputmode="decimal"`), saved by the existing Save targets button. Blank clears the goal (no default fallback, unlike other targets).
- **Today weight card**: when a goal is set and a weight exists, one line under the stat grid: `Goal 78.0 kg — 3.2 kg to go ▼` (▼ lose / ▲ gain; "at goal 🎯" within 0.3 kg).
- **Progress weight chart**: dashed accent goal line + "goal" label via a new optional `goal` option on `lineChartSVG()`; goal included in the y-range so the line is always on-screen. Calories chart untouched.

## Plumbing
- `sw.js` CACHE bumped to `fittrack-v4` (cache-first SW; required for clients to update).

## Verification
Playwright, sandboxed profile: set goal → Today line appears; log weight → distance updates; Progress shows dashed line; clear goal → all traces gone. Test data removed afterwards.
