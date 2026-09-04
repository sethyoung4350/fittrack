/* FitTrack — Progress: SVG line charts, progress photos, notes. */
'use strict';

let prNoteEditingId = null;
let prObjectUrls = []; // revoke on re-render to avoid leaks

function initProgress() {
  Screens.progress = renderProgress;
  const screen = $('#screen-progress');

  screen.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    if (action === 'pr-save-note') {
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
    }
  });
}

/* ---------- charts ---------- */

/* Catmull-Rom -> cubic bezier: a gentle smooth through every point, no libs. */
function smoothPathD(coords) {
  if (coords.length < 3) {
    return coords.map(function (c, i) { return (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1); }).join(' ');
  }
  let d = 'M' + coords[0][0].toFixed(1) + ' ' + coords[0][1].toFixed(1);
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] || coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ' C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
  }
  return d;
}

let _chartUid = 0;

/* points: [{x:'YYYY-MM-DD', y:number}] ascending. Returns inline SVG (no libs). */
function lineChartSVG(points, opts) {
  opts = opts || {};
  if (!points.length) {
    return '<div class="empty">' +
      '<div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M4 5v14h16"/><path d="M7 14l3.5-3.5 3 2.5 5.5-6"/></svg></div>' +
      esc(opts.emptyText || 'No data yet') + '</div>';
  }
  const W = 340, H = 180, padL = 42, padR = 14, padT = 14, padB = 24;
  const gid = 'cg' + (++_chartUid);
  const xs = points.map(function (p) { return new Date(p.x + 'T12:00:00').getTime(); });
  const ys = points.map(function (p) { return p.y; });
  let minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
  let minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
  if (opts.goal != null) { minY = Math.min(minY, opts.goal); maxY = Math.max(maxY, opts.goal); } // keep the goal line on-screen
  if (minX === maxX) { minX -= 43200000; maxX += 43200000; } // single day -> pad half a day each side
  const spanY = maxY - minY;
  const padY = spanY === 0 ? (Math.abs(maxY) * 0.06 || 1) : spanY * 0.12;
  minY -= padY; maxY += padY;

  function sx(t) { return padL + ((t - minX) / (maxX - minX)) * (W - padL - padR); }
  function sy(v) { return padT + ((maxY - v) / (maxY - minY)) * (H - padT - padB); }

  // stats strip above the plot
  const dp = opts.dp || 0;
  const lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
  let html = '<div class="chart-meta"><span>Low ' + fmt(lo, dp) + '</span><span>High ' + fmt(hi, dp) + '</span><span>' + points.length + (points.length === 1 ? ' day' : ' days') + '</span></div>';

  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="' + esc(opts.label || 'Line chart') + '">';
  svg += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#2aa84a" stop-opacity="0.28"/>' +
    '<stop offset="1" stop-color="#2aa84a" stop-opacity="0"/>' +
    '</linearGradient></defs>';

  // recessive horizontal gridlines + y labels
  for (let i = 0; i <= 3; i++) {
    const v = minY + ((maxY - minY) * i) / 3;
    const y = sy(v).toFixed(1);
    svg += '<line class="grid-line" x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '"/>';
    svg += '<text class="axis-text" x="' + (padL - 5) + '" y="' + (Number(y) + 3).toFixed(1) + '" text-anchor="end">' + fmt(v, dp) + '</text>';
  }

  // dashed goal reference line (under the data line)
  if (opts.goal != null) {
    const gy = sy(opts.goal);
    svg += '<line class="goal-ref" x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '"/>';
    svg += '<text class="goal-text" x="' + (W - padR - 2) + '" y="' + (gy - 5).toFixed(1) + '" text-anchor="end">goal ' + fmt(opts.goal, dp) + '</text>';
  }

  // smooth line + gradient area
  const coords = points.map(function (p, i) { return [sx(xs[i]), sy(p.y)]; });
  const lineD = smoothPathD(coords);
  const baseY = (H - padB).toFixed(1);
  if (points.length > 1) {
    svg += '<path fill="url(#' + gid + ')" d="' + lineD + ' L' + coords[coords.length - 1][0].toFixed(1) + ' ' + baseY +
      ' L' + coords[0][0].toFixed(1) + ' ' + baseY + ' Z"/>';
    svg += '<path class="line" d="' + lineD + '"/>';
  }

  // subtle dots when sparse; latest point always emphasised with a halo + label
  if (points.length <= 40) {
    coords.slice(0, -1).forEach(function (c) {
      svg += '<circle class="dot" cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="2.2"/>';
    });
  }
  const lastC = coords[coords.length - 1];
  svg += '<circle class="dot-halo" cx="' + lastC[0].toFixed(1) + '" cy="' + lastC[1].toFixed(1) + '" r="8"/>';
  svg += '<circle class="dot" cx="' + lastC[0].toFixed(1) + '" cy="' + lastC[1].toFixed(1) + '" r="3.4"/>';
  const lastLabelX = Math.min(lastC[0], W - padR - 2);
  svg += '<text class="end-label" x="' + lastLabelX.toFixed(1) + '" y="' + Math.max(11, lastC[1] - 11).toFixed(1) + '" text-anchor="end">' +
    fmt(points[points.length - 1].y, dp) + '</text>';

  // x labels: first and last date
  svg += '<text class="axis-text" x="' + padL + '" y="' + (H - 6) + '">' + esc(niceDate(points[0].x)) + '</text>';
  if (points.length > 1) {
    svg += '<text class="axis-text" x="' + (W - padR) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(niceDate(points[points.length - 1].x)) + '</text>';
  }
  svg += '</svg>';
  return html + svg;
}

/* One point per calendar day that has data for the field. */
function dailySeries(entries, field) {
  const dates = Array.from(new Set(entries.map(function (e) { return e.date; })))
    .filter(Boolean).sort();
  const out = [];
  dates.forEach(function (d) {
    const t = dayTotals(entries, d);
    if (t[field] != null) out.push({ x: d, y: t[field] });
  });
  return out;
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
  return Promise.all([dbGetAll('nutrition'), dbGetAll('notes'), dbGetAll('photos')]).then(function (res) {
    const entries = res[0], notes = res[1], photos = res[2];

    prObjectUrls.forEach(function (u) { URL.revokeObjectURL(u); });
    prObjectUrls = [];

    const weightSeries = dailySeries(entries, 'weight');
    const calSeries = dailySeries(entries, 'calories');
    const gw = parseNum(getTargets().goalWeight);

    let html = '';
    html += '<div class="card"><h2>Fasted weight (kg)</h2>' +
      lineChartSVG(weightSeries, { dp: 1, label: 'Fasted weight over time', goal: gw != null && gw > 0 ? gw : null, emptyText: 'No weights yet — log fasted weight in Nutrition to see your trend.' }) + '</div>';
    html += '<div class="card"><h2>Daily calories (kcal)</h2>' +
      lineChartSVG(calSeries, { dp: 0, label: 'Daily calories over time', emptyText: 'No calorie data yet — log calories in Nutrition to see your trend.' }) + '</div>';

    // Photos
    html += '<div class="card"><h2>Progress photos</h2>' +
      '<div class="grid2">' +
      '<label>Date<input type="date" id="pr-photo-date" value="' + todayStr() + '"></label>' +
      '<label>Angle<select id="pr-photo-type"><option>Front</option><option>Side</option><option>Back</option></select></label>' +
      '</div>' +
      '<input type="file" id="pr-photo-file" accept="image/*" hidden>' +
      '<button class="btn ghost block" data-action="pr-add-photo">+ Add photo</button>';
    if (photos.length) {
      const byDate = {};
      photos.forEach(function (p) { (byDate[p.date] = byDate[p.date] || []).push(p); });
      Object.keys(byDate).sort().reverse().forEach(function (d) {
        html += '<div class="photo-date-head">' + esc(niceDate(d)) + '</div><div class="photo-grid">';
        byDate[d].forEach(function (p) {
          const u = URL.createObjectURL(p.blob);
          prObjectUrls.push(u);
          html += '<div class="photo-item"><img src="' + u + '" alt="' + esc(p.type) + ' photo">' +
            '<span class="tag">' + esc(p.type) + '</span>' +
            '<button class="icon-btn del" data-action="pr-del-photo" data-id="' + p.id + '" aria-label="Delete photo">×</button></div>';
        });
        html += '</div>';
      });
    } else {
      html += '<p class="muted small-text" style="margin-bottom:0">No photos yet — add front/side/back shots to track visual progress.</p>';
    }
    html += '</div>';

    // Notes
    let noteText = '';
    if (prNoteEditingId != null) {
      const n = notes.find(function (x) { return x.id === prNoteEditingId; });
      noteText = n ? n.text : '';
    }
    html += '<div class="card"><h2>Notes</h2>' +
      '<label>' + (prNoteEditingId != null ? 'Edit note' : 'New note') +
      '<textarea id="pr-note-text" placeholder="Anything worth remembering…">' + esc(noteText) + '</textarea></label>' +
      '<div class="row">' +
      (prNoteEditingId != null ? '<button class="btn ghost" data-action="pr-cancel-note">Cancel</button>' : '') +
      '<button class="btn primary" data-action="pr-save-note">' + (prNoteEditingId != null ? 'Update note' : 'Add note') + '</button>' +
      '</div>';
    const sortedNotes = notes.slice().sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0);
    });
    if (sortedNotes.length) {
      sortedNotes.forEach(function (n) {
        html += '<hr class="sep"><div class="entry-head"><strong>' + esc(niceDate(n.date)) + '</strong>' +
          '<div class="entry-actions">' +
          '<button class="btn small ghost" data-action="pr-edit-note" data-id="' + n.id + '">Edit</button>' +
          '<button class="btn small danger-ghost" data-action="pr-del-note" data-id="' + n.id + '">Delete</button>' +
          '</div></div>' +
          '<div class="entry-note" style="margin-top:0">' + esc(n.text) + '</div>';
      });
    } else {
      html += '<p class="muted small-text" style="margin-bottom:0">No notes yet.</p>';
    }
    html += '</div>';

    $('#screen-progress').innerHTML = html;
  });
}
