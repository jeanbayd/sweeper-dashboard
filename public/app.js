'use strict';

/* ============================================================
 *  AUTH / FETCH WRAPPER
 * ============================================================ */
const LS_KEY = 'sweeper_dash_api_key';

function getApiKey() { return localStorage.getItem(LS_KEY) || ''; }
function setApiKey(k) { localStorage.setItem(LS_KEY, k); }
function clearApiKey() { localStorage.removeItem(LS_KEY); }

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erreur HTTP ${res.status}`);
  }
  return res.json();
}

const gateEl = document.getElementById('gate');
const appEl = document.getElementById('app');
const gateInput = document.getElementById('gate-input');
const gateBtn = document.getElementById('gate-btn');
const gateError = document.getElementById('gate-error');

async function tryEnter(key) {
  if (key) setApiKey(key);
  try {
    await api('/api/sweepers');
    gateEl.classList.add('hidden');
    appEl.classList.remove('hidden');
    initApp();
  } catch (e) {
    clearApiKey();
    gateError.textContent = e.message === 'UNAUTHORIZED' ? 'Clé invalide.' : e.message;
  }
}

gateBtn.addEventListener('click', () => tryEnter(gateInput.value.trim()));
gateInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryEnter(gateInput.value.trim()); });
document.getElementById('logout-btn').addEventListener('click', () => {
  clearApiKey();
  appEl.classList.add('hidden');
  gateEl.classList.remove('hidden');
});

// auto-login si clé déjà stockée
if (getApiKey()) tryEnter();

/* ============================================================
 *  HELPERS
 * ============================================================ */
const PALETTE = ['#00e5ff', '#ff2fd1', '#ffb300', '#29ffb0', '#7c8bff', '#ff6b6b'];
function accentFor(login) {
  let h = 0;
  for (let i = 0; i < login.length; i++) h = (h * 31 + login.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function hexToRgba(hex, a) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function fmtNum(v, d = 1) { return v == null ? '—' : Number(v).toFixed(d); }
function fmtDuration(min) {
  if (min == null) return '—';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
}
function relTime(iso) {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}
function fmtDT(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function sparklineSVG(values, { w = 220, h = 40, color = '#00e5ff' } = {}) {
  const vals = values.filter(v => v != null);
  if (vals.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const step = w / (vals.length - 1);
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * (h - 6) - 3).toFixed(1)}`);
  const areaPts = `0,${h} ${pts.join(' ')} ${w},${h}`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polygon points="${areaPts}" fill="${hexToRgba(color, 0.12)}" />
    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${pts[pts.length - 1].split(',')[0]}" cy="${pts[pts.length - 1].split(',')[1]}" r="3" fill="${color}"/>
  </svg>`;
}

// Petit graphe ligne avec axe temporel, pour la vue détail.
function lineChartSVG(points, { w = 440, h = 160, color = '#00e5ff', unit = '' } = {}) {
  const vals = points.filter(p => p.v != null);
  if (vals.length < 2) return `<div class="empty-state">Pas assez de données (min. 2 sessions).</div>`;
  const min = Math.min(...vals.map(p => p.v)), max = Math.max(...vals.map(p => p.v));
  const range = (max - min) || 1;
  const padL = 34, padB = 20, padT = 10, padR = 10;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const step = plotW / (vals.length - 1);
  const coords = vals.map((p, i) => {
    const x = padL + i * step;
    const y = padT + plotH - ((p.v - min) / range) * plotH;
    return { x, y, ...p };
  });
  const line = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${padL},${padT + plotH} ${line} ${padL + plotW},${padT + plotH}`;
  const gridLines = [0, 0.5, 1].map(f => {
    const y = padT + plotH * f;
    const val = (max - f * range).toFixed(1);
    return `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#ffffff10"/>
            <text x="0" y="${y + 3}" fill="#7d90ab" font-size="9">${val}</text>`;
  }).join('');
  const dots = coords.map(c => `<circle cx="${c.x}" cy="${c.y}" r="3" fill="${color}"><title>${fmtDT(c.label)} — ${fmtNum(c.v)}${unit}</title></circle>`).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${gridLines}
    <polygon points="${area}" fill="${hexToRgba(color, 0.1)}"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2"/>
    ${dots}
  </svg>`;
}

// Bar chart pour la répartition horaire des actions ("today.hourlyActions").
// `hourlyActions` : [{ hour: "YYYY-MM-DDTHH", actions: N }, ...] (heure UTC en clé).
// `fillGaps` : si true, complète toutes les heures entre la 1ère et la dernière
// avec 0 (utile pour le grand graphe détail ; pas nécessaire pour la mini-version carte).
function hourBarChartSVG(hourlyActions, { w = 220, h = 46, color = '#29ffb0', fillGaps = false, showLabels = false } = {}) {
  if (!hourlyActions || !hourlyActions.length) {
    return `<svg width="${w}" height="${h}"></svg>`;
  }
  let data = hourlyActions.map(p => ({ ...p, localHour: new Date(p.hour + ':00:00Z').getHours() }));
  if (fillGaps) {
    const sorted = hourlyActions.map(p => p.hour).sort();
    const start = new Date(sorted[0] + ':00:00Z');
    const end = new Date(sorted[sorted.length - 1] + ':00:00Z');
    const byHour = new Map(hourlyActions.map(p => [p.hour, p.actions]));
    data = [];
    for (let t = new Date(start); t <= end; t = new Date(t.getTime() + 3600000)) {
      const key = t.toISOString().slice(0, 13);
      data.push({ hour: key, actions: byHour.get(key) || 0, localHour: t.getHours() });
    }
  }
  const max = Math.max(...data.map(d => d.actions), 1);
  const padB = showLabels ? 16 : 0;
  const plotH = h - padB;
  const barW = w / data.length;
  const bars = data.map((d, i) => {
    const barH = Math.max((d.actions / max) * (plotH - 4), d.actions > 0 ? 2 : 0);
    const x = i * barW;
    const y = plotH - barH;
    const label = showLabels ? `<text x="${(x + barW / 2).toFixed(1)}" y="${h - 3}" fill="#7d90ab" font-size="8" text-anchor="middle">${String(d.localHour).padStart(2, '0')}h</text>` : '';
    return `<rect x="${(x + barW * 0.15).toFixed(1)}" y="${y.toFixed(1)}" width="${(barW * 0.7).toFixed(1)}" height="${barH.toFixed(1)}" rx="2" fill="${color}">
      <title>${String(d.localHour).padStart(2, '0')}h — ${d.actions} action(s)</title>
    </rect>${label}`;
  }).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bars}</svg>`;
}

// Courbe (au lieu d'histogramme) de l'évolution du rythme actions/h dans la journée.
// Chaque point = actions comptées dans le créneau d'1h (donc directement le "rythme"
// de ce créneau) — mêmes données que hourBarChartSVG, juste en courbe pour mieux
// suivre la tendance d'une heure à l'autre.
function hourLineChartSVG(hourlyActions, { w = 900, h = 180, color = '#29ffb0' } = {}) {
  if (!hourlyActions || !hourlyActions.length) {
    return `<div class="empty-state">Pas encore de données aujourd'hui.</div>`;
  }
  const sorted = hourlyActions.map(p => p.hour).sort();
  const start = new Date(sorted[0] + ':00:00Z');
  const end = new Date(sorted[sorted.length - 1] + ':00:00Z');
  const byHour = new Map(hourlyActions.map(p => [p.hour, p.actions]));
  const data = [];
  for (let t = new Date(start); t <= end; t = new Date(t.getTime() + 3600000)) {
    const key = t.toISOString().slice(0, 13);
    data.push({ hour: key, actions: byHour.get(key) || 0, localHour: t.getHours() });
  }

  const padL = 34, padB = 20, padT = 10, padR = 10;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const max = Math.max(...data.map(d => d.actions), 1);

  if (data.length < 2) {
    const d = data[0];
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <circle cx="${padL}" cy="${(padT + plotH / 2).toFixed(1)}" r="4" fill="${color}">
        <title>${String(d.localHour).padStart(2, '0')}h — ${d.actions} action(s)/h</title>
      </circle>
    </svg>`;
  }

  const step = plotW / (data.length - 1);
  const coords = data.map((d, i) => ({
    x: padL + i * step,
    y: padT + plotH - (d.actions / max) * plotH,
    ...d,
  }));
  const line = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${padL},${padT + plotH} ${line} ${padL + plotW},${padT + plotH}`;
  const gridLines = [0, 0.5, 1].map(f => {
    const y = padT + plotH * f;
    const val = Math.round(max - f * max);
    return `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#ffffff10"/>
            <text x="0" y="${y + 3}" fill="#7d90ab" font-size="9">${val}</text>`;
  }).join('');
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));
  const xLabels = coords.map((c, i) => i % labelEvery === 0
    ? `<text x="${c.x.toFixed(1)}" y="${h - 4}" fill="#7d90ab" font-size="8" text-anchor="middle">${String(c.localHour).padStart(2, '0')}h</text>`
    : '').join('');
  const dots = coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" fill="${color}">
    <title>${String(c.localHour).padStart(2, '0')}h — ${c.actions} action(s)/h</title>
  </circle>`).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${gridLines}
    <polygon points="${area}" fill="${hexToRgba(color, 0.1)}"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2"/>
    ${dots}
    ${xLabels}
  </svg>`;
}

// Courbe multi-sweepers superposées (actions/h par créneau d'1h), pour comparer
// plusieurs AA visuellement sur une même fenêtre de temps plutôt que ligne à ligne
// dans le tableau. `series` : [{ login, color, hourlyActions: [{hour, actions}] }]
function multiLineChartSVG(series, { w = 900, h = 240 } = {}) {
  const withData = series.filter(s => s.hourlyActions && s.hourlyActions.length);
  if (!withData.length) {
    return `<div class="empty-state">Aucune donnée d'activité horaire (pings FCR Lite) sur cette période.</div>`;
  }
  const allHours = Array.from(new Set(withData.flatMap(s => s.hourlyActions.map(p => p.hour)))).sort();
  if (allHours.length < 2) {
    return `<div class="empty-state">Pas assez de créneaux pour tracer une courbe (min. 2 heures de données).</div>`;
  }
  const start = new Date(allHours[0] + ':00:00Z');
  const end = new Date(allHours[allHours.length - 1] + ':00:00Z');
  const hours = [];
  for (let t = new Date(start); t <= end; t = new Date(t.getTime() + 3600000)) {
    hours.push(t.toISOString().slice(0, 13));
  }

  const padL = 34, padB = 20, padT = 10, padR = 10;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const step = plotW / (hours.length - 1);
  const max = Math.max(...withData.flatMap(s => s.hourlyActions.map(p => p.actions)), 1);

  const gridLines = [0, 0.5, 1].map(f => {
    const y = padT + plotH * f;
    const val = Math.round(max - f * max);
    return `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#ffffff10"/>
            <text x="0" y="${y + 3}" fill="#7d90ab" font-size="9">${val}</text>`;
  }).join('');
  const labelEvery = Math.max(1, Math.ceil(hours.length / 12));
  const xLabels = hours.map((hh, i) => {
    if (i % labelEvery !== 0) return '';
    const localHour = new Date(hh + ':00:00Z').getHours();
    const x = padL + i * step;
    return `<text x="${x.toFixed(1)}" y="${h - 4}" fill="#7d90ab" font-size="8" text-anchor="middle">${String(localHour).padStart(2, '0')}h</text>`;
  }).join('');

  const lines = withData.map(s => {
    const byHour = new Map(s.hourlyActions.map(p => [p.hour, p.actions]));
    const coords = hours.map((hh, i) => {
      const v = byHour.get(hh) || 0;
      return { x: padL + i * step, y: padT + plotH - (v / max) * plotH, v, hh };
    });
    const line = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const dots = coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2.5" fill="${s.color}">
      <title>${escapeHtml(s.login)} — ${String(new Date(c.hh + ':00:00Z').getHours()).padStart(2, '0')}h : ${c.v} action(s)</title>
    </circle>`).join('');
    return `<polyline points="${line}" fill="none" stroke="${s.color}" stroke-width="2"/>${dots}`;
  }).join('');

  const legend = withData.map(s => `<span class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${escapeHtml(s.login)}</span>`).join('');

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      ${gridLines}
      ${lines}
      ${xLabels}
    </svg>
    <div class="chart-legend">${legend}</div>`;
}

/* ============================================================
 *  TABS
 * ============================================================ */
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`view-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

function tickClock() {
  const el = document.getElementById('live-clock');
  el.textContent = new Date().toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* ============================================================
 *  DASHBOARD (cartes profil)
 * ============================================================ */
let dashboardData = [];

async function loadDashboard() {
  const grid = document.getElementById('cards-grid');
  grid.innerHTML = '<div class="empty-state">Chargement…</div>';
  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const params = new URLSearchParams({ todayStart: todayStart.toISOString() });
    dashboardData = await api(`/api/sweepers?${params}`);
    renderCards(dashboardData);
  } catch (e) {
    grid.innerHTML = `<div class="empty-state">Erreur : ${escapeHtml(e.message)}</div>`;
  }
}

function renderCards(list) {
  const grid = document.getElementById('cards-grid');
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state">Aucun sweeper suivi pour l\'instant. Lance une analyse depuis un des scripts Tampermonkey pour peupler le dashboard.</div>';
    return;
  }
  grid.innerHTML = list.map(s => {
    const color = accentFor(s.login);
    const latest = s.latest;
    const prev = s.previous;
    const rate = latest ? latest.actions_per_hour : null;
    const prevRate = prev ? prev.actions_per_hour : null;
    let delta = '';
    if (rate != null && prevRate != null) {
      const diff = rate - prevRate;
      const cls = diff >= 0 ? 'up' : 'down';
      const arrow = diff >= 0 ? '▲' : '▼';
      delta = `<span class="sc-delta ${cls}">${arrow} ${Math.abs(diff).toFixed(2)}</span>`;
    }
    const spark = sparklineSVG(s.sparkline.map(p => p.actionsPerHour), { color });
    const sourceBadge = latest ? `<span class="sc-badge ${latest.source}">${latest.source}</span>` : '';

    // Bloc activité horaire (FCR Lite Ultra) — distinct des analyses trace/comparator,
    // pour ne pas mélanger deux échelles de mesure différentes.
    const act = s.latestActivity;
    let activityBlock = '';
    if (act) {
      activityBlock = `
        <div class="sc-activity">
          <div class="sc-activity-title">📡 Activité ${relTime(act.ingested_at)}</div>
          <div class="sc-activity-row">
            <span>${act.total_actions ?? '—'} action(s)</span>
            <span>${act.impressions_count ?? '—'} impression(s)</span>
            <span>arrêts : ${fmtDuration(act.gaps_total_min)}</span>
          </div>
        </div>`;
    }

    // Bloc "Aujourd'hui" : cumul de la journée (actions, étiquettes imprimées,
    // arrêts >15min, répartition horaire) — agrégé côté serveur sur tous les
    // pings d'activité depuis minuit (heure locale du navigateur).
    const t = s.today;
    let todayBlock = '';
    if (t && (t.totalActions > 0 || t.hourlyActions.length)) {
      const idleWarn = t.idleOver15.count > 0
        ? `<span class="sc-idle-warn">⏸ ${t.idleOver15.count} arrêt(s) &gt;15min — ${fmtDuration(t.idleOver15.totalMin)}</span>`
        : `<span class="sc-idle-ok">Pas d'arrêt &gt;15min</span>`;
      const bars = hourBarChartSVG(t.hourlyActions, { w: 220, h: 36, color: '#29ffb0' });
      todayBlock = `
        <div class="sc-today">
          <div class="sc-today-title">📅 Aujourd'hui</div>
          <div class="sc-today-grid">
            <div><div class="sc-stat-label">Actions cumulées</div><div class="sc-stat-value">${t.totalActions}</div></div>
            <div><div class="sc-stat-label">Rythme actuel</div><div class="sc-stat-value">${fmtNum(t.currentRatePerHour, 1)}/h</div></div>
            <div><div class="sc-stat-label">Étiquettes imprimées</div><div class="sc-stat-value">${t.totalImpressions}</div></div>
          </div>
          <div class="sc-today-bars">${bars}</div>
          <div class="sc-today-idle">${idleWarn}</div>
        </div>`;
    }

    return `
      <div class="sweeper-card" style="--accent:${color}; --accent-dim:${hexToRgba(color, 0.35)}" data-login="${escapeHtml(s.login)}">
        <div class="sc-top">
          <div class="sc-login">${escapeHtml(s.login)}</div>
          ${sourceBadge}
        </div>
        <div class="sc-lastseen">Vu ${relTime(s.lastSeen)}</div>
        <div class="sc-stats">
          <div>
            <div class="sc-stat-label">Actions / h</div>
            <div class="sc-stat-value">${fmtNum(rate, 2)}${delta}</div>
          </div>
          <div>
            <div class="sc-stat-label">Total dernière</div>
            <div class="sc-stat-value">${latest ? latest.total_actions ?? '—' : '—'}</div>
          </div>
        </div>
        <div class="sc-spark">${spark}</div>
        <div class="sc-meta">
          <span>${s.sessionsCount} session(s)</span>
          <span>arrêts : ${latest ? fmtDuration(latest.gaps_total_min) : '—'}</span>
        </div>
        ${activityBlock}
        ${todayBlock}
      </div>`;
  }).join('');

  grid.querySelectorAll('.sweeper-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.login));
  });
}

document.getElementById('search-sweeper').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  renderCards(dashboardData.filter(s => s.login.toLowerCase().includes(q)));
});
document.getElementById('refresh-dashboard').addEventListener('click', loadDashboard);

/* ============================================================
 *  DETAIL SWEEPER
 * ============================================================ */
const detailOverlay = document.getElementById('view-detail');
const detailContent = document.getElementById('detail-content');

async function openDetail(login) {
  detailOverlay.classList.add('active');
  detailContent.innerHTML = '<div class="empty-state">Chargement…</div>';
  try {
    const data = await api(`/api/sweepers/${encodeURIComponent(login)}`);
    renderDetail(data);
  } catch (e) {
    detailContent.innerHTML = `<div class="empty-state">Erreur : ${escapeHtml(e.message)}</div>`;
  }
}
document.getElementById('detail-close').addEventListener('click', () => detailOverlay.classList.remove('active'));
detailOverlay.addEventListener('click', (e) => { if (e.target === detailOverlay) detailOverlay.classList.remove('active'); });

function renderDetail(data) {
  const { sweeper, sessions } = data;
  const color = accentFor(sweeper.login);
  const ok = sessions.filter(s => !s.error);
  const chronological = ok.slice().reverse();

  const rateChart = lineChartSVG(chronological.map(s => ({ v: s.actions_per_hour, label: s.ingested_at })), { color, unit: '/h' });
  const gapsChart = lineChartSVG(chronological.map(s => ({ v: s.gaps_total_min, label: s.ingested_at })), { color: '#ff2fd1', unit: 'min' });

  const sessionsRows = sessions.map(s => `
    <tr>
      <td>${fmtDT(s.ingested_at)}</td>
      <td><span class="pill ${s.source}">${s.source}</span></td>
      <td class="num">${s.error ? '—' : (s.total_actions ?? '—')}</td>
      <td class="num">${s.error ? '—' : fmtNum(s.actions_per_hour, 2)}</td>
      <td class="num">${s.error ? '—' : fmtDuration(s.gaps_total_min)}</td>
      <td class="num">${s.error ? '—' : (s.distinct_stations ?? '—')}</td>
      <td>${s.error ? `<span style="color:var(--red)">${escapeHtml(s.error)}</span>` : ''}</td>
    </tr>`).join('');

  // ---- Bloc "Aujourd'hui" : calculé côté client à partir des pings 'activity'
  // de la journée locale en cours (pas besoin d'appel serveur supplémentaire,
  // getSweeperDetail renvoie déjà tout l'historique + les gaps par session).
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todaysActivity = sessions.filter(s => s.source === 'activity' && !s.error && new Date(s.ingested_at) >= todayStart);
  let todaySection = '';
  if (todaysActivity.length) {
    const totalActionsToday = todaysActivity.reduce((sum, s) => sum + (s.total_actions || 0), 0);
    const totalImpressionsToday = todaysActivity.reduce((sum, s) => sum + (s.impressions_count || 0), 0);
    const lastPing = todaysActivity.slice().sort((a, b) => a.ingested_at.localeCompare(b.ingested_at)).slice(-1)[0];
    let currentRate = null;
    if (lastPing && lastPing.range_start && lastPing.range_end) {
      const durH = (new Date(lastPing.range_end) - new Date(lastPing.range_start)) / 3600000;
      if (durH > 0) currentRate = (lastPing.total_actions || 0) / durH;
    }
    const idleGapsToday = todaysActivity.flatMap(s => (s.gaps || []).filter(g => (g.duration_min || 0) >= 15));
    const idleTotalMin = idleGapsToday.reduce((s, g) => s + (g.duration_min || 0), 0);

    const hourlyMap = new Map();
    todaysActivity.forEach(s => {
      const ts = s.range_end || s.ingested_at;
      if (!ts) return;
      const key = ts.slice(0, 13);
      hourlyMap.set(key, (hourlyMap.get(key) || 0) + (s.total_actions || 0));
    });
    const hourlyActions = Array.from(hourlyMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([hour, actions]) => ({ hour, actions }));
    const hourlyChart = hourLineChartSVG(hourlyActions, { w: 900, h: 180, color: '#29ffb0' });

    const idleRows = idleGapsToday.slice().sort((a, b) => (a.from_ts || '').localeCompare(b.from_ts || '')).map(g => `
      <tr>
        <td>${fmtDT(g.from_ts)}</td>
        <td>${fmtDT(g.to_ts)}</td>
        <td class="num">${fmtDuration(g.duration_min)}</td>
      </tr>`).join('');
    const idleTable = idleGapsToday.length
      ? `<table class="sessions-table"><thead><tr><th>De</th><th>À</th><th>Durée</th></tr></thead><tbody>${idleRows}</tbody></table>`
      : `<div class="empty-state">Aucun arrêt &gt;15min aujourd'hui 🎉</div>`;

    todaySection = `
      <div class="section-title">📅 Aujourd'hui</div>
      <div class="today-kpis">
        <div class="chart-box"><h3>Actions cumulées</h3><div class="kpi-value">${totalActionsToday}</div></div>
        <div class="chart-box"><h3>Rythme actuel</h3><div class="kpi-value">${fmtNum(currentRate, 1)}<span class="kpi-unit">/h</span></div></div>
        <div class="chart-box"><h3>Étiquettes imprimées</h3><div class="kpi-value">${totalImpressionsToday}</div></div>
        <div class="chart-box"><h3>Arrêts &gt;15min</h3><div class="kpi-value">${idleGapsToday.length}<span class="kpi-unit"> (${fmtDuration(idleTotalMin)})</span></div></div>
      </div>
      <div class="chart-box" style="margin-top:14px;"><h3>Actions/h — évolution dans la journée</h3>${hourlyChart}</div>
      <div class="section-title">Arrêts &gt;15min détaillés (aujourd'hui)</div>
      ${idleTable}
    `;
  } else {
    todaySection = `
      <div class="section-title">📅 Aujourd'hui</div>
      <div class="empty-state">Aucun ping d'activité reçu aujourd'hui pour l'instant.</div>
    `;
  }

  // Dernière session de type "trace" -> table des mouvements, comme le script d'origine.
  const lastTrace = sessions.find(s => s.source === 'trace' && s.traceEvents && s.traceEvents.length);
  let traceBlock = '';
  if (lastTrace) {
    const rows = lastTrace.traceEvents.map(ev => `
      <tr>
        <td>${(ev.first_date || '').slice(11)}${ev.last_date && ev.last_date !== ev.first_date ? ' → ' + ev.last_date.slice(11) : ''}</td>
        <td>${escapeHtml(ev.asin || '')}</td>
        <td>${escapeHtml(ev.tote || '')}</td>
        <td><span class="pill" style="color:${color};border-color:${hexToRgba(color, 0.4)}" title="${escapeHtml(ev.station_raw || '')}">${escapeHtml(ev.station_label || ev.station_raw || '?')}</span></td>
        <td class="num">${ev.occurrences || 1}</td>
      </tr>`).join('');
    traceBlock = `
      <div class="section-title">Dernier tracé physique (${fmtDT(lastTrace.ingested_at)})</div>
      <table class="fcr-table">
        <thead><tr><th>Heure</th><th>ASIN</th><th>Tote</th><th>Station</th><th>Occ.</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  detailContent.innerHTML = `
    <div class="detail-header">
      <div class="detail-login" style="color:${color}; text-shadow:0 0 12px ${hexToRgba(color, 0.4)}">${escapeHtml(sweeper.login)}</div>
    </div>
    <div class="detail-meta">Suivi depuis ${fmtDT(sweeper.first_seen)} · dernière activité ${relTime(sweeper.last_seen)} · ${sessions.length} session(s)</div>

    <div class="detail-charts">
      <div class="chart-box"><h3>Actions / heure (analyses)</h3>${rateChart}</div>
      <div class="chart-box"><h3>Total arrêts (min, analyses)</h3>${gapsChart}</div>
    </div>

    ${todaySection}

    ${traceBlock}

    <div class="section-title">Historique des sessions analysées</div>
    <table class="sessions-table">
      <thead>
        <tr><th>Date analyse</th><th>Source</th><th>Actions</th><th>Actions/h</th><th>Arrêts</th><th>Stations</th><th></th></tr>
      </thead>
      <tbody>${sessionsRows}</tbody>
    </table>
  `;
}

/* ============================================================
 *  EQUIPE
 * ============================================================ */
function defaultTeamRange() {
  const now = new Date();
  const start = new Date(now); start.setHours(6, 0, 0, 0);
  const toLocalInput = (d) => {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  document.getElementById('team-start').value = toLocalInput(start);
  document.getElementById('team-end').value = toLocalInput(now);
}

async function loadTeam() {
  const start = document.getElementById('team-start').value;
  const end = document.getElementById('team-end').value;
  const box = document.getElementById('team-content');
  box.innerHTML = '<div class="empty-state">Chargement…</div>';
  try {
    const params = new URLSearchParams();
    if (start) params.set('start', new Date(start).toISOString());
    if (end) params.set('end', new Date(end).toISOString());
    const data = await api(`/api/team?${params.toString()}`);
    renderTeam(data);
  } catch (e) {
    box.innerHTML = `<div class="empty-state">Erreur : ${escapeHtml(e.message)}</div>`;
  }
}

function deltaBadge(v, ref, higherIsBetter) {
  if (v == null || ref == null) return '';
  const diff = v - ref;
  if (Math.abs(diff) < 0.001) return '';
  const good = higherIsBetter ? diff > 0 : diff < 0;
  const cls = good ? 'up' : 'down';
  const arrow = diff > 0 ? '▲' : '▼';
  return `<span class="sc-delta ${cls}">${arrow}</span>`;
}

function renderTeam(data) {
  const box = document.getElementById('team-content');
  if (!data.rows.length) {
    box.innerHTML = '<div class="empty-state">Aucune session dans cette période.</div>';
    return;
  }
  const rows = data.rows.slice().sort((a, b) => a.login.localeCompare(b.login)).map(r => `
    <tr>
      <td style="color:${accentFor(r.login)}">${escapeHtml(r.login)}</td>
      <td class="num">${r.total_actions ?? '—'}${deltaBadge(r.total_actions, data.medianActions, true)}</td>
      <td class="num">${fmtNum(r.actions_per_hour, 2)}${deltaBadge(r.actions_per_hour, data.medianRate, true)}</td>
      <td class="num">${fmtNum(r.median_interval_min, 1)} min${deltaBadge(r.median_interval_min, data.medianInterval, false)}</td>
      <td class="num">${fmtDuration(r.gaps_total_min)}${deltaBadge(r.gaps_total_min, data.medianGapsTotal, false)}</td>
      <td class="num">${r.distinct_stations ?? '—'}${deltaBadge(r.distinct_stations, data.medianStations, true)}</td>
    </tr>`).join('');

  const colorSeries = (data.hourlySeries || []).map(s => ({ ...s, color: accentFor(s.login) }));
  const comparisonChart = multiLineChartSVG(colorSeries, { w: 900, h: 240 });

  box.innerHTML = `
    <div class="team-note">${data.count} sweeper(s) sur la période. Les badges ▲/▼ situent chaque AA par rapport à la médiane de l'équipe (vert = plus favorable, rouge = moins favorable).</div>
    <div class="chart-box" style="margin-bottom:14px;"><h3>Comparaison actions/h — plusieurs sweepers</h3>${comparisonChart}</div>
    <table class="team-table">
      <thead>
        <tr><th>AA</th><th>Actions</th><th>Actions/h</th><th>Intervalle médian</th><th>Total arrêts</th><th>Stations distinctes</th></tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="team-benchmark">
          <td>Médiane équipe</td>
          <td class="num">${fmtNum(data.medianActions, 1)}</td>
          <td class="num">${fmtNum(data.medianRate, 2)}</td>
          <td class="num">${fmtNum(data.medianInterval, 1)} min</td>
          <td class="num">${fmtDuration(Math.round(data.medianGapsTotal || 0))}</td>
          <td class="num">${fmtNum(data.medianStations, 1)}</td>
        </tr>
      </tbody>
    </table>`;
}

document.getElementById('team-load').addEventListener('click', loadTeam);

/* ============================================================
 *  INIT
 * ============================================================ */
function initApp() {
  initTabs();
  tickClock();
  setInterval(tickClock, 1000);
  defaultTeamRange();
  loadDashboard();
  setInterval(loadDashboard, 60000); // auto-refresh léger
}
