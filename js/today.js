/* FitTrack — Today: log weight, weight trend chart, today's / next workout. */
'use strict';

let twOpen = false;          // weight input expanded even though today is already logged
let twRange = '1m';          // remembered chart range on this screen

function initToday() {
  Screens.today = renderToday;
  $('#screen-today').addEventListener('click', function (e) {
    const goto = e.target.closest('[data-goto]');
    if (goto) { showScreen(goto.getAttribute('data-goto')); return; }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'tw-save') {
      saveQuickWeight();
    } else if (action === 'tw-open') {
      twOpen = true;
      renderToday().then(function () { const input = $('#tw-input'); if (input) input.focus(); });
    } else if (action === 'tw-start') {
      startSession(btn.getAttribute('data-day-id')).then(function () { showScreen('workouts'); });
    }
  });
  $('#screen-today').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'tw-input') {
      e.preventDefault();
      saveQuickWeight();
    }
  });
}

/* Save today's weight (updates today's entry if there is one). */
function saveQuickWeight() {
  const input = $('#tw-input');
  const v = input ? parseNum(input.value) : null;
  if (v == null || v <= 0) {
    toast('Enter your weight in kg');
    if (input) input.focus();
    return;
  }
  saveWeightForDate(todayStr(), v).then(function () {
    twOpen = false;
    toast('Weight logged');
    renderToday();
  });
}

/* Upsert the weight for a date (one weight per day). */
function saveWeightForDate(date, v) {
  return dbGetAll('nutrition').then(function (entries) {
    const same = entries.filter(function (e) { return e.date === date; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    if (same.length) {
      same[0].weight = v;
      return dbPut('nutrition', same[0]);
    }
    return dbPut('nutrition', { date: date, weight: v, note: '', createdAt: Date.now() });
  });
}

/* The program day after the most recently logged one (wraps around). */
function nextProgramDay(program, sessions) {
  const days = (program && program.days) || [];
  if (!days.length) return null;
  const last = sessions.slice().sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0);
  })[0];
  if (!last) return days[0];
  const idx = days.findIndex(function (d) { return d.id === last.dayId; });
  return idx === -1 ? days[0] : days[(idx + 1) % days.length];
}

function renderToday() {
  return Promise.all([dbGetAll('nutrition'), dbGetAll('sessions'), dbGet('program', 'program')]).then(function (res) {
    const series = weightSeries(res[0]), sessions = res[1], program = res[2];
    const today = todayStr();
    const latest = series.length ? series[series.length - 1] : null;
    const todayWeight = latest && latest.x === today ? latest.y : null;
    const avg = avgInWindow(series, today, 7);
    const prevAvg = avgInWindow(series, dateAdd(today, -7), 7);
    const goal = parseNum(getTargets().goalWeight);

    let html = '';

    // Weight
    html += '<section class="card">';
    html += '<div class="card-head"><h2>Weight</h2>' +
      (todayWeight != null && !twOpen ? '<button class="link" data-action="tw-open">Edit today</button>' : '') + '</div>';
    if (todayWeight == null || twOpen) {
      html += '<div class="quicklog">' +
        '<input type="text" inputmode="decimal" id="tw-input" aria-label="Today’s weight (kg)" placeholder="' +
        (todayWeight != null ? fmt(todayWeight, 1) : (latest ? fmt(latest.y, 1) : '0.0')) + ' kg">' +
        '<button class="btn primary" data-action="tw-save">Log</button></div>';
    }
    if (series.length) {
      const stats = [['7-day avg', avg != null ? fmt(avg, 1) + ' kg' : '–']];
      if (avg != null && prevAvg != null) {
        const d = avg - prevAvg;
        stats.push(['vs last week', signed(d, 1) + ' kg']);
      }
      if (goal != null && goal > 0 && latest) {
        const toGo = latest.y - goal;
        stats.push(['Goal ' + fmt(goal, 1), Math.abs(toGo) <= 0.3 ? 'Reached' : fmt(Math.abs(toGo), 1) + ' kg to go']);
      }
      html += '<div class="chart-host" id="today-weight-chart"></div>';
      html += '<div class="stats">' + stats.map(function (s) {
        return '<div><div class="l">' + esc(s[0]) + '</div><div class="v">' + esc(s[1]) + '</div></div>';
      }).join('') + '</div>';
    } else {
      html += '<p class="muted small">Weigh in first thing in the morning for the most consistent trend.</p>';
    }
    html += '</section>';

    // Workout
    const todaySessions = sessions.filter(function (s) { return s.date === today; });
    html += '<section class="card"><div class="card-head"><h2>Workout</h2></div>';
    if (todaySessions.length) {
      html += '<p class="lead">Done today</p><p class="muted small">' +
        todaySessions.map(function (s) { return esc(s.dayName || 'Session'); }).join(', ') + '</p>' +
        '<button class="btn block" data-goto="workouts">Open workouts</button>';
    } else {
      const next = nextProgramDay(program, sessions);
      if (next) {
        html += '<p class="muted small">Up next</p><p class="lead">' + esc(next.name) + '</p>' +
          '<p class="muted small">' + next.exercises.length + (next.exercises.length === 1 ? ' exercise' : ' exercises') + '</p>' +
          '<button class="btn primary block" data-action="tw-start" data-day-id="' + esc(next.id) + '">Start session</button>';
      } else {
        html += '<p class="muted small">No program days yet.</p><button class="btn block" data-goto="workouts">Set up program</button>';
      }
    }
    html += '</section>';

    $('#screen-today').innerHTML = html;
    if (series.length) {
      mountLineChart($('#today-weight-chart'), series, {
        unit: 'kg', dp: 1, ranges: true, range: twRange, label: 'Body weight over time',
        goal: goal != null && goal > 0 ? goal : null,
        onRange: function (r) { twRange = r; }
      });
    }
  });
}
