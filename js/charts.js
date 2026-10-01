/* FitTrack — interactive line chart (inline SVG, no libs).
   Drag / hover across the chart to read any point; arrow keys work when focused. */
'use strict';

const CHART_RANGES = [
  { key: '1m', label: '1M', days: 31 },
  { key: '3m', label: '3M', days: 92 },
  { key: '6m', label: '6M', days: 183 },
  { key: 'all', label: 'All', days: null }
];

let _chartUid = 0;

/* Monotone cubic (Fritsch–Carlson): smooth, but never overshoots past the real values. */
function smoothPathD(coords) {
  const n = coords.length;
  const f = function (v) { return v.toFixed(1); };
  if (n < 3) return coords.map(function (c, i) { return (i ? 'L' : 'M') + f(c[0]) + ' ' + f(c[1]); }).join(' ');
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = coords[i + 1][0] - coords[i][0];
    m[i] = dx[i] ? (coords[i + 1][1] - coords[i][1]) / dx[i] : 0;
  }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) { t[i] = 0; continue; }
    const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
    t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
  }
  let d = 'M' + f(coords[0][0]) + ' ' + f(coords[0][1]);
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ' C' + f(coords[i][0] + h) + ' ' + f(coords[i][1] + t[i] * h) + ' ' +
      f(coords[i + 1][0] - h) + ' ' + f(coords[i + 1][1] - t[i + 1] * h) + ' ' +
      f(coords[i + 1][0]) + ' ' + f(coords[i + 1][1]);
  }
  return d;
}

/* "+0.6", "−1.2", "±0" with the sign taken from the rounded value. */
function signed(v, dp) {
  const r = Number(Math.abs(v).toFixed(dp));
  return (r === 0 ? '±' : v > 0 ? '+' : '−') + fmt(r, dp);
}

function shortDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return isNaN(d) ? dateStr : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/* points: [{x:'YYYY-MM-DD', y:number, note?:string}] ascending.
   opts: { unit, dp, goal, ranges (bool), range (initial key), label, emptyText } */
function mountLineChart(host, points, opts) {
  opts = opts || {};
  if (!host) return;
  let range = opts.range || 'all';

  function render() {
    if (!points.length) {
      host.innerHTML = '<div class="empty small">' + esc(opts.emptyText || 'No data yet') + '</div>';
      return;
    }
    let shown = points;
    const r = CHART_RANGES.find(function (c) { return c.key === range; });
    if (r && r.days) {
      const cutoff = dateAdd(points[points.length - 1].x, -r.days);
      shown = points.filter(function (p) { return p.x >= cutoff; });
    }
    draw(shown);
  }

  function draw(pts) {
    const dp = opts.dp == null ? 1 : opts.dp;
    const unit = opts.unit || '';
    const W = 340, H = 170, padL = 34, padR = 10, padT = 12, padB = 22;
    const gid = 'cg' + (++_chartUid);
    const xs = pts.map(function (p) { return new Date(p.x + 'T12:00:00').getTime(); });
    const ys = pts.map(function (p) { return p.y; });
    let minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    let minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    if (opts.goal != null) { minY = Math.min(minY, opts.goal); maxY = Math.max(maxY, opts.goal); }
    if (minX === maxX) { minX -= 43200000; maxX += 43200000; }
    const spanY = maxY - minY;
    const padY = spanY === 0 ? (Math.abs(maxY) * 0.05 || 1) : spanY * 0.15;
    minY -= padY; maxY += padY;
    const sx = function (t) { return padL + ((t - minX) / (maxX - minX)) * (W - padL - padR); };
    const sy = function (v) { return padT + ((maxY - v) / (maxY - minY)) * (H - padT - padB); };
    const coords = pts.map(function (p, i) { return [sx(xs[i]), sy(p.y)]; });

    let html = '<div class="chart-top"><div class="readout">' +
      '<div class="ro-value"><span data-ro="v"></span><small>' + esc(unit) + '</small></div>' +
      '<div class="ro-sub"><span data-ro="d"></span><span class="ro-delta" data-ro="c"></span></div></div>';
    if (opts.ranges) {
      html += '<div class="seg" role="group" aria-label="Range">' + CHART_RANGES.map(function (c) {
        return '<button type="button" class="' + (c.key === range ? 'on' : '') + '" data-range="' + c.key + '">' + c.label + '</button>';
      }).join('') + '</div>';
    }
    html += '</div>';

    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" tabindex="0" role="img" aria-label="' + esc(opts.label || 'Chart') + '. Drag to read values.">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="currentColor" stop-opacity="0.18"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/>' +
      '</linearGradient></defs>';
    for (let i = 0; i <= 2; i++) {
      const v = minY + ((maxY - minY) * (i + 0.5)) / 3;
      const y = sy(v).toFixed(1);
      svg += '<line class="grid" x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '"/>' +
        '<text class="ax" x="' + (padL - 6) + '" y="' + (Number(y) + 3.5).toFixed(1) + '" text-anchor="end">' + fmt(v, dp) + '</text>';
    }
    if (opts.goal != null) {
      const gy = sy(opts.goal).toFixed(1);
      svg += '<line class="goal" x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '"/>' +
        '<text class="ax goal-t" x="' + (W - padR) + '" y="' + (gy - 4) + '" text-anchor="end">Goal ' + fmt(opts.goal, dp) + '</text>';
    }
    const lineD = smoothPathD(coords);
    const baseY = (H - padB).toFixed(1);
    if (coords.length > 1) {
      svg += '<path fill="url(#' + gid + ')" d="' + lineD + ' L' + coords[coords.length - 1][0].toFixed(1) + ' ' + baseY +
        ' L' + coords[0][0].toFixed(1) + ' ' + baseY + ' Z"/>' +
        '<path class="line" d="' + lineD + '"/>';
    }
    if (coords.length <= 45) {
      coords.forEach(function (c) { svg += '<circle class="pt" cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="2.4"/>'; });
    }
    svg += '<text class="ax" x="' + padL + '" y="' + (H - 5) + '">' + esc(shortDate(pts[0].x)) + '</text>';
    if (pts.length > 1) svg += '<text class="ax" x="' + (W - padR) + '" y="' + (H - 5) + '" text-anchor="end">' + esc(shortDate(pts[pts.length - 1].x)) + '</text>';
    svg += '<line class="xhair" data-xh x1="0" x2="0" y1="' + padT + '" y2="' + baseY + '"/>' +
      '<circle class="focus-halo" data-fh r="9"/><circle class="focus" data-fd r="4.5"/>' +
      '<rect class="hit" x="0" y="0" width="' + W + '" height="' + H + '"/></svg>';

    host.innerHTML = html + svg;

    const svgEl = host.querySelector('svg');
    const ro = { v: host.querySelector('[data-ro="v"]'), d: host.querySelector('[data-ro="d"]'), c: host.querySelector('[data-ro="c"]') };
    const xh = host.querySelector('[data-xh]'), fd = host.querySelector('[data-fd]'), fh = host.querySelector('[data-fh]');
    const last = pts.length - 1;
    let current = last;

    function show(i, scrubbing) {
      current = i;
      const p = pts[i], c = coords[i];
      ro.v.textContent = p.y.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
      ro.d.textContent = (i === last && !scrubbing ? 'Latest · ' : '') + niceDate(p.x) + (p.note ? ' · ' + p.note : '');
      if (i > 0) {
        const diff = p.y - pts[0].y;
        ro.c.textContent = signed(diff, dp) + ' ' + unit + ' since ' + shortDate(pts[0].x);
      } else {
        ro.c.textContent = '';
      }
      [fd, fh].forEach(function (el) { el.setAttribute('cx', c[0].toFixed(1)); el.setAttribute('cy', c[1].toFixed(1)); });
      xh.setAttribute('x1', c[0].toFixed(1)); xh.setAttribute('x2', c[0].toFixed(1));
      host.classList.toggle('scrubbing', !!scrubbing);
    }

    function nearest(clientX) {
      const rect = svgEl.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * W;
      let best = 0, bestD = Infinity;
      coords.forEach(function (c, i) { const d = Math.abs(c[0] - x); if (d < bestD) { bestD = d; best = i; } });
      return best;
    }

    svgEl.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse') svgEl.setPointerCapture(e.pointerId);
      show(nearest(e.clientX), true);
    });
    svgEl.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse' || svgEl.hasPointerCapture(e.pointerId)) show(nearest(e.clientX), true);
    });
    ['pointerleave', 'pointerup', 'pointercancel'].forEach(function (ev) {
      svgEl.addEventListener(ev, function (e) {
        if (ev === 'pointerup' && e.pointerType === 'mouse') return;
        show(last, false);
      });
    });
    svgEl.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        show(Math.max(0, Math.min(last, current + (e.key === 'ArrowLeft' ? -1 : 1))), true);
      }
    });
    svgEl.addEventListener('blur', function () { show(last, false); });

    show(last, false);
  }

  host.onclick = function (e) {
    const b = e.target.closest('[data-range]');
    if (!b) return;
    range = b.getAttribute('data-range');
    if (opts.onRange) opts.onRange(range);
    render();
  };

  render();
}
