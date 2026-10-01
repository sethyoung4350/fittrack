/* FitTrack — Progress: weight chart + log, per-exercise charts, photos, notes. */
'use strict';

let prNoteEditingId = null;
let prObjectUrls = [];        // revoke on re-render to avoid leaks
let prWeightRange = 'all';
let prWeightShowAll = false;
let prExKey = null;           // selected exercise (exKey)
let prExMetric = null;
let prExRange = 'all';

/* ---------- exercise data ---------- */

const EX_METRICS = [
  { key: 'top', label: 'Top set', unit: 'kg', dp: 1 },
  { key: 'e1rm', label: 'Est. 1RM', unit: 'kg', dp: 1 },
  { key: 'volume', label: 'Volume', unit: 'kg', dp: 0 },
  { key: 'reps', label: 'Best reps', unit: 'reps', dp: 0 }
];

/* Every exercise ever logged or in the program, grouped by exKey.
   Returns [{key, name, count, lastDate}] — most recently trained first. */
function exerciseIndex(sessions, program) {
  const idx = {};
  sessions.slice().sort(function (a, b) {
    return String(a.date).localeCompare(String(b.date)) || (a.createdAt || 0) - (b.createdAt || 0);
  }).forEach(function (s) {
    (s.exercises || []).forEach(function (ex) {
      const k = exKey(ex.name);
      if (!k) return;
      const logged = (ex.sets || []).some(function (st) { return st.weight != null || st.reps != null; });
      if (!logged) return;
      const e = idx[k] || (idx[k] = { key: k, name: ex.name.trim(), count: 0, lastDate: '' });
      e.count++; e.lastDate = s.date; e.name = ex.name.trim(); // latest spelling wins
    });
  });
  ((program && program.days) || []).forEach(function (d) {
    (d.exercises || []).forEach(function (ex) {
      const k = exKey(ex.name);
      if (k && !idx[k]) idx[k] = { key: k, name: ex.name.trim(), count: 0, lastDate: '' };
    });
  });
  return Object.keys(idx).map(function (k) { return idx[k]; }).sort(function (a, b) {
    return String(b.lastDate).localeCompare(String(a.lastDate)) || a.name.localeCompare(b.name);
  });
}

/* One point per session for this exercise. Point note describes the best set. */
function exerciseSeries(sessions, key, metric) {
  const pts = [];
  sessions.slice().sort(function (a, b) {
    return String(a.date).localeCompare(String(b.date)) || (a.createdAt || 0) - (b.createdAt || 0);
  }).forEach(function (s) {
    (s.exercises || []).forEach(function (ex) {
      if (exKey(ex.name) !== key) return;
      const sets = (ex.sets || []).filter(function (st) { return st.weight != null || st.reps != null; });
      if (!sets.length) return;
      let y = null, best = null;
      sets.forEach(function (st) {
        const w = st.weight || 0, r = st.reps || 0;
        let v = null;
        if (metric === 'top') v = st.weight != null ? w : null;
        else if (metric === 'e1rm') v = w > 0 && r > 0 ? w * (1 + r / 30) : null;
        else if (metric === 'reps') v = st.reps != null ? r : null;
        else if (metric === 'volume') { y = (y || 0) + w * r; return; }
        if (v != null && (y == null || v > y)) { y = v; best = st; }
      });
      if (y == null) return;
      const note = best ? (best.weight != null ? fmt(best.weight, 1) + ' kg' : 'BW') + ' × ' + (best.reps != null ? fmt(best.reps) : '–')
        : sets.length + (sets.length === 1 ? ' set' : ' sets');
      pts.push({ x: s.date, y: y, note: note });
    });
  });
  // Two sessions on one day: keep the better value so the line stays one point per day.
  const byDate = {};
  pts.forEach(function (p) { if (!byDate[p.x] || p.y > byDate[p.x].y) byDate[p.x] = p; });
  return Object.keys(byDate).sort().map(function (d) { return byDate[d]; });
}

/* Metrics that have data for this exercise (weighted lifts get kg metrics; bodyweight/cardio get reps). */
function availableMetrics(sessions, key) {
  return EX_METRICS.filter(function (m) {
    const s = exerciseSeries(sessions, key, m.key);
    if (m.key === 'reps') return s.length > 0;
    return s.some(function (p) { return p.y > 0; });
  });
}

/* Session-by-session list for one exercise, newest first. */
function exerciseLogHtml(sessions, key, limit) {
  const rows = [];
  sessions.slice().sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0);
  }).forEach(function (s) {
    (s.exercises || []).forEach(function (ex) {
      if (exKey(ex.name) !== key) return;
      const summary = lastSummary({ sets: ex.sets || [] });
      if (!summary && !ex.note) return;
      rows.push('<li><div class="li-main"><span>' + esc(niceDate(s.date)) + '</span><span class="muted">' + esc(s.dayName || '') + '</span></div>' +
        '<div class="li-sub">' + (summary || 'No sets') + '</div>' +
        (ex.note ? '<div class="li-note">' + esc(ex.note) + '</div>' : '') + '</li>');
    });
  });
  if (!rows.length) return '<p class="muted small">Nothing logged yet.</p>';
  return '<ul class="list">' + rows.slice(0, limit || rows.length).join('') + '</ul>';
}

/* Chart + metric switch for one exercise into `host`. Shared by Progress and the Workouts history sheet. */
function mountExerciseChart(host, sessions, key, state) {
  const metrics = availableMetrics(sessions, key);
  if (!metrics.length) {
    host.innerHTML = '<div class="empty small">Log this exercise to see a graph.</div>';
    return;
  }
  if (!metrics.some(function (m) { return m.key === state.metric; })) state.metric = metrics[0].key;
  const m = metrics.find(function (x) { return x.key === state.metric; });
  host.innerHTML = (metrics.length > 1 ? '<div class="seg seg-wide" role="group" aria-label="Measure">' + metrics.map(function (x) {
    return '<button type="button" class="' + (x.key === m.key ? 'on' : '') + '" data-metric="' + x.key + '">' + esc(x.label) + '</button>';
  }).join('') + '</div>' : '') + '<div class="chart-host"></div>';
  mountLineChart(host.querySelector('.chart-host'), exerciseSeries(sessions, key, m.key), {
    unit: m.unit, dp: m.dp, ranges: true, range: state.range || 'all', label: m.label + ' over time',
    onRange: function (r) { state.range = r; }
  });
  const seg = host.querySelector('.seg-wide');
  if (seg) seg.onclick = function (e) {
    const b = e.target.closest('[data-metric]');
    if (!b) return;
    state.metric = b.getAttribute('data-metric');
    if (state.onMetric) state.onMetric(state.metric);
    mountExerciseChart(host, sessions, key, state);
  };
}

/* ---------- init / actions ---------- */

function initProgress() {
  Screens.progress = renderProgress;
  const screen = $('#screen-progress');

  screen.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    if (action === 'pr-add-weight') {
      const date = $('#pr-w-date').value || todayStr();
      const v = parseNum($('#pr-w-val').value);
      if (v == null || v <= 0) { toast('Enter a weight in kg'); return; }
      saveWeightForDate(date, v).then(function () { toast('Weight saved'); renderProgress(); });
    } else if (action === 'pr-del-weight') {
      const date = btn.getAttribute('data-date');
      appConfirm('Delete the weight for ' + niceDate(date) + '?', { danger: true, okLabel: 'Delete' }).then(function (ok) {
        if (!ok) return;
        dbGetAll('nutrition').then(function (entries) {
          return Promise.all(entries.filter(function (x) { return x.date === date && x.weight != null; })
            .map(function (x) { return dbDelete('nutrition', x.id); }));
        }).then(function () { toast('Deleted'); renderProgress(); });
      });
    } else if (action === 'pr-weight-all') {
      prWeightShowAll = true;
      renderProgress();
    } else if (action === 'pr-save-note') {
      const text = ($('#pr-note-text') ? $('#pr-note-text').value : '').trim();
      if (!text) { toast('Write something first'); return; }
      const save = prNoteEditingId != null
        ? dbGet('notes', prNoteEditingId).then(function (n) {
            return dbPut('notes', Object.assign({}, n, { id: prNoteEditingId, text: text }));
          })
        : dbPut('notes', { date: todayStr(), text: text, createdAt: Date.now() });
      save.then(function () { prNoteEditingId = null; toast('Note saved'); renderProgress(); });
    } else if (action === 'pr-edit-note') {
      prNoteEditingId = Number(btn.getAttribute('data-id'));
      renderProgress().then(function () {
        const ta = $('#pr-note-text');
        if (ta) { ta.focus(); ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      });
    } else if (action === 'pr-cancel-note') {
      prNoteEditingId = null;
      renderProgress();
    } else if (action === 'pr-del-note') {
      const id = Number(btn.getAttribute('data-id'));
      appConfirm('Delete this note?', { danger: true, okLabel: 'Delete' }).then(function (ok) {
        if (ok) dbDelete('notes', id).then(function () { toast('Note deleted'); renderProgress(); });
      });
    } else if (action === 'pr-add-photo') {
      const fileInput = $('#pr-photo-file');
      if (fileInput) fileInput.click();
    } else if (action === 'pr-del-photo') {
      const id = Number(btn.getAttribute('data-id'));
      appConfirm('Delete this photo?', { danger: true, okLabel: 'Delete' }).then(function (ok) {
        if (ok) dbDelete('photos', id).then(function () { toast('Photo deleted'); renderProgress(); });
      });
    }
  });

  screen.addEventListener('change', function (e) {
    if (e.target.id === 'pr-photo-file' && e.target.files && e.target.files[0]) {
      addProgressPhoto(e.target.files[0]);
    } else if (e.target.id === 'pr-ex-select') {
      prExKey = e.target.value;
      renderProgress();
    }
  });
}

/* ---------- photos ---------- */

/* Downscale to max 1280px JPEG to keep IndexedDB small; falls back to the original file. */
function shrinkImage(file) {
  return new Promise(function (resolve) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      try {
        const maxSide = 1280;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          resolve(blob || file);
        }, 'image/jpeg', 0.82);
      } catch (e) {
        URL.revokeObjectURL(url);
        resolve(file);
      }
    };
    img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

function addProgressPhoto(file) {
  const date = ($('#pr-photo-date') && $('#pr-photo-date').value) || todayStr();
  const type = ($('#pr-photo-type') && $('#pr-photo-type').value) || 'Front';
  toast('Saving photo…');
  shrinkImage(file).then(function (blob) {
    return dbPut('photos', { date: date, type: type, blob: blob, createdAt: Date.now() });
  }).then(function () {
    toast('Photo saved');
    renderProgress();
  }).catch(function (err) {
    console.error(err);
    toast('Could not save photo');
  });
}

/* ---------- render ---------- */

function renderProgress() {
  return Promise.all([
    dbGetAll('nutrition'), dbGetAll('notes'), dbGetAll('photos'), dbGetAll('sessions'), dbGet('program', 'program')
  ]).then(function (res) {
    const series = weightSeries(res[0]), notes = res[1], photos = res[2], sessions = res[3], program = res[4];
    const goal = parseNum(getTargets().goalWeight);

    prObjectUrls.forEach(function (u) { URL.revokeObjectURL(u); });
    prObjectUrls = [];

    let html = '';

    // Weight
    html += '<section class="card"><div class="card-head"><h2>Weight</h2></div>' +
      '<div class="chart-host" id="pr-weight-chart"></div>' +
      '<details class="fold"' + (prWeightShowAll ? ' open' : '') + '><summary>Weight log · ' + series.length + '</summary>' +
      '<div class="addrow">' +
      '<input type="date" id="pr-w-date" value="' + todayStr() + '" aria-label="Date">' +
      '<input type="text" inputmode="decimal" id="pr-w-val" placeholder="kg" aria-label="Weight in kg">' +
      '<button class="btn primary" data-action="pr-add-weight">Save</button></div>';
    const desc = series.slice().reverse();
    const visible = prWeightShowAll ? desc : desc.slice(0, 10);
    html += '<ul class="list">' + visible.map(function (p, i) {
      const prev = desc[i + 1];
      const d = prev ? p.y - prev.y : null;
      return '<li class="li-row"><span>' + esc(niceDate(p.x)) + '</span>' +
        '<span class="li-val">' + fmt(p.y, 1) + ' kg' +
        (d != null ? '<span class="muted small"> ' + signed(d, 1) + '</span>' : '') + '</span>' +
        '<button class="icon-btn" data-action="pr-del-weight" data-date="' + esc(p.x) + '" aria-label="Delete weight for ' + esc(p.x) + '">×</button></li>';
    }).join('') + '</ul>';
    if (desc.length > visible.length) html += '<button class="link block-link" data-action="pr-weight-all">Show all ' + desc.length + '</button>';
    html += '</details></section>';

    // Exercises
    const exIdx = exerciseIndex(sessions, program);
    if (!prExKey || !exIdx.some(function (e) { return e.key === prExKey; })) {
      const firstLogged = exIdx.find(function (e) { return e.count > 0; });
      prExKey = firstLogged ? firstLogged.key : (exIdx[0] ? exIdx[0].key : null);
    }
    html += '<section class="card"><div class="card-head"><h2>Exercises</h2></div>';
    if (exIdx.length) {
      const opt = function (e) {
        return '<option value="' + esc(e.key) + '"' + (e.key === prExKey ? ' selected' : '') + '>' + esc(e.name) +
          (e.count ? ' · ' + e.count + (e.count === 1 ? ' session' : ' sessions') : '') + '</option>';
      };
      const logged = exIdx.filter(function (e) { return e.count; }), notYet = exIdx.filter(function (e) { return !e.count; });
      html += '<select id="pr-ex-select" aria-label="Exercise">' +
        (logged.length ? '<optgroup label="Logged">' + logged.map(opt).join('') + '</optgroup>' : '') +
        (notYet.length ? '<optgroup label="Not logged yet">' + notYet.map(opt).join('') + '</optgroup>' : '') + '</select>' +
        '<div id="pr-ex-chart"></div>' +
        '<h3 class="sub-h">Recent sessions</h3>' + exerciseLogHtml(sessions, prExKey, 5);
    } else {
      html += '<div class="empty small">Log a workout to see your lifts here.</div>';
    }
    html += '</section>';

    // Photos
    html += '<section class="card"><div class="card-head"><h2>Photos</h2></div>' +
      '<div class="grid2">' +
      '<label>Date<input type="date" id="pr-photo-date" value="' + todayStr() + '"></label>' +
      '<label>Angle<select id="pr-photo-type"><option>Front</option><option>Side</option><option>Back</option></select></label>' +
      '</div>' +
      '<input type="file" id="pr-photo-file" accept="image/*" hidden>' +
      '<button class="btn block" data-action="pr-add-photo">Add photo</button>';
    if (photos.length) {
      const byDate = {};
      photos.forEach(function (p) { (byDate[p.date] = byDate[p.date] || []).push(p); });
      Object.keys(byDate).sort().reverse().forEach(function (d) {
        html += '<div class="photo-date">' + esc(niceDate(d)) + '</div><div class="photo-grid">';
        byDate[d].forEach(function (p) {
          const u = URL.createObjectURL(p.blob);
          prObjectUrls.push(u);
          html += '<div class="photo-item"><img src="' + u + '" alt="' + esc(p.type) + ' photo">' +
            '<span class="tag">' + esc(p.type) + '</span>' +
            '<button class="icon-btn del" data-action="pr-del-photo" data-id="' + p.id + '" aria-label="Delete photo">×</button></div>';
        });
        html += '</div>';
      });
    }
    html += '</section>';

    // Notes
    let noteText = '';
    if (prNoteEditingId != null) {
      const n = notes.find(function (x) { return x.id === prNoteEditingId; });
      noteText = n ? n.text : '';
    }
    html += '<section class="card"><div class="card-head"><h2>Notes</h2></div>' +
      '<textarea id="pr-note-text" aria-label="' + (prNoteEditingId != null ? 'Edit note' : 'New note') + '" placeholder="Anything worth remembering…">' + esc(noteText) + '</textarea>' +
      '<div class="row">' +
      (prNoteEditingId != null ? '<button class="btn" data-action="pr-cancel-note">Cancel</button>' : '') +
      '<button class="btn primary" data-action="pr-save-note">' + (prNoteEditingId != null ? 'Update note' : 'Add note') + '</button>' +
      '</div>';
    const sortedNotes = notes.slice().sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0);
    });
    if (sortedNotes.length) {
      html += '<ul class="list">' + sortedNotes.map(function (n) {
        return '<li><div class="li-main"><span>' + esc(niceDate(n.date)) + '</span><span>' +
          '<button class="link" data-action="pr-edit-note" data-id="' + n.id + '">Edit</button> ' +
          '<button class="link danger" data-action="pr-del-note" data-id="' + n.id + '">Delete</button></span></div>' +
          '<div class="li-note">' + esc(n.text) + '</div></li>';
      }).join('') + '</ul>';
    }
    html += '</section>';

    $('#screen-progress').innerHTML = html;

    mountLineChart($('#pr-weight-chart'), series, {
      unit: 'kg', dp: 1, ranges: true, range: prWeightRange, label: 'Body weight over time',
      goal: goal != null && goal > 0 ? goal : null, emptyText: 'Log your weight on Today to see the trend.',
      onRange: function (r) { prWeightRange = r; }
    });
    if (prExKey && $('#pr-ex-chart')) {
      mountExerciseChart($('#pr-ex-chart'), sessions, prExKey, {
        metric: prExMetric, range: prExRange,
        onMetric: function (m) { prExMetric = m; }
      });
    }
  });
}
