/* FitTrack — Today dashboard: nutrition vs targets, workout status, weight, 7-day trend. */
'use strict';

let twOpen = false; // quick weight input expanded even though today is already logged

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
      renderToday().then(function () {
        const input = $('#tw-input');
        if (input) input.focus();
      });
    }
  });
  $('#screen-today').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'tw-input') {
      e.preventDefault();
      saveQuickWeight();
    }
  });
}

/* Save the quick weight into today's nutrition entry (or create one with just the weight). */
function saveQuickWeight() {
  const input = $('#tw-input');
  const v = input ? parseNum(input.value) : null;
  if (v == null || v <= 0) {
    toast('Enter your weight in kg');
    if (input) input.focus();
    return;
  }
  dbGetAll('nutrition').then(function (entries) {
    const today = todayStr();
    const todays = entries.filter(function (e) { return e.date === today; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    if (todays.length) {
      const entry = todays[0];
      entry.weight = v;
      return dbPut('nutrition', entry);
    }
    return dbPut('nutrition', { date: today, weight: v, note: '', createdAt: Date.now() });
  }).then(function () {
    twOpen = false;
    toast('Weight logged ✔');
    renderToday();
  });
}

function renderToday() {
  return Promise.all([dbGetAll('nutrition'), dbGetAll('sessions')]).then(function (res) {
    const entries = res[0], sessions = res[1];
    const today = todayStr();
    const targets = getTargets();
    const totals = dayTotals(entries, today);
    const avg = rollingAverages(entries, today, 7);
    const prevAvg = rollingAverages(entries, dateAdd(today, -7), 7);

    // Latest logged weight (any date)
    let latestWeight = null, latestWeightDate = null;
    entries.slice().sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0);
    }).some(function (e) {
      const v = parseNum(e.weight);
      if (v != null) { latestWeight = v; latestWeightDate = e.date; return true; }
      return false;
    });

    const todaySessions = sessions.filter(function (s) { return s.date === today; });

    let html = '';

    const isEmpty = entries.length === 0 && sessions.length === 0;
    if (isEmpty) {
      html += '<div class="card"><h3>Welcome to FitTrack 👋</h3>' +
        '<p class="muted small-text">Everything starts empty and lives only on this device.</p>' +
        '<p class="small-text">1. Check your daily targets in <b>Settings</b>.<br>' +
        '2. Log weight &amp; food in <b>Nutrition</b>.<br>' +
        '3. Start a session in <b>Workouts</b>.</p>' +
        '<div class="row"><button class="btn primary" data-goto="nutrition">Log today</button>' +
        '<button class="btn ghost" data-goto="settings">Targets</button></div></div>';
    }

    // Today's logged weight (latest non-empty among today's entries)
    let todayWeight = null;
    entries.filter(function (e) { return e.date === today; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })
      .some(function (e) {
        const v = parseNum(e.weight);
        if (v != null) { todayWeight = v; return true; }
        return false;
      });

    // Weight
    const showWeightInput = todayWeight == null || twOpen;
    html += '<div class="card"><h2>Weight</h2>';
    if (showWeightInput) {
      html += '<div class="quicklog">' +
        '<input type="text" inputmode="decimal" id="tw-input" aria-label="Fasted weight (kg)" placeholder="' +
        (todayWeight != null ? fmt(todayWeight, 1) : 'kg') + '">' +
        '<button class="btn primary" data-action="tw-save">Log</button></div>';
    }
    if (latestWeight != null) {
      let trend = '';
      if (avg.weight != null && prevAvg.weight != null) {
        const diff = avg.weight - prevAvg.weight;
        const arrow = diff > 0.05 ? '▲' : diff < -0.05 ? '▼' : '→';
        trend = arrow + ' ' + (diff >= 0 ? '+' : '') + fmt(diff, 1) + ' kg vs prev week';
      }
      html += '<div class="stat-grid">' +
        '<div class="stat"><div class="v">' + fmt(latestWeight, 1) + '</div><div class="l">Latest' + (latestWeightDate === today ? ' (today)' : '') + '</div></div>' +
        '<div class="stat"><div class="v">' + fmt(avg.weight, 1) + '</div><div class="l">7-day avg</div></div>' +
        '<div class="stat"><div class="v" style="font-size:14px;line-height:2">' + (trend || '–') + '</div><div class="l">Trend</div></div>' +
        '</div>';
      const goal = parseNum(targets.goalWeight);
      if (goal != null && goal > 0) {
        const toGo = latestWeight - goal;
        const goalText = Math.abs(toGo) <= 0.3
          ? 'at goal 🎯'
          : fmt(Math.abs(toGo), 1) + ' kg to go ' + (toGo > 0 ? '▼' : '▲');
        html += '<p class="goal-line">Goal ' + fmt(goal, 1) + ' kg — ' + goalText + '</p>';
      }
    } else {
      html += '<p class="muted small-text" style="margin:10px 0 0">Fasted, first thing in the morning is best.</p>';
    }
    if (!showWeightInput) {
      html += '<button class="btn small ghost" style="margin-top:12px" data-action="tw-open">Update today’s weight</button>';
    }
    html += '</div>';

    // Nutrition rings (calories / protein / steps), rest of the macros as bars
    html += '<div class="card"><h2>Nutrition today</h2>';
    if (totals.count === 0) {
      html += '<p class="muted small-text mt0">Nothing logged today yet.</p>';
    }
    html += '<div class="ring-grid">' +
      ringSVG(totals.calories, targets.calories, 'Calories') +
      ringSVG(totals.protein, targets.protein, 'Protein') +
      ringSVG(totals.steps, targets.steps, 'Steps') +
      '</div>' +
      '<button class="btn ghost block" style="margin-top:14px" data-goto="nutrition">' +
      (totals.count === 0 ? 'Log today' : 'Open nutrition log') + '</button></div>';

    // Workout status
    html += '<div class="card"><h2>Workout today</h2>';
    if (todaySessions.length) {
      html += '<p class="mt0">✅ ' + todaySessions.map(function (s) { return esc(s.dayName || 'Session'); }).join(', ') + ' logged.</p>';
    } else {
      html += '<p class="muted mt0">Not logged yet.</p>';
    }
    html += '<button class="btn ghost block" data-goto="workouts">' + (todaySessions.length ? 'Open workouts' : 'Start a session') + '</button></div>';

    // 7-day snapshot
    const anySnap = ['calories', 'protein', 'steps'].some(function (f) { return avg[f] != null; });
    html += '<div class="card"><h2>7-day snapshot</h2>';
    if (anySnap) {
      html += '<div class="stat-grid">' +
        '<div class="stat"><div class="v">' + fmt(avg.calories) + '</div><div class="l">Avg kcal</div></div>' +
        '<div class="stat"><div class="v">' + fmt(avg.protein) + '</div><div class="l">Avg protein g</div></div>' +
        '<div class="stat"><div class="v">' + fmt(avg.steps) + '</div><div class="l">Avg steps</div></div>' +
        '</div>';
    } else {
      html += '<p class="muted small-text mt0" style="margin-bottom:0">Averages appear once you log a few days.</p>';
    }
    html += '</div>';

    $('#screen-today').innerHTML = html;
  });
}
