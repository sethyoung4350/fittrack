/* FitTrack — Nutrition screen: daily log, today-vs-targets, 7-day averages. */
'use strict';

const NUTRITION_FIELDS = [
  { key: 'weight', label: 'Fasted weight (kg)', mode: 'decimal', dp: 1 },
  { key: 'calories', label: 'Calories (kcal)', mode: 'numeric' },
  { key: 'protein', label: 'Protein (g)', mode: 'decimal' },
  { key: 'carbs', label: 'Carbs (g)', mode: 'decimal' },
  { key: 'fat', label: 'Fat (g)', mode: 'decimal' },
  { key: 'fibre', label: 'Fibre (g)', mode: 'decimal' },
  { key: 'steps', label: 'Steps', mode: 'numeric' },
  { key: 'sleep', label: 'Sleep (/10)', mode: 'decimal', dp: 1 },
  { key: 'fluid', label: 'Fluid (mL)', mode: 'numeric' }
];

let nuFormOpen = false;
let nuEditingId = null;   // id of entry being edited, or null for a new one
let nuFormData = null;    // raw string values while form is open
let nuShowAll = false;

function initNutrition() {
  Screens.nutrition = renderNutrition;
  const screen = $('#screen-nutrition');

  screen.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    if (action === 'nu-open-form') {
      nuFormOpen = true; nuEditingId = null; nuFormData = null;
      renderNutrition().then(function () {
        const form = $('#nu-form-card');
        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else if (action === 'nu-cancel') {
      nuFormOpen = false; nuEditingId = null; nuFormData = null;
      renderNutrition();
    } else if (action === 'nu-save') {
      saveNutritionEntry();
    } else if (action === 'nu-edit') {
      const id = Number(btn.getAttribute('data-id'));
      dbGet('nutrition', id).then(function (entry) {
        if (!entry) return;
        nuFormOpen = true; nuEditingId = id;
        nuFormData = {};
        NUTRITION_FIELDS.forEach(function (f) {
          nuFormData[f.key] = entry[f.key] == null ? '' : String(entry[f.key]);
        });
        nuFormData.date = entry.date;
        nuFormData.note = entry.note || '';
        return renderNutrition();
      }).then(function () {
        const form = $('#nu-form-card');
        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else if (action === 'nu-delete') {
      const id = Number(btn.getAttribute('data-id'));
      appConfirm('Delete this entry? This cannot be undone.', { danger: true, okLabel: 'Delete' })
        .then(function (ok) {
          if (!ok) return;
          return dbDelete('nutrition', id).then(function () {
            toast('Entry deleted');
            renderNutrition();
          });
        });
    } else if (action === 'nu-show-all') {
      nuShowAll = true;
      renderNutrition();
    }
  });
}

function saveNutritionEntry() {
  const dateInput = $('#nf-date');
  const date = (dateInput && dateInput.value) ? dateInput.value : todayStr();
  const base = { date: date, note: ($('#nf-note') ? $('#nf-note').value.trim() : '') };
  NUTRITION_FIELDS.forEach(function (f) {
    const input = $('#nf-' + f.key);
    base[f.key] = input ? parseNum(input.value) : null; // garbage text -> null, never crashes
  });

  const finish = function () {
    nuFormOpen = false; nuEditingId = null; nuFormData = null;
    toast('Entry saved');
    renderNutrition();
  };

  if (nuEditingId != null) {
    dbGet('nutrition', nuEditingId).then(function (existing) {
      const entry = Object.assign({}, existing || {}, base, { id: nuEditingId });
      if (!entry.createdAt) entry.createdAt = Date.now();
      return dbPut('nutrition', entry);
    }).then(finish);
  } else {
    base.createdAt = Date.now();
    dbPut('nutrition', base).then(finish);
  }
}

function nutritionFormHtml() {
  const d = nuFormData || {};
  const fieldsHtml = NUTRITION_FIELDS.map(function (f) {
    return '<label>' + esc(f.label) +
      '<input type="text" inputmode="' + f.mode + '" id="nf-' + f.key + '" value="' + esc(d[f.key] || '') + '" placeholder="–">' +
      '</label>';
  }).join('');
  return '<div class="card" id="nu-form-card">' +
    '<h3>' + (nuEditingId != null ? 'Edit entry' : 'Log entry') + '</h3>' +
    '<label>Date<input type="date" id="nf-date" value="' + esc(d.date || todayStr()) + '"></label>' +
    '<div class="grid2">' + fieldsHtml + '</div>' +
    '<label>Feedback / notes<textarea id="nf-note" placeholder="How did the day go?">' + esc(d.note || '') + '</textarea></label>' +
    '<div class="row">' +
    '<button class="btn ghost" data-action="nu-cancel">Cancel</button>' +
    '<button class="btn primary" data-action="nu-save">Save</button>' +
    '</div></div>';
}

function nutritionEntryCard(entry) {
  const chips = [];
  function chip(label, val, unit, dp) {
    if (val != null) chips.push('<span class="chip"><b>' + label + '</b> ' + fmt(val, dp || 0) + (unit || '') + '</span>');
  }
  chip('Weight', parseNum(entry.weight), ' kg', 1);
  chip('Cals', parseNum(entry.calories), '');
  chip('P', parseNum(entry.protein), 'g');
  chip('C', parseNum(entry.carbs), 'g');
  chip('F', parseNum(entry.fat), 'g');
  chip('Fibre', parseNum(entry.fibre), 'g');
  chip('Steps', parseNum(entry.steps), '');
  chip('Sleep', parseNum(entry.sleep), '/10', 1);
  chip('Fluid', parseNum(entry.fluid), ' mL');
  return '<div class="card entry-card">' +
    '<div class="entry-head"><strong>' + esc(niceDate(entry.date)) + '</strong>' +
    '<div class="entry-actions">' +
    '<button class="btn small ghost" data-action="nu-edit" data-id="' + entry.id + '">Edit</button>' +
    '<button class="btn small danger-ghost" data-action="nu-delete" data-id="' + entry.id + '">Delete</button>' +
    '</div></div>' +
    (chips.length ? '<div class="chips">' + chips.join('') + '</div>' : '<div class="muted small-text">No numbers logged</div>') +
    (entry.note ? '<div class="entry-note">' + esc(entry.note) + '</div>' : '') +
    '</div>';
}

function renderNutrition() {
  return dbGetAll('nutrition').then(function (entries) {
    entries.sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0);
    });
    const targets = getTargets();
    const today = todayStr();
    const totals = dayTotals(entries, today);
    const avg = rollingAverages(entries, today, 7);

    let html = '';

    // Today vs targets
    html += '<div class="card"><h2>Today vs targets</h2>';
    if (totals.count === 0) {
      html += '<p class="muted small-text mt0">Nothing logged today yet.</p>';
    }
    html += targetsHtml(totals, targets) + '</div>';

    // 7-day averages
    html += '<div class="card"><h2>7-day averages</h2>';
    const anyAvg = ['calories', 'protein', 'carbs', 'fat', 'steps', 'weight'].some(function (f) { return avg[f] != null; });
    if (anyAvg) {
      html += '<div class="stat-grid">' +
        '<div class="stat"><div class="v">' + fmt(avg.calories) + '</div><div class="l">kcal</div></div>' +
        '<div class="stat"><div class="v">' + fmt(avg.protein) + '</div><div class="l">Protein g</div></div>' +
        '<div class="stat"><div class="v">' + fmt(avg.carbs) + '</div><div class="l">Carbs g</div></div>' +
        '<div class="stat"><div class="v">' + fmt(avg.fat) + '</div><div class="l">Fat g</div></div>' +
        '<div class="stat"><div class="v">' + fmt(avg.steps) + '</div><div class="l">Steps</div></div>' +
        '<div class="stat"><div class="v">' + fmt(avg.weight, 1) + '</div><div class="l">Weight kg</div></div>' +
        '</div>';
    } else {
      html += '<p class="muted small-text mt0">Averages appear once you have entries in the last 7 days.</p>';
    }
    html += '</div>';

    // Add button / form
    if (nuFormOpen) {
      html += nutritionFormHtml();
    } else {
      html += '<button class="btn primary block" data-action="nu-open-form">+ Log entry</button><div style="height:12px"></div>';
    }

    // Past entries
    if (entries.length === 0) {
      html += '<div class="empty">' +
        '<div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div>' +
        'No entries yet — tap <b>+ Log entry</b> to record today’s weight, food and steps.</div>';
    } else {
      const visible = nuShowAll ? entries : entries.slice(0, 60);
      html += visible.map(nutritionEntryCard).join('');
      if (!nuShowAll && entries.length > visible.length) {
        html += '<button class="btn ghost block" data-action="nu-show-all">Show all ' + entries.length + ' entries</button>';
      }
    }

    $('#screen-nutrition').innerHTML = html;
  });
}
