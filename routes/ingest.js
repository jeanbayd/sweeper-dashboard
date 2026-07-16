'use strict';

const express = require('express');
const router = express.Router();
const { insertFullSession, median } = require('../db');

function intervalStatsFromDates(dates) {
  const sorted = dates.slice().sort();
  const diffsMin = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = (new Date(sorted[i]) - new Date(sorted[i - 1])) / 60000;
    if (Number.isFinite(d) && d >= 0) diffsMin.push(d);
  }
  if (!diffsMin.length) return { avg: null, med: null };
  const avg = diffsMin.reduce((s, x) => s + x, 0) / diffsMin.length;
  return { avg, med: median(diffsMin) };
}

/**
 * POST /api/ingest/trace
 * Envoyé par FCR Trace Sweeper après une analyse (un seul AA, une plage de dates).
 * Body attendu:
 * {
 *   login: "abc123",
 *   range: { startDate: "2026-07-10T06:00", endDate: "2026-07-10T14:00" },
 *   groups: [{ tote, station, firstDate, lastDate, asin, rows: [{date, asin}, ...] }],
 *   gaps: [{ from, to, durationMin, excludedMin }],
 *   thresholdMin: 15
 * }
 */
router.post('/trace', (req, res) => {
  const body = req.body || {};
  if (!body.login) return res.status(400).json({ error: 'login manquant' });
  const groups = Array.isArray(body.groups) ? body.groups : [];
  const gaps = Array.isArray(body.gaps) ? body.gaps : [];

  const allDates = [];
  const traceEvents = groups.map(g => {
    const rowCount = Array.isArray(g.rows) ? g.rows.length : 1;
    if (g.firstDate) allDates.push(g.firstDate);
    if (g.lastDate) allDates.push(g.lastDate);
    return {
      firstDate: g.firstDate,
      lastDate: g.lastDate,
      asin: g.asin,
      tote: g.tote,
      stationRaw: g.station,
      stationLabel: g.stationLabel || g.station,
      occurrences: rowCount,
      unreliable: !!g.matchUnreliable,
    };
  });

  const totalActions = groups.reduce((sum, g) => sum + (Array.isArray(g.rows) ? g.rows.length : 1), 0);
  const distinctStations = new Set(groups.map(g => g.station).filter(Boolean)).size;
  const { avg, med } = intervalStatsFromDates(allDates);
  const gapsTotalMin = gaps.reduce((s, g) => s + (g.durationMin || 0), 0);

  const rangeStart = body.range && body.range.startDate;
  const rangeEnd = body.range && body.range.endDate;
  let hoursSpan = null;
  if (rangeStart && rangeEnd) {
    hoursSpan = (new Date(rangeEnd) - new Date(rangeStart)) / 3600000;
  }

  try {
    const sessionId = insertFullSession({
      login: body.login,
      source: 'trace',
      range_start: rangeStart || null,
      range_end: rangeEnd || null,
      total_actions: totalActions,
      actions_per_hour: hoursSpan ? +(totalActions / hoursSpan).toFixed(3) : null,
      avg_interval_min: avg,
      median_interval_min: med,
      gaps_total_min: gapsTotalMin,
      distinct_stations: distinctStations || null,
      first_action: allDates.length ? allDates.sort()[0] : null,
      last_action: allDates.length ? allDates.sort().slice(-1)[0] : null,
      gaps,
      trace_events: traceEvents,
      raw: body,
    });
    res.json({ ok: true, sessionId });
  } catch (e) {
    console.error('Ingest trace error:', e);
    res.status(500).json({ error: 'Erreur serveur lors de l\'insertion.' });
  }
});

/**
 * POST /api/ingest/comparator
 * Envoyé par FCR Sweeper Comparator après une analyse multi-AA.
 * Body attendu:
 * {
 *   range: { startDate, endDate },
 *   thresholdMin: 15,
 *   results: [
 *     { login, totalActions, actionsPerHour, avgIntervalMin, medianIntervalMin,
 *       gaps: [...], gapsTotalMin, distinctStations, firstAction, lastAction, error }
 *   ]
 * }
 */
router.post('/comparator', (req, res) => {
  const body = req.body || {};
  const results = Array.isArray(body.results) ? body.results : [];
  if (!results.length) return res.status(400).json({ error: 'results vide ou manquant' });

  const rangeStart = body.range && body.range.startDate;
  const rangeEnd = body.range && body.range.endDate;

  const inserted = [];
  const errors = [];

  for (const r of results) {
    if (!r.login) continue;
    try {
      const sessionId = insertFullSession({
        login: r.login,
        source: 'comparator',
        range_start: rangeStart || null,
        range_end: rangeEnd || null,
        total_actions: r.totalActions ?? null,
        actions_per_hour: r.actionsPerHour ?? null,
        avg_interval_min: r.avgIntervalMin ?? null,
        median_interval_min: r.medianIntervalMin ?? null,
        gaps_total_min: r.gapsTotalMin ?? null,
        distinct_stations: r.distinctStations ?? null,
        first_action: r.firstAction || null,
        last_action: r.lastAction || null,
        error: r.error || null,
        gaps: Array.isArray(r.gaps) ? r.gaps : [],
        trace_events: [],
        raw: r,
      });
      inserted.push({ login: r.login, sessionId });
    } catch (e) {
      console.error('Ingest comparator error for', r.login, e);
      errors.push({ login: r.login, error: e.message });
    }
  }

  res.json({ ok: true, inserted: inserted.length, errors });
});

/**
 * POST /api/ingest/activity
 * Envoyé automatiquement toutes les heures par FCR Lite Ultra (SWEEP) pour
 * le login courant (heartbeat d'activité, indépendant d'une analyse trace/comparator).
 * Body attendu:
 * {
 *   login: "abc123",
 *   periodStart: "2026-07-13T08:00:00.000Z",
 *   periodEnd: "2026-07-13T09:00:00.000Z",
 *   actionsCount: 42,
 *   impressionsCount: 7,
 *   idleGaps: [{ from, to, durationMin }],
 *   page: "https://..."
 * }
 */
router.post('/activity', (req, res) => {
  const body = req.body || {};
  if (!body.login) return res.status(400).json({ error: 'login manquant' });

  const idleGaps = Array.isArray(body.idleGaps) ? body.idleGaps : [];
  const gaps = idleGaps.map(g => ({ from: g.from, to: g.to, durationMin: g.durationMin, excludedMin: 0 }));
  const gapsTotalMin = gaps.reduce((s, g) => s + (g.durationMin || 0), 0);

  try {
    const sessionId = insertFullSession({
      login: body.login,
      source: 'activity',
      range_start: body.periodStart || null,
      range_end: body.periodEnd || null,
      total_actions: Number.isFinite(body.actionsCount) ? body.actionsCount : null,
      impressions_count: Number.isFinite(body.impressionsCount) ? body.impressionsCount : null,
      actions_per_hour: null,
      avg_interval_min: null,
      median_interval_min: null,
      gaps_total_min: gapsTotalMin,
      distinct_stations: null,
      first_action: body.periodStart || null,
      last_action: body.periodEnd || null,
      gaps,
      trace_events: [],
      raw: body,
    });
    res.json({ ok: true, sessionId });
  } catch (e) {
    console.error('Ingest activity error:', e);
    res.status(500).json({ error: 'Erreur serveur lors de l\'insertion.' });
  }
});

module.exports = router;
