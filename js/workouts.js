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

/* Note from the last time this exercise was done on this same program day.
   Notes don't carry across days, even when the exercise is shared. */
function lastNoteForDay(sessions, day, name) {
  const key = exKey(name);
  const sameDay = function (s) {
    return s.dayId ? s.dayId === day.id : exKey(s.dayName) === exKey(day.name);
  };
  const sorted = sessions.filter(sameDay).sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0);
  });
  for (const s of sorted) {
    const ex = (s.exercises || []).find(function (e) { return exKey(e.name) === key; });
    if (ex) return ex.note || '';
  }
  return '';
}

function startSession(dayId) {
  return Promise.all([dbGet('program', 'program'), dbGetAll('sessions')]).then(function (res) {
    const program = res[0], sessions = res[1];
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
          note: lastNoteForDay(sessions, day, ex.name)
        };
      })
    };
    woView = 'session';
    return renderWorkouts();
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
  const target = exKey(name);
  const sorted = sessions.slice().sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0);
  });
  for (const s of sorted) {
    if (excludeId != null && s.id === excludeId) continue;
    for (const ex of (s.exercises || [])) {
      if (exKey(ex.name) !== target) continue;
      const logged = (ex.sets || []).filter(function (st) { return st.weight != null || st.reps != null; });
      if (logged.length) return { date: s.date, sets: ex.sets, note: ex.note || '' };
    }
  }
  return null;
}

/* ---------- today's suggested weight × reps (the faint placeholders) ----------
   Double progression within the prescribed rep range:
   - every set last time reached the top of the range → add one small weight step and
     restart at the bottom of the range, but only if Epley's estimated 1RM says the
     bottom of the range is still doable at the heavier weight;
   - otherwise keep each set's weight and aim for one more rep (capped at the top;
     a set that fell short of the bottom aims for the bottom). If the next weight step
     is too big a jump (e.g. 18 → 20 kg dumbbells), allow up to 2 reps past the top
     until the estimated 1RM makes the jump doable. */

function e1rm(w, r) { return w * (1 + r / 30); }                    // Epley
function repsAtWeight(oneRm, w) { return 30 * (oneRm / w - 1); }   // Epley, solved for reps

/* Smallest sensible jump: dumbbells/cables move ~1–2 kg, barbells/machines 2.5 kg, heavy lifts 5 kg. */
function weightStep(w) { return w < 10 ? 1 : w < 30 ? 2 : w < 100 ? 2.5 : 5; }

function roundTo(v, step) { return Math.round(v / step) * step; }

/* Returns [{weight, reps}] per set (either may be null = no suggestion). */
function suggestSets(last, presc, nSets) {
  const out = [];
  const range = presc && presc.reps && typeof presc.reps === 'object' ? presc.reps : null;
  const lo = range ? parseNum(range.min) : null, hi = range ? parseNum(range.max) : null;
  const done = last ? last.sets.filter(function (st) { return st.weight != null || st.reps != null; }) : [];
  if (!done.length) {
    for (let i = 0; i < nSets; i++) out.push({ weight: null, reps: hi != null ? hi : null });
    return out;
  }
  const loaded = done.filter(function (st) { return st.weight > 0 && st.reps > 0; });
  const allAtTop = hi != null && done.every(function (st) { return st.reps != null && st.reps >= hi; });

  let bump = null; // new weight for every set, when progressing load
  let cap = hi;
  if (allAtTop && loaded.length) {
    const top = Math.max.apply(null, loaded.map(function (st) { return st.weight; }));
    const best = Math.max.apply(null, loaded.map(function (st) { return e1rm(st.weight, st.reps); }));
    const next = roundTo(top + weightStep(top), 0.5);
    if (lo == null || repsAtWeight(best, next) >= lo - 0.5) bump = next;
    else cap = hi + 2;
  }

  for (let i = 0; i < nSets; i++) {
    const prev = done[Math.min(i, done.length - 1)];
    if (bump != null) { out.push({ weight: bump, reps: lo }); continue; }
    let reps = prev.reps != null ? prev.reps + 1 : null;
    if (reps != null && cap != null) reps = Math.min(reps, cap);
    if (reps != null && lo != null && prev.reps < lo) reps = lo;
    out.push({ weight: prev.weight, reps: reps });
  }
  return out;
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

/* History sheet for one exercise: graph + every logged session. Same-name exercises are linked (case-insensitive). */
function showExerciseHistory(name) {
  dbGetAll('sessions').then(function (sessions) {
    const key = exKey(name);
    openModal('<h3>' + esc(name) + '</h3><div id="ex-hist-chart"></div>' +
      '<h3 class="sub-h">All sessions</h3>' + exerciseLogHtml(sessions, key));
    mountExerciseChart($('#ex-hist-chart'), sessions, key, { metric: prExMetric, range: 'all' });
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
      html += '<div class="card"><div class="card-head"><h2>Today</h2></div><p class="lead">Done: ' +
        todaySessions.map(function (s) { return esc(s.dayName || 'Session'); }).join(', ') + '</p></div>';
    }

    if (!program.days.length) {
      html += '<div class="empty">No workout days in your program.<br>Tap <b>Edit program</b> to add days, or reset to the starter template.</div>';
    }

    program.days.forEach(function (day) {
      // Tap an exercise to see its history graph (linked across days by name).
      const preview = day.exercises.map(function (ex) {
        const reps = repRangeLabel(ex.reps);
        return '<button class="ex-line' + (ex.superset ? ' ss' : '') + '" data-action="wo-ex-history" data-name="' + esc(ex.name) + '">' +
          '<span>' + esc(ex.name) + '</span><span class="rx">' + fmt(parseNum(ex.sets)) + ' × ' + reps + '</span></button>';
      }).join('');
      html += '<div class="card day-card">' +
        '<div class="card-head"><h3>' + esc(day.name) + '</h3><span class="muted small">' + day.exercises.length + (day.exercises.length === 1 ? ' exercise' : ' exercises') + '</span></div>' +
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
    html += '<div class="card"><label>Session date<input type="date" id="ws-date" value="' + esc(s.date) + '"></label>' +
      '<p class="muted small mt0">Faint numbers are today’s suggestion: one more rep than last time, or a small weight jump once every set hit the top of the range.</p></div>';

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
      const sugg = suggestSets(last, presc, ex.sets.length);
      ex.sets.forEach(function (st, setIdx) {
        const sg = sugg[setIdx] || {};
        const wPh = sg.weight != null ? fmt(sg.weight, 1) : 'kg';
        const rPh = sg.reps != null ? fmt(sg.reps, 0) : 'reps';
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
      html += '<label class="note-label">Note<input type="text" value="' + esc(ex.note) + '" data-ex="' + exIdx + '" data-field="note" placeholder="e.g. felt strong, seat pos 4"></label>';
      html += '</div>';
    });

    html += '<button class="btn primary block" data-action="wo-save-session">Save session</button>';
    $('#screen-workouts').innerHTML = html;
  });
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
          return '<div class="small hist-line"><b>' + esc(ex.name) + '</b>' +
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
