/* FitTrack — Settings: goal weight, backup (export/import), erase. */
'use strict';

function initSettings() {
  Screens.settings = renderSettings;
  const screen = $('#screen-settings');

  screen.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    if (action === 'st-save-goal') {
      // Goal weight is optional: blank or invalid clears it.
      const t = getTargets();
      const gw = parseNum($('#st-goalWeight').value);
      t.goalWeight = gw != null && gw > 0 ? gw : null;
      saveTargets(t);
      toast('Goal saved');
      renderSettings();
    } else if (action === 'st-export') {
      exportData();
    } else if (action === 'st-import') {
      const input = $('#st-import-file');
      if (input) input.click();
    } else if (action === 'st-erase') {
      appConfirm('Erase ALL data on this device (weights, workouts, notes, photos, goal)? Export a backup first if you want to keep anything.', { danger: true, okLabel: 'Erase everything' })
        .then(function (ok) {
          if (!ok) return;
          eraseAllData().then(function () {
            toast('All data erased');
            renderSettings();
          });
        });
    }
  });

  screen.addEventListener('change', function (e) {
    if (e.target.id === 'st-import-file' && e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      e.target.value = '';
      importFromFile(file);
    }
  });
}

/* ---------- backup / restore ---------- */

function blobToDataURL(blob) {
  return new Promise(function (resolve, reject) {
    const r = new FileReader();
    r.onload = function () { resolve(r.result); };
    r.onerror = function () { reject(r.error); };
    r.readAsDataURL(blob);
  });
}

function dataURLToBlob(dataUrl) {
  // data:[<mediatype>][;base64],<data>
  const parts = String(dataUrl).split(',');
  const mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(parts[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* Gather everything into a plain JSON-able object (photos as data URLs). */
function collectExportPayload() {
  return Promise.all([
    dbGetAll('nutrition'), dbGetAll('sessions'), dbGet('program', 'program'),
    dbGetAll('notes'), dbGetAll('photos')
  ]).then(function (res) {
    const photos = res[4];
    return Promise.all(photos.map(function (p) {
      return blobToDataURL(p.blob).then(function (dataUrl) {
        return { id: p.id, date: p.date, type: p.type, createdAt: p.createdAt, dataUrl: dataUrl };
      });
    })).then(function (photosOut) {
      return {
        app: 'FitTrack',
        schema: 1,
        exportedAt: new Date().toISOString(),
        targets: getTargets(),
        nutrition: res[0],
        sessions: res[1],
        program: res[2] || null,
        notes: res[3],
        photos: photosOut
      };
    });
  });
}

function exportData() {
  collectExportPayload().then(function (payload) {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fittrack-backup-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    toast('Backup downloaded');
  }).catch(function (err) {
    console.error(err);
    toast('Export failed: ' + err.message);
  });
}

/* Replace all app data with the payload's contents. Assumes payload is validated. */
function applyImportPayload(payload) {
  const stores = ['nutrition', 'sessions', 'notes', 'photos', 'program'];
  return Promise.all(stores.map(dbClear)).then(function () {
    const writes = [];
    (payload.nutrition || []).forEach(function (e) { writes.push(dbPut('nutrition', e)); });
    (payload.sessions || []).forEach(function (s) { writes.push(dbPut('sessions', s)); });
    (payload.notes || []).forEach(function (n) { writes.push(dbPut('notes', n)); });
    (payload.photos || []).forEach(function (p) {
      if (!p || !p.dataUrl) return;
      try {
        writes.push(dbPut('photos', { id: p.id, date: p.date, type: p.type, createdAt: p.createdAt, blob: dataURLToBlob(p.dataUrl) }));
      } catch (e) { console.warn('Skipped one photo during import', e); }
    });
    writes.push(payload.program && Array.isArray(payload.program.days)
      ? dbPut('program', Object.assign({}, payload.program, { id: 'program' }))
      : dbPut('program', defaultProgram()));
    if (payload.targets) saveTargets(payload.targets);
    return Promise.all(writes);
  });
}

function importFromFile(file) {
  file.text().then(function (text) {
    let payload;
    try { payload = JSON.parse(text); } catch (e) { toast('Not a valid backup file'); return; }
    if (!payload || payload.app !== 'FitTrack') { toast('Not a FitTrack backup file'); return; }
    const counts = (payload.nutrition || []).filter(function (e) { return e && e.weight != null; }).length + ' weigh-ins, ' +
      (payload.sessions || []).length + ' workouts, ' +
      (payload.notes || []).length + ' notes, ' + (payload.photos || []).length + ' photos';
    appConfirm('Import backup from ' + (payload.exportedAt || 'unknown date').slice(0, 10) + ' (' + counts + ')? This REPLACES all current data on this device.', { danger: true, okLabel: 'Import & replace' })
      .then(function (ok) {
        if (!ok) return;
        applyImportPayload(payload).then(function () {
          toast('Backup restored');
          renderSettings();
        }).catch(function (err) {
          console.error(err);
          toast('Import failed: ' + err.message);
        });
      });
  });
}

function eraseAllData() {
  return Promise.all([
    dbClear('nutrition'), dbClear('sessions'), dbClear('notes'), dbClear('photos'), dbClear('program')
  ]).then(function () {
    localStorage.removeItem('fittrack.targets');
    return dbPut('program', defaultProgram()); // keep the blank starter template
  });
}

/* ---------- render ---------- */

function renderSettings() {
  const t = getTargets();
  let html = '<section class="card"><div class="card-head"><h2>Goal weight</h2></div>' +
    '<div class="quicklog"><input type="text" inputmode="decimal" id="st-goalWeight" aria-label="Goal weight in kg" placeholder="Optional, kg" value="' +
    (parseNum(t.goalWeight) != null ? esc(t.goalWeight) : '') + '">' +
    '<button class="btn primary" data-action="st-save-goal">Save</button></div>' +
    '<p class="muted small">Shown as a dashed line on your weight graph. Leave blank for none.</p></section>';

  html += '<section class="card"><div class="card-head"><h2>Backup</h2></div>' +
    '<p class="muted small">Your data lives only on this device. Export a backup now and then and keep it somewhere safe.</p>' +
    '<div class="row">' +
    '<button class="btn primary" data-action="st-export">Export</button>' +
    '<button class="btn" data-action="st-import">Import</button>' +
    '</div>' +
    '<input type="file" id="st-import-file" accept=".json,application/json" hidden></section>';

  html += '<section class="card"><button class="btn danger-ghost block" data-action="st-erase">Erase all data</button></section>';
  html += '<p class="muted small center">FitTrack · works offline · data stays on this device</p>';

  $('#screen-settings').innerHTML = html;
  return Promise.resolve();
}
