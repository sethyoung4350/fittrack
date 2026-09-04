/* FitTrack — app shell: helpers, navigation, targets, shared nutrition math. */
'use strict';

/* ---------- tiny DOM / format helpers ---------- */

function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function dateAdd(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function niceDate(dateStr) {
  if (dateStr === todayStr()) return 'Today';
  if (dateStr === dateAdd(todayStr(), -1)) return 'Yesterday';
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/* Blank / non-numeric input -> null (never NaN). Accepts "72,5" as 72.5. */
function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmt(n, dp) {
  if (n == null || !Number.isFinite(n)) return '–';
  const r = Number(n.toFixed(dp || 0));
  return r.toLocaleString();
}

/* ---------- toast + modals ---------- */

let _toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () { t.classList.remove('show'); t.hidden = true; }, 2200);
}

function appConfirm(message, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    const root = $('#modalRoot');
    root.innerHTML =
      '<div class="modal-backdrop"><div class="modal">' +
      '<p class="mt0">' + esc(message) + '</p>' +
      '<div class="modal-actions">' +
      '<button class="btn ghost" data-act="cancel">Cancel</button>' +
      '<button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" data-act="ok">' + esc(opts.okLabel || 'OK') + '</button>' +
      '</div></div></div>';
    root.onclick = function (e) {
      const btn = e.target.closest('[data-act]');
      if (btn) {
        root.innerHTML = ''; root.onclick = null;
        resolve(btn.getAttribute('data-act') === 'ok');
      } else if (e.target.classList.contains('modal-backdrop')) {
        root.innerHTML = ''; root.onclick = null;
        resolve(false);
      }
    };
  });
}

function openModal(html) {
  const root = $('#modalRoot');
  root.innerHTML =
    '<div class="modal-backdrop"><div class="modal">' + html +
    '<div class="modal-actions"><button class="btn ghost" data-act="close">Close</button></div>' +
    '</div></div>';
  root.onclick = function (e) {
    if (e.target.closest('[data-act="close"]') || e.target.classList.contains('modal-backdrop')) {
      root.innerHTML = ''; root.onclick = null;
    }
  };
}

/* ---------- targets (small settings -> localStorage) ---------- */

const DEFAULT_TARGETS = { calories: 2800, protein: 180, carbs: 260, fat: 100, fibre: 30, steps: 9000 };

function getTargets() {
  try {
    return Object.assign({}, DEFAULT_TARGETS, JSON.parse(localStorage.getItem('fittrack.targets') || '{}'));
  } catch (e) {
    return Object.assign({}, DEFAULT_TARGETS);
  }
}
function saveTargets(t) { localStorage.setItem('fittrack.targets', JSON.stringify(t)); }

/* ---------- shared nutrition math ---------- */

/* Totals for one calendar day. Multiple entries on the same date are summed
   (macros/steps); weight uses the latest non-empty value that day. */
function dayTotals(entries, dateStr) {
  const dayEntries = entries.filter(function (e) { return e.date === dateStr; });
  function sum(field) {
    let s = 0, any = false;
    for (const e of dayEntries) {
      const v = parseNum(e[field]);
      if (v != null) { s += v; any = true; }
    }
    return any ? s : null;
  }
  let weight = null;
  dayEntries.slice().sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); })
    .forEach(function (e) { const v = parseNum(e.weight); if (v != null) weight = v; });
  return {
    count: dayEntries.length,
    calories: sum('calories'), protein: sum('protein'), carbs: sum('carbs'),
    fat: sum('fat'), fibre: sum('fibre'), steps: sum('steps'), weight: weight
  };
}

/* Rolling average over the `days` calendar days ending at endDateStr.
   Only days with data for a field count towards that field's average. */
function rollingAverages(entries, endDateStr, days) {
  days = days || 7;
  const fields = ['calories', 'protein', 'carbs', 'fat', 'fibre', 'steps', 'weight'];
  const acc = {};
  fields.forEach(function (f) { acc[f] = { sum: 0, n: 0 }; });
  for (let i = 0; i < days; i++) {
    const t = dayTotals(entries, dateAdd(endDateStr, -i));
    fields.forEach(function (f) {
      if (t[f] != null) { acc[f].sum += t[f]; acc[f].n++; }
    });
  }
  const out = {};
  fields.forEach(function (f) { out[f] = acc[f].n ? acc[f].sum / acc[f].n : null; });
  return out;
}

/* "Protein 150 / 180 g ▼" rows with progress bars. */
function targetsHtml(totals, targets) {
  const rows = [
    ['Calories', totals.calories, targets.calories, ' kcal'],
    ['Protein', totals.protein, targets.protein, ' g'],
    ['Carbs', totals.carbs, targets.carbs, ' g'],
    ['Fat', totals.fat, targets.fat, ' g'],
    ['Fibre', totals.fibre, targets.fibre, ' g'],
    ['Steps', totals.steps, targets.steps, '']
  ];
  return rows.map(function (r) {
    const label = r[0], val = r[1], target = parseNum(r[2]), unit = r[3];
    const pct = (target && target > 0 && val != null) ? Math.min(100, (val / target) * 100) : 0;
    const over = val != null && target != null && target > 0 && val > target;
    const arrow = val == null ? '' : (over ? ' ▲' : ' ▼');
    return '<div class="target-row">' +
      '<div class="target-label"><span>' + label + '</span>' +
      '<span class="target-nums' + (over ? ' over' : '') + '">' + fmt(val) + ' / ' + fmt(target) + unit + arrow + '</span></div>' +
      '<div class="bar"><div class="bar-fill' + (over ? ' over' : '') + '" style="width:' + pct.toFixed(1) + '%"></div></div>' +
      '</div>';
  }).join('');
}

/* Activity-style ring gauge. Caps the arc at 100%; over-target turns amber. */
function ringSVG(value, target, label, dp) {
  const R = 30, C = 2 * Math.PI * R;
  const t = parseNum(target);
  const pct = (t && t > 0 && value != null) ? Math.min(1, value / t) : 0;
  const over = value != null && t != null && t > 0 && value > t;
  const shown = value == null ? '–' : fmt(value, dp || 0);
  const pctText = value == null || !t ? '' : Math.round((value / t) * 100) + '%';
  return '<div class="ring-cell">' +
    '<svg viewBox="0 0 80 80" role="img" aria-label="' + esc(label) + ' ' + esc(shown) + ' of ' + esc(fmt(t)) + '">' +
    '<circle class="ring-track" cx="40" cy="40" r="' + R + '" stroke-width="7"/>' +
    '<circle class="ring-fill' + (over ? ' over' : '') + '" cx="40" cy="40" r="' + R + '" stroke-width="7" ' +
    'stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - pct)).toFixed(1) + '" ' +
    'transform="rotate(-90 40 40)"/>' +
    '<text class="ring-val" x="40" y="39" text-anchor="middle">' + esc(shown) + '</text>' +
    '<text class="ring-pct" x="40" y="52" text-anchor="middle">' + esc(pctText) + '</text>' +
    '</svg><div class="l">' + esc(label) + '</div></div>';
}

/* ---------- navigation ---------- */

const Screens = {}; // name -> async render fn (registered by each module)
const SCREEN_TITLES = { today: 'Today', nutrition: 'Nutrition', workouts: 'Workouts', progress: 'Progress', settings: 'Settings' };
const SCREEN_SUBS = {
  nutrition: 'Daily log & targets',
  workouts: 'Training program',
  progress: 'Trends, photos & notes',
  settings: 'Targets & backup'
};
let currentScreen = 'today';

function showScreen(name) {
  currentScreen = name;
  $all('.screen').forEach(function (s) { s.classList.toggle('active', s.id === 'screen-' + name); });
  $all('.tab').forEach(function (b) { b.classList.toggle('active', b.dataset.screen === name); });
  $('#screenTitle').textContent = SCREEN_TITLES[name] || 'FitTrack';
  $('#screenSub').textContent = name === 'today'
    ? new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
    : (SCREEN_SUBS[name] || '');
  window.scrollTo(0, 0);
  const render = Screens[name];
  if (render) {
    Promise.resolve(render()).catch(function (err) {
      console.error('Render failed for ' + name, err);
      $('#screen-' + name).innerHTML = '<div class="card"><p>Something went wrong loading this screen. Try again.</p></div>';
    });
  }
}

function refreshCurrentScreen() { showScreen(currentScreen); }

/* ---------- boot ---------- */

document.addEventListener('DOMContentLoaded', function () {
  openDB()
    .then(function () { return ensureProgram(); })
    .catch(function (err) {
      console.error(err);
      toast('Storage unavailable: ' + (err && err.message ? err.message : err));
    })
    .then(function () {
      $('#tabbar').addEventListener('click', function (e) {
        const b = e.target.closest('.tab');
        if (b) showScreen(b.dataset.screen);
      });
      initToday();
      initNutrition();
      initWorkouts();
      initProgress();
      initSettings();
      showScreen('today');
    });

  // Service workers need http(s); opening index.html via file:// still runs the app fine.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.warn('Service worker registration failed:', err);
    });
  }
});
