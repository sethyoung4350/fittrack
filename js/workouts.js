/* FitTrack — Workouts: program (editable), session logging with last-time data, history. */
'use strict';

/* Starter program template — structure only, no logged values. */
function defaultProgram() {
  function ex(name, sets, minReps, maxReps, rest, superset) {
    return { id: uid(), name: name, sets: sets, reps: { min: minReps, max: maxReps }, rest: rest, superset: !!superset };
  }
  return {
    id: 'program',
    days: [
      {
        id: uid(), name: 'Day 1 – Full Body',
        exercises: [
          ex('Smith Machine Squats', 3, 6, 8, 240),
          ex('Low Incline DB Press', 3, 8, 10, 180),
          ex('Chest Supported Row', 3, 8, 10, 180),
          ex('Leg Extension', 3, 10, 12, 120),
          ex('Machine Bicep Curl', 3, 10, 12, 120)
        ]
      },
      {
        id: uid(), name: 'Day 2 – Full Body',
        exercises: [
          ex('Hack Squat / Pendulum', 3, 6, 8, 300),
          ex('Upright Chest Press Machine', 3, 10, 12, 240),
          ex('Lat Pulldown', 3, 8, 10, 180),
          ex('Seated Leg Curl', 3, 10, 12, 180),
          ex('Tricep Pushdown', 3, 10, 12, 180)
        ]
      },
      {
        id: uid(), name: 'Day 3 – Full Body',
        exercises: [
          ex('Leg Press', 3, 8, 10, 180),
          ex('Flat Barbell Bench Press', 3, 6, 8, 240),
          ex('Seated Row', 3, 10, 12, 120),
          ex('Machine Shoulder Press', 3, 8, 10, 120),
          ex('DB Incline Bicep Curl', 3, 8, 10, 120)
        ]
      },
      {
        id: uid(), name: 'Day 4 – Full Body',
        exercises: [
          ex('Exercise 1 (rename me)', 3, 8, 10, 120),
          ex('Exercise 2 (rename me)', 3, 8, 10, 120),
          ex('Exercise 3 (rename me)', 3, 8, 10, 120),
          ex('Exercise 4 (rename me)', 3, 8, 10, 120),
          ex('Exercise 5 (rename me)', 3, 8, 10, 120)
        ]
      }
    ]
  };
}

function ensureProgram() {
  return dbGet('program', 'program').then(function (p) {
    if (!p || !Array.isArray(p.days)) return dbPut('program', defaultProgram());
  });
}

/* View state within the Workouts tab */
let woView = 'home';        // 'home' | 'session' | 'edit' | 'history'
let woSession = null;       // draft session while logging (string values in inputs)
let woDraft = null;         // program draft while editing
let woShowAllHistory = false;

function initWorkouts() {
  Screens.workouts = renderWorkouts;
  const screen = $('#screen-workouts');

  screen.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    handleWorkoutAction(btn.getAttribute('data-action'), btn);
  });

  // Keep drafts in sync while typing (no re-render per keystroke).
  screen.addEventListener('input', function (e) {
    const t = e.target;
    if (woView === 'session' && woSession && t.hasAttribute('data-ex')) {
      const exIdx = Number(t.getAttribute('data-ex'));
      const ex = woSession.exercises[exIdx];
      if (!ex) return;
      const field = t.getAttribute('data-field');
      if (field === 'note') ex.note = t.value;
      else {
        const setIdx = Number(t.getAttribute('data-set'));
        if (ex.sets[setIdx]) {
          ex.sets[setIdx][field] = t.value;
          const row = t.closest('.set-row');
          if (row) row.classList.toggle('filled', parseNum(ex.sets[setIdx].weight) != null && parseNum(ex.sets[setIdx].reps) != null);
        }
      }
    } else if (woView === 'session' && woSession && t.id === 'ws-date') {
      woSession.date = t.value || todayStr();
    } else if (woView === 'edit' && woDraft && t.hasAttribute('data-day')) {
      const day = woDraft.days[Number(t.getAttribute('data-day'))];
      if (!day) return;
      const field = t.getAttribute('data-field');
      if (field === 'dayName') day.name = t.value;
      else {
        const ex = day.exercises[Number(t.getAttribute('data-ex'))];
        if (ex) {
          if (field === 'reps-min' || field === 'reps-max') {
            if (!ex.reps || typeof ex.reps !== 'object') ex.reps = { min: 8, max: 12 };
            const val = parseNum(t.value);
            if (field === 'reps-min') ex.reps.min = val;
            else ex.reps.max = val;
          } else if (field === 'superset') {
            ex.superset = t.checked;
          } else {
            ex[field] = t.value;
          }
        }
      }
    }
  });
}

function handleWorkoutAction(action, btn) {
  if (action === 'wo-start') {
    startSession(btn.getAttribute('data-day-id'));
  } else if (action === 'wo-home') {
    woView = 'home'; woSession = null; woDraft = null;
    renderWorkouts();
  } else if (action === 'wo-history') {
    woView = 'history'; woShowAllHistory = false;
    renderWorkouts();
  } else if (action === 'wo-history-all') {
    woShowAllHistory = true;
    renderWorkouts();
  } else if (action === 'wo-edit-program') {
    dbGet('program', 'program').then(function (p) {
      woDraft = JSON.parse(JSON.stringify(p));
      woView = 'edit';
      renderWorkouts();
    });
  } else if (action === 'wo-save-session') {
    saveSession();
  } else if (action === 'wo-cancel-session') {
    appConfirm('Discard this session? Logged values will be lost.', { danger: true, okLabel: 'Discard' })
      .then(function (ok) { if (ok) { woView = 'home'; woSession = null; renderWorkouts(); } });
  } else if (action === 'wo-add-set') {
    const ex = woSession.exercises[Number(btn.getAttribute('data-ex'))];
    if (ex) { ex.sets.push({ weight: '', rir: '' }); renderWorkouts(); }
  } else if (action === 'wo-del-set') {
    const ex = woSession.exercises[Number(btn.getAttribute('data-ex'))];
    if (ex && ex.sets.length > 1) { ex.sets.splice(Number(btn.getAttribute('data-set')), 1); renderWorkouts(); }
  } else if (action === 'wo-ex-history') {
    showExerciseHistory(btn.getAttribute('data-name'));
  } else if (action === 'wo-view-session') {
    dbGet('sessions', Number(btn.getAttribute('data-id'))).then(function (s) {
      if (!s) return;
      woSession = sessionToDraft(s);
      woView = 'session';
      renderWorkouts();
    });
  } else if (action === 'wo-del-session') {
    const id = Number(btn.getAttribute('data-id'));
    appConfirm('Delete this workout session?', { danger: true, okLabel: 'Delete' }).then(function (ok) {
      if (!ok) return;
      dbDelete('sessions', id).then(function () { toast('Session deleted'); renderWorkouts(); });
    });
  } else if (action === 'wo-add-ex') {
    const day = woDraft.days[Number(btn.getAttribute('data-day'))];
    day.exercises.push({ id: uid(), name: 'New exercise', sets: 3, reps: { min: 8, max: 12 }, rest: 120, superset: false });
    renderWorkouts();
  } else if (action === 'wo-del-ex') {
    const day = woDraft.days[Number(btn.getAttribute('data-day'))];
    const ex = day.exercises[Number(btn.getAttribute('data-ex'))];
    appConfirm('Delete "' + (ex ? ex.name : 'exercise') + '" from the program?', { danger: true, okLabel: 'Delete' })
      .then(function (ok) {
        if (!ok) return;
        day.exercises.splice(Number(btn.getAttribute('data-ex')), 1);
        renderWorkouts();
      });
  } else if (action === 'wo-add-day') {
    woDraft.days.push({ id: uid(), name: 'Day ' + (woDraft.days.length + 1), exercises: [] });
    renderWorkouts();
  } else if (action === 'wo-del-day') {
    const idx = Number(btn.getAttribute('data-day'));
    const day = woDraft.days[idx];
    appConfirm('Delete "' + (day ? day.name : 'day') + '" and all its exercises from the program? Past logged sessions are kept.', { danger: true, okLabel: 'Delete day' })
      .then(function (ok) { if (ok) { woDraft.days.splice(idx, 1); renderWorkouts(); } });
  } else if (action === 'wo-save-program') {
    saveProgramDraft();
  } else if (action === 'wo-reset-program') {
    appConfirm('Reset the program to the starter template? Your customisations will be lost (logged sessions are kept).', { danger: true, okLabel: 'Reset' })
      .then(function (ok) {
        if (!ok) return;
        dbPut('program', defaultProgram()).then(function () {
          toast('Starter program loaded');
          woView = 'home'; woDraft = null;
          renderWorkouts();
        });
      });
  }
}

/* ---------- session logging ---------- */

function startSession(dayId) {
  dbGet('program', 'program').then(function (program) {
    const day = program.days.find(function (d) { return d.id === dayId; });
    if (!day) return;
    woSession = {
      date: todayStr(),
      dayId: day.id,
      dayName: day.name,
      exercises: day.exercises.map(function (ex) {
        const nSets = Math.max(1, parseNum(ex.sets) || 1);
        return {
          name: ex.name,
          presc: { sets: ex.sets, reps: ex.reps, rest: ex.rest, superset: ex.superset },
          sets: Array.from({ length: nSets }, function () { return { weight: '', reps: '' }; }),
          note: ''
        };
      })
    };
    woView = 'session';
    renderWorkouts();
  });
}

/* Convert a stored session (numbers) into an editable draft (strings). */
function sessionToDraft(s) {
  return {
    id: s.id,
    date: s.date,
    dayId: s.dayId,
    dayName: s.dayName,
    createdAt: s.createdAt,
    exercises: (s.exercises || []).map(function (ex) {
      return {
        name: ex.name,
        presc: ex.presc || {},
        sets: (ex.sets && ex.sets.length ? ex.sets : [{}]).map(function (st) {
          return {
            weight: st.weight == null ? '' : String(st.weight),
            reps: st.reps == null ? '' : String(st.reps)
          };
        }),
        note: ex.note || ''
      };
    })
  };
}

function saveSession() {
  if (!woSession) return;
  const record = {
    date: woSession.date || todayStr(),
    dayId: woSession.dayId,
    dayName: woSession.dayName,
    createdAt: woSession.createdAt || Date.now(),
    exercises: woSession.exercises.map(function (ex) {
      return {
        name: ex.name,
        presc: ex.presc,
        sets: ex.sets.map(function (st) { return { weight: parseNum(st.weight), reps: parseNum(st.reps) }; }),
        note: (ex.note || '').trim()
      };
    })
  };
  if (woSession.id != null) record.id = woSession.id;
  dbPut('sessions', record).then(function () {
    toast('Session saved');
    woView = 'home';
    woSession = null;
    renderWorkouts();
  });
}

/* Most recent stored session (before/excluding the one being edited) containing
   this exercise with at least one logged set. Matched by name, case-insensitive. */
function getLastForExercise(sessions, name, excludeId) {
  const target = String(name || '').trim().toLowerCase();
  const sorted = sessions.slice().sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0);
  });
  for (const s of sorted) {
    if (excludeId != null && s.id === excludeId) continue;
    for (const ex of (s.exercises || [])) {
      if (String(ex.name || '').trim().toLowerCase() !== target) continue;
      const logged = (ex.sets || []).filter(function (st) { return st.weight != null || st.rir != null; });
      if (logged.length) return { date: s.date, sets: ex.sets, note: ex.note || '' };
    }
  }
  return null;
}

function lastSummary(last) {
  if (!last) return '';
  return last.sets
    .filter(function (st) { return st.weight != null || st.reps != null; })
    .map(function (st) {
      return (st.weight != null ? fmt(st.weight, 1) + 'kg' : '–') + ' × ' + (st.reps != null ? fmt(st.reps, 0) + 'r' : '–');
    })
    .join(' · ');
}

function showExerciseHistory(name) {
  dbGet('program', 'program').then(function (program) {
    return dbGetAll('sessions').then(function (sessions) {
      const target = String(name || '').trim().toLowerCase();
      const rows = [];
      let allData = [];
      let repRange = null;

      // Find rep range from program
      if (program && program.days) {
        for (const day of program.days) {
          for (const ex of (day.exercises || [])) {
            if (String(ex.name || '').trim().toLowerCase() === target) {
              repRange = ex.reps;
              break;
            }
          }
          if (repRange) break;
        }
      }

      sessions.sort(function (a, b) {
        return String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0);
      });

      sessions.forEach(function (s) {
        (s.exercises || []).forEach(function (ex) {
          if (String(ex.name || '').trim().toLowerCase() !== target) return;
          const summary = lastSummary({ sets: ex.sets || [] });
          if (!summary && !ex.note) return;
          (ex.sets || []).forEach(function (st) {
            if (st.weight != null) allData.push(st);
          });
          rows.push('<div class="card" style="margin-bottom:8px"><strong>' + esc(niceDate(s.date)) + '</strong>' +
            '<div class="small-text" style="margin-top:4px">' + (summary || '<span class="muted">No sets logged</span>') + '</div>' +
            (ex.note ? '<div class="entry-note">' + esc(ex.note) + '</div>' : '') + '</div>');
        });
      });

      let html = '<h3>' + esc(name) + '</h3>';
      if (repRange) {
        html += '<div style="background:#f5f5f5;padding:8px;border-radius:4px;margin:10px 0;font-size:14px"><strong>Target:</strong> ' +
          repRange.min + '–' + repRange.max + ' reps</div>';
      }
      html += createWeightChart(allData);
      html += (rows.length ? rows.join('') : '<p class="muted">No history for this exercise yet.</p>');

      openModal(html);
    });
  });
}

/* ---------- rendering ---------- */

function renderWorkouts() {
  if (woView === 'session') return renderWoSession();
  if (woView === 'edit') return renderWoEdit();
  if (woView === 'history') return renderWoHistory();
  return renderWoHome();
}

function renderWoHome() {
  return Promise.all([dbGet('program', 'program'), dbGetAll('sessions')]).then(function (res) {
    const program = res[0] || { days: [] };
    const sessions = res[1];
    const today = todayStr();
    const todaySessions = sessions.filter(function (s) { return s.date === today; });

    let html = '';
    if (todaySessions.length) {
      html += '<div class="card"><h2>Today</h2><p class="mt0">✅ Logged: ' +
        todaySessions.map(function (s) { return esc(s.dayName || 'Session'); }).join(', ') + '</p></div>';
    }

    if (!program.days.length) {
      html += '<div class="empty">No workout days in your program.<br>Tap <b>Edit program</b> to add days, or reset to the starter template.</div>';
    }

    program.days.forEach(function (day) {
      const preview = day.exercises.map(function (ex) {
        const reps = repRangeLabel(ex.reps);
        return esc(ex.name) + ' <span class="rx">' + fmt(parseNum(ex.sets)) + '×' + reps + '</span>';
      }).join('<br>');
      html += '<div class="card day-card">' +
        '<div class="day-meta">' + day.exercises.length + (day.exercises.length === 1 ? ' exercise' : ' exercises') + '</div>' +
        '<h3>' + esc(day.name) + '</h3>' +
        '<div class="ex-preview">' + (preview || '<span class="muted">No exercises yet</span>') + '</div>' +
        '<button class="btn primary block" data-action="wo-start" data-day-id="' + esc(day.id) + '">Start session</button>' +
        '</div>';
    });

    html += '<div class="row">' +
      '<button class="btn ghost" data-action="wo-edit-program">Edit program</button>' +
      '<button class="btn ghost" data-action="wo-history">History (' + sessions.length + ')</button>' +
      '</div>';

    $('#screen-workouts').innerHTML = html;
  });
}

function restLabel(rest) {
  const r = parseNum(rest);
  if (r == null) return '';
  const m = Math.floor(r / 60), s = Math.round(r % 60);
  return ' · rest ' + m + ':' + String(s).padStart(2, '0');
}

function repRangeLabel(reps) {
  if (!reps || (typeof reps === 'object' && !reps.min && !reps.max)) return '';
  if (typeof reps === 'object') return reps.min + '–' + reps.max;
  return fmt(parseNum(reps)) || '';
}

function renderWoSession() {
  return dbGetAll('sessions').then(function (sessions) {
    const s = woSession;
    let html = '<div class="screen-subhead"><h3>' + esc(s.dayName || 'Session') + '</h3>' +
      '<button class="btn small ghost" data-action="wo-cancel-session">Cancel</button></div>';
    html += '<div class="card"><label>Session date<input type="date" id="ws-date" value="' + esc(s.date) + '"></label></div>';

    s.exercises.forEach(function (ex, exIdx) {
      const last = getLastForExercise(sessions, ex.name, s.id != null ? s.id : null);
      const presc = ex.presc || {};
      const repRange = repRangeLabel(presc.reps);
      html += '<div class="card"><div class="ex-head"><h4>' + esc(ex.name) + '</h4>' +
        '<span class="presc">' + fmt(parseNum(presc.sets)) + '× ' + (repRange || '–') + restLabel(presc.rest) + '</span></div>';
      if (last) {
        html += '<div class="last-line">Last (' + esc(niceDate(last.date)) + '): ' + lastSummary(last) + '</div>';
      } else {
        html += '<div class="last-line none">No previous data — first time logging this.</div>';
      }
      ex.sets.forEach(function (st, setIdx) {
        const lastSet = last && last.sets[setIdx] ? last.sets[setIdx] : null;
        const wPh = lastSet && lastSet.weight != null ? fmt(lastSet.weight, 1) : 'kg';
        const rPh = lastSet && lastSet.reps != null ? fmt(lastSet.reps, 0) : 'reps';
        const filled = parseNum(st.weight) != null && parseNum(st.reps) != null;
        html += '<div class="set-row' + (filled ? ' filled' : '') + '">' +
          '<span class="set-num">' + (setIdx + 1) + '</span>' +
          '<input type="text" inputmode="decimal" placeholder="' + esc(wPh) + '" value="' + esc(st.weight) + '" data-ex="' + exIdx + '" data-set="' + setIdx + '" data-field="weight" aria-label="Weight set ' + (setIdx + 1) + '">' +
          '<input type="text" inputmode="numeric" placeholder="' + esc(rPh) + '" value="' + esc(st.reps) + '" data-ex="' + exIdx + '" data-set="' + setIdx + '" data-field="reps" aria-label="Reps set ' + (setIdx + 1) + '">' +
          '<button class="icon-btn" data-action="wo-del-set" data-ex="' + exIdx + '" data-set="' + setIdx + '" aria-label="Remove set">×</button>' +
          '</div>';
      });
      html += '<div class="row">' +
        '<button class="btn small ghost" data-action="wo-add-set" data-ex="' + exIdx + '">+ Add set</button>' +
        '<button class="btn small ghost" data-action="wo-ex-history" data-name="' + esc(ex.name) + '">History</button>' +
        '</div>';
      html += '<label style="margin-top:10px">Note<input type="text" value="' + esc(ex.note) + '" data-ex="' + exIdx + '" data-field="note" placeholder="e.g. felt strong, seat pos 4"></label>';
      html += '</div>';
    });

    html += '<button class="btn primary block" data-action="wo-save-session">Save session</button>';
    $('#screen-workouts').innerHTML = html;
  });
}

/* Generate a simple SVG line chart for exercise weight progression. */
function createWeightChart(data) {
  if (!data || data.length < 2) return '';

  const points = data.filter(d => d.weight != null).slice(-30); // Last 30 entries
  if (points.length < 2) return '';

  const minW = Math.min.apply(null, points.map(d => d.weight)) * 0.9;
  const maxW = Math.max.apply(null, points.map(d => d.weight)) * 1.1;
  const range = maxW - minW || 1;

  const width = 280, height = 140, px = 30, py = 20;
  const graphW = width - px * 2, graphH = height - py * 2;

  let pathData = '';
  points.forEach(function (p, i) {
    const x = px + (i / (points.length - 1)) * graphW;
    const y = height - py - ((p.weight - minW) / range) * graphH;
    pathData += (i === 0 ? 'M' : 'L') + x + ' ' + y;
  });

  let svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" style="width:100%;max-width:300px;height:auto;border:1px solid #ccc;border-radius:4px;margin:10px 0">' +
    '<path d="' + pathData + '" stroke="#4a9eff" stroke-width="2" fill="none"/>';

  // Add points
  points.forEach(function (p, i) {
    const x = px + (i / (points.length - 1)) * graphW;
    const y = height - py - ((p.weight - minW) / range) * graphH;
    svg += '<circle cx="' + x + '" cy="' + y + '" r="2" fill="#4a9eff"/>';
  });

  // Add grid and labels
  svg += '<line x1="' + px + '" y1="' + (height - py) + '" x2="' + (width - px) + '" y2="' + (height - py) + '" stroke="#ddd" stroke-width="1"/>';
  svg += '<text x="' + (px - 5) + '" y="' + (height - py + 4) + '" font-size="10" text-anchor="end" fill="#999">' + fmt(minW, 1) + '</text>';
  svg += '<text x="' + (px - 5) + '" y="' + (py + 10) + '" font-size="10" text-anchor="end" fill="#999">' + fmt(maxW, 1) + '</text>';
  svg += '</svg>';

  return svg;
}

function renderWoHistory() {
  return dbGetAll('sessions').then(function (sessions) {
    sessions.sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0);
    });
    let html = '<div class="screen-subhead"><h3>History</h3>' +
      '<button class="btn small ghost" data-action="wo-home">Back</button></div>';
    if (!sessions.length) {
      html += '<div class="empty">' +
        '<div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M2.5 12h2M19.5 12h2M8.5 12h7"/><rect x="5" y="8" width="3.5" height="8" rx="1"/><rect x="15.5" y="8" width="3.5" height="8" rx="1"/></svg></div>' +
        'No sessions yet — start one from a program day.</div>';
    } else {
      const visible = woShowAllHistory ? sessions : sessions.slice(0, 30);
      visible.forEach(function (s) {
        const exLines = (s.exercises || []).map(function (ex) {
          const summary = lastSummary({ sets: ex.sets || [] });
          return '<div class="small-text" style="margin-top:4px"><b>' + esc(ex.name) + '</b>' +
            (summary ? ' — ' + summary : ' — <span class="muted">no sets</span>') +
            (ex.note ? '<div class="muted">' + esc(ex.note) + '</div>' : '') + '</div>';
        }).join('');
        html += '<div class="card">' +
          '<div class="entry-head"><strong>' + esc(niceDate(s.date)) + ' · ' + esc(s.dayName || 'Session') + '</strong>' +
          '<div class="entry-actions">' +
          '<button class="btn small ghost" data-action="wo-view-session" data-id="' + s.id + '">Edit</button>' +
          '<button class="btn small danger-ghost" data-action="wo-del-session" data-id="' + s.id + '">Delete</button>' +
          '</div></div>' + exLines + '</div>';
      });
      if (!woShowAllHistory && sessions.length > visible.length) {
        html += '<button class="btn ghost block" data-action="wo-history-all">Show all ' + sessions.length + ' sessions</button>';
      }
    }
    $('#screen-workouts').innerHTML = html;
  });
}

function renderWoEdit() {
  const p = woDraft;
  let html = '<div class="screen-subhead"><h3>Edit program</h3>' +
    '<button class="btn small ghost" data-action="wo-home">Back</button></div>';

  p.days.forEach(function (day, dayIdx) {
    html += '<div class="card">' +
      '<label>Day name<input type="text" value="' + esc(day.name) + '" data-day="' + dayIdx + '" data-field="dayName"></label>' +
      '<div class="edit-ex-head"><span>Exercise</span><span>Sets</span><span>Rep range</span><span>Rest s</span><span>SS</span><span></span></div>';
    day.exercises.forEach(function (ex, exIdx) {
      const reps = ex.reps && typeof ex.reps === 'object' ? ex.reps : { min: ex.reps, max: ex.reps };
      html += '<div class="edit-ex-row">' +
        '<input type="text" value="' + esc(ex.name) + '" data-day="' + dayIdx + '" data-ex="' + exIdx + '" data-field="name" aria-label="Exercise name">' +
        '<input type="text" inputmode="numeric" value="' + esc(ex.sets) + '" data-day="' + dayIdx + '" data-ex="' + exIdx + '" data-field="sets" aria-label="Sets" style="max-width:50px">' +
        '<div style="display:flex;gap:4px"><input type="text" inputmode="numeric" value="' + esc(reps.min) + '" data-day="' + dayIdx + '" data-ex="' + exIdx + '" data-field="reps-min" aria-label="Min reps" style="max-width:50px" placeholder="min"><input type="text" inputmode="numeric" value="' + esc(reps.max) + '" data-day="' + dayIdx + '" data-ex="' + exIdx + '" data-field="reps-max" aria-label="Max reps" style="max-width:50px" placeholder="max"></div>' +
        '<input type="text" inputmode="numeric" value="' + esc(ex.rest) + '" data-day="' + dayIdx + '" data-ex="' + exIdx + '" data-field="rest" aria-label="Rest seconds" style="max-width:60px">' +
        '<input type="checkbox" ' + (ex.superset ? 'checked' : '') + ' data-day="' + dayIdx + '" data-ex="' + exIdx + '" data-field="superset" aria-label="Superset" style="margin:0">' +
        '<button class="icon-btn" data-action="wo-del-ex" data-day="' + dayIdx + '" data-ex="' + exIdx + '" aria-label="Delete exercise">×</button>' +
        '</div>';
    });
    html += '<div class="row">' +
      '<button class="btn small ghost" data-action="wo-add-ex" data-day="' + dayIdx + '">+ Exercise</button>' +
      '<button class="btn small danger-ghost" data-action="wo-del-day" data-day="' + dayIdx + '">Delete day</button>' +
      '</div></div>';
  });

  html += '<button class="btn ghost block" data-action="wo-add-day">+ Add day</button>' +
    '<div class="row">' +
    '<button class="btn ghost" data-action="wo-reset-program">Reset to starter</button>' +
    '<button class="btn primary" data-action="wo-save-program">Save program</button>' +
    '</div>';

  $('#screen-workouts').innerHTML = html;
  return Promise.resolve();
}

function saveProgramDraft() {
  // Normalise numbers; blank/garbage -> sensible defaults.
  const clean = {
    id: 'program',
    days: woDraft.days.map(function (day) {
      return {
        id: day.id || uid(),
        name: String(day.name || '').trim() || 'Day',
        exercises: day.exercises.map(function (ex) {
          const reps = ex.reps && typeof ex.reps === 'object' ? ex.reps : { min: ex.reps, max: ex.reps };
          const restN = parseNum(ex.rest); // 0 is valid (superset partner), so no `|| default` here
          const minR = Math.max(1, Math.round(parseNum(reps.min) || 8));
          const maxR = Math.max(minR, Math.round(parseNum(reps.max) || 12));
          return {
            id: ex.id || uid(),
            name: String(ex.name || '').trim() || 'Exercise',
            sets: Math.max(1, Math.round(parseNum(ex.sets) || 3)),
            reps: { min: minR, max: maxR },
            rest: restN != null ? Math.max(0, Math.round(restN)) : 120,
            superset: !!ex.superset
          };
        })
      };
    })
  };
  dbPut('program', clean).then(function () {
    toast('Program saved');
    woView = 'home';
    woDraft = null;
    renderWorkouts();
  });
}
