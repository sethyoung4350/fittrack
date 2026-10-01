/* FitTrack — app shell: helpers, navigation, settings, weight/exercise helpers. */
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

/* ---------- settings (small values -> localStorage) ----------
   Stored under the old 'targets' key so existing backups keep working; only goalWeight is used now. */

function getTargets() {
  try {
    return JSON.parse(localStorage.getItem('fittrack.targets') || '{}') || {};
  } catch (e) {
    return {};
  }
}
function saveTargets(t) { localStorage.setItem('fittrack.targets', JSON.stringify(t)); }

/* ---------- weight + exercise helpers ---------- */

/* Weights live in the 'nutrition' store (kept for backup compatibility).
   One point per date: the latest non-empty weight logged that day. Ascending. */
function weightSeries(entries) {
  const byDate = {};
  entries.slice().sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); })
    .forEach(function (e) {
      const v = parseNum(e.weight);
      if (v != null && e.date) byDate[e.date] = { x: e.date, y: v, id: e.id };
    });
  return Object.keys(byDate).sort().map(function (d) { return byDate[d]; });
}

/* Average of the points whose date falls in the `days` days ending at endDateStr. */
function avgInWindow(series, endDateStr, days) {
  const start = dateAdd(endDateStr, -(days - 1));
  const vals = series.filter(function (p) { return p.x >= start && p.x <= endDateStr; }).map(function (p) { return p.y; });
  return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
}

/* Exercises with the same name (ignoring case and extra spaces) are the same exercise. */
function exKey(name) { return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase(); }

/* ---------- navigation ---------- */

const Screens = {}; // name -> async render fn (registered by each module)
const SCREEN_TITLES = { today: 'Today', workouts: 'Workouts', progress: 'Progress', settings: 'Settings' };
const SCREEN_SUBS = {
  workouts: 'Your program',
  progress: 'Weight, lifts, photos & notes',
  settings: 'Goal & backup'
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
