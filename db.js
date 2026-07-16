'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// DATA_DIR pointe idéalement vers un persistent disk Render (voir README).
// En dev local / sans disque attaché, la base vit dans ./data et sera perdue
// au prochain redeploy sur Render free tier -> voir README pour le disque.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'sweepers.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS sweepers (
  login       TEXT PRIMARY KEY,
  display_name TEXT,
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  login             TEXT NOT NULL REFERENCES sweepers(login) ON DELETE CASCADE,
  source            TEXT NOT NULL CHECK (source IN ('trace', 'comparator', 'activity')),
  range_start       TEXT,
  range_end         TEXT,
  ingested_at       TEXT NOT NULL,
  total_actions     INTEGER,
  impressions_count INTEGER,
  actions_per_hour  REAL,
  avg_interval_min  REAL,
  median_interval_min REAL,
  gaps_total_min    INTEGER,
  gaps_count        INTEGER,
  distinct_stations INTEGER,
  first_action      TEXT,
  last_action       TEXT,
  error             TEXT,
  raw_json          TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_login ON sessions(login);
CREATE INDEX IF NOT EXISTS idx_sessions_ingested_at ON sessions(ingested_at);

CREATE TABLE IF NOT EXISTS gaps (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  from_ts       TEXT,
  to_ts         TEXT,
  duration_min  INTEGER,
  excluded_min  INTEGER
);

CREATE TABLE IF NOT EXISTS trace_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  first_date    TEXT,
  last_date     TEXT,
  asin          TEXT,
  tote          TEXT,
  station_raw   TEXT,
  station_label TEXT,
  occurrences   INTEGER,
  unreliable    INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_trace_events_session ON trace_events(session_id);
`);

/* ---------------------------------------------------------------------- */
/*  Migration: bases créées avant l'ajout du type 'activity' n'ont ni la  */
/*  nouvelle valeur autorisée dans le CHECK, ni la colonne                */
/*  impressions_count (CREATE TABLE IF NOT EXISTS ne modifie pas un       */
/*  schéma déjà créé). On reconstruit la table sessions si besoin.        */
/* ---------------------------------------------------------------------- */
(function migrateSessionsTable() {
  const tableInfo = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'`).get();
  const needsMigration = tableInfo && !tableInfo.sql.includes("'activity'");
  if (!needsMigration) return;

  console.log('DB migration: mise à jour du schéma sessions (ajout activity + impressions_count)...');
  db.exec('BEGIN TRANSACTION;');
  try {
    db.exec(`ALTER TABLE sessions RENAME TO sessions_old_migration;`);
    db.exec(`
      CREATE TABLE sessions (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        login             TEXT NOT NULL REFERENCES sweepers(login) ON DELETE CASCADE,
        source            TEXT NOT NULL CHECK (source IN ('trace', 'comparator', 'activity')),
        range_start       TEXT,
        range_end         TEXT,
        ingested_at       TEXT NOT NULL,
        total_actions     INTEGER,
        impressions_count INTEGER,
        actions_per_hour  REAL,
        avg_interval_min  REAL,
        median_interval_min REAL,
        gaps_total_min    INTEGER,
        gaps_count        INTEGER,
        distinct_stations INTEGER,
        first_action      TEXT,
        last_action       TEXT,
        error             TEXT,
        raw_json          TEXT
      );
    `);
    db.exec(`
      INSERT INTO sessions (
        id, login, source, range_start, range_end, ingested_at, total_actions,
        impressions_count, actions_per_hour, avg_interval_min, median_interval_min,
        gaps_total_min, gaps_count, distinct_stations, first_action, last_action, error, raw_json
      )
      SELECT id, login, source, range_start, range_end, ingested_at, total_actions,
        NULL, actions_per_hour, avg_interval_min, median_interval_min,
        gaps_total_min, gaps_count, distinct_stations, first_action, last_action, error, raw_json
      FROM sessions_old_migration;
    `);
    db.exec(`DROP TABLE sessions_old_migration;`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_login ON sessions(login);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_ingested_at ON sessions(ingested_at);`);
    db.exec('COMMIT;');
    console.log('DB migration: terminée avec succès.');
  } catch (e) {
    db.exec('ROLLBACK;');
    console.error('DB migration: échec, rollback effectué.', e);
    throw e;
  }
})();

/* ---------------------------------------------------------------------- */
/*  Helpers statistiques                                                   */
/* ---------------------------------------------------------------------- */
function median(arr) {
  const v = arr.filter(x => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
function mean(arr) {
  const v = arr.filter(x => x != null && !Number.isNaN(x));
  if (!v.length) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

/* ---------------------------------------------------------------------- */
/*  Ecriture                                                                */
/* ---------------------------------------------------------------------- */

const upsertSweeperStmt = db.prepare(`
  INSERT INTO sweepers (login, first_seen, last_seen)
  VALUES (@login, @ts, @ts)
  ON CONFLICT(login) DO UPDATE SET last_seen = @ts
`);

function upsertSweeper(login, ts) {
  upsertSweeperStmt.run({ login, ts });
}

const insertSessionStmt = db.prepare(`
  INSERT INTO sessions (
    login, source, range_start, range_end, ingested_at,
    total_actions, impressions_count, actions_per_hour, avg_interval_min, median_interval_min,
    gaps_total_min, gaps_count, distinct_stations, first_action, last_action,
    error, raw_json
  ) VALUES (
    @login, @source, @range_start, @range_end, @ingested_at,
    @total_actions, @impressions_count, @actions_per_hour, @avg_interval_min, @median_interval_min,
    @gaps_total_min, @gaps_count, @distinct_stations, @first_action, @last_action,
    @error, @raw_json
  )
`);

const insertGapStmt = db.prepare(`
  INSERT INTO gaps (session_id, from_ts, to_ts, duration_min, excluded_min)
  VALUES (@session_id, @from_ts, @to_ts, @duration_min, @excluded_min)
`);

const insertTraceEventStmt = db.prepare(`
  INSERT INTO trace_events (session_id, first_date, last_date, asin, tote, station_raw, station_label, occurrences, unreliable)
  VALUES (@session_id, @first_date, @last_date, @asin, @tote, @station_raw, @station_label, @occurrences, @unreliable)
`);

/**
 * Insère une session complète (sweeper + gaps + éventuels trace_events) de façon atomique.
 * `payload` shape: voir routes/ingest.js
 */
const insertFullSession = db.transaction((payload) => {
  const ts = payload.ingested_at || new Date().toISOString();
  upsertSweeper(payload.login, ts);

  const info = insertSessionStmt.run({
    login: payload.login,
    source: payload.source,
    range_start: payload.range_start || null,
    range_end: payload.range_end || null,
    ingested_at: ts,
    total_actions: payload.total_actions ?? null,
    impressions_count: payload.impressions_count ?? null,
    actions_per_hour: payload.actions_per_hour ?? null,
    avg_interval_min: payload.avg_interval_min ?? null,
    median_interval_min: payload.median_interval_min ?? null,
    gaps_total_min: payload.gaps_total_min ?? null,
    gaps_count: payload.gaps ? payload.gaps.length : null,
    distinct_stations: payload.distinct_stations ?? null,
    first_action: payload.first_action || null,
    last_action: payload.last_action || null,
    error: payload.error || null,
    raw_json: JSON.stringify(payload.raw || null),
  });

  const sessionId = info.lastInsertRowid;

  for (const g of payload.gaps || []) {
    insertGapStmt.run({
      session_id: sessionId,
      from_ts: g.from,
      to_ts: g.to,
      duration_min: g.durationMin,
      excluded_min: g.excludedMin || 0,
    });
  }

  for (const ev of payload.trace_events || []) {
    insertTraceEventStmt.run({
      session_id: sessionId,
      first_date: ev.firstDate,
      last_date: ev.lastDate,
      asin: ev.asin || null,
      tote: ev.tote || null,
      station_raw: ev.stationRaw || null,
      station_label: ev.stationLabel || null,
      occurrences: ev.occurrences || 1,
      unreliable: ev.unreliable ? 1 : 0,
    });
  }

  return sessionId;
});

/* ---------------------------------------------------------------------- */
/*  Lecture                                                                 */
/* ---------------------------------------------------------------------- */

/**
 * Agrège les pings 'activity' d'un login depuis `todayStartISO` :
 * - total d'actions cumulées sur la journée
 * - total d'étiquettes imprimées (impressions_count) sur la journée
 * - arrêts > 15 min (comptage + durée totale, détail des créneaux)
 * - répartition des actions par heure (clé = heure ISO tronquée, ex "2026-07-13T14")
 * - rythme actuel (actions du dernier ping / durée de sa période, en actions/h)
 */
function getTodayActivitySummary(login, todayStartISO) {
  const rows = db.prepare(`
    SELECT * FROM sessions
    WHERE login = ? AND source = 'activity' AND ingested_at >= ?
    ORDER BY ingested_at ASC
  `).all(login, todayStartISO);

  const idleGaps = db.prepare(`
    SELECT g.* FROM gaps g
    JOIN sessions s ON g.session_id = s.id
    WHERE s.login = ? AND s.source = 'activity' AND s.ingested_at >= ? AND g.duration_min >= 15
    ORDER BY g.from_ts ASC
  `).all(login, todayStartISO);

  const totalActions = rows.reduce((sum, r) => sum + (r.total_actions || 0), 0);
  const totalImpressions = rows.reduce((sum, r) => sum + (r.impressions_count || 0), 0);

  const hourlyMap = new Map();
  for (const r of rows) {
    const ts = r.range_end || r.ingested_at;
    if (!ts) continue;
    const hourKey = ts.slice(0, 13); // "YYYY-MM-DDTHH" (heure UTC — converti en local côté front)
    hourlyMap.set(hourKey, (hourlyMap.get(hourKey) || 0) + (r.total_actions || 0));
  }
  const hourlyActions = Array.from(hourlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hour, actions]) => ({ hour, actions }));

  const lastPing = rows[rows.length - 1] || null;
  let currentRatePerHour = null;
  if (lastPing && lastPing.range_start && lastPing.range_end) {
    const durH = (new Date(lastPing.range_end) - new Date(lastPing.range_start)) / 3600000;
    if (durH > 0) currentRatePerHour = +((lastPing.total_actions || 0) / durH).toFixed(2);
  }

  return {
    totalActions,
    totalImpressions,
    currentRatePerHour,
    idleOver15: {
      count: idleGaps.length,
      totalMin: idleGaps.reduce((s, g) => s + (g.duration_min || 0), 0),
      gaps: idleGaps.map(g => ({ from: g.from_ts, to: g.to_ts, durationMin: g.duration_min })),
    },
    hourlyActions,
  };
}

function listSweepersWithLatest(todayStartISO) {
  // Fallback : minuit UTC du jour courant si le front n'a pas fourni son
  // "début de journée" en heure locale (voir routes/api.js).
  const todayStart = todayStartISO || new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';

  const sweepers = db.prepare(`SELECT login, first_seen, last_seen FROM sweepers ORDER BY login ASC`).all();
  // "latest"/"previous" = uniquement les vraies analyses (trace/comparator).
  // Les pings d'activité horaire sont gérés à part (latestActivity + today) pour
  // ne pas écraser les stats d'analyse sur les cartes.
  const sessStmt = db.prepare(`
    SELECT * FROM sessions WHERE login = ? AND error IS NULL AND source IN ('trace', 'comparator')
    ORDER BY ingested_at DESC LIMIT 6
  `);
  const countStmt = db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE login = ? AND source IN ('trace', 'comparator')`);
  const latestActivityStmt = db.prepare(`
    SELECT * FROM sessions WHERE login = ? AND source = 'activity'
    ORDER BY ingested_at DESC LIMIT 1
  `);

  return sweepers.map(s => {
    const recent = sessStmt.all(s.login); // le plus récent en premier
    const latest = recent[0] || null;
    const previous = recent[1] || null;
    return {
      login: s.login,
      firstSeen: s.first_seen,
      lastSeen: s.last_seen,
      sessionsCount: countStmt.get(s.login).n,
      latest,
      previous,
      latestActivity: latestActivityStmt.get(s.login) || null,
      today: getTodayActivitySummary(s.login, todayStart),
      sparkline: recent.slice().reverse().map(r => ({
        ingestedAt: r.ingested_at,
        actionsPerHour: r.actions_per_hour,
        totalActions: r.total_actions,
      })),
    };
  });
}

function getSweeperDetail(login) {
  const sweeper = db.prepare(`SELECT * FROM sweepers WHERE login = ?`).get(login);
  if (!sweeper) return null;

  const sessions = db.prepare(`
    SELECT * FROM sessions WHERE login = ? ORDER BY ingested_at DESC
  `).all(login);

  const gapsStmt = db.prepare(`SELECT * FROM gaps WHERE session_id = ? ORDER BY from_ts ASC`);
  const traceStmt = db.prepare(`SELECT * FROM trace_events WHERE session_id = ? ORDER BY first_date ASC`);

  const sessionsFull = sessions.map(s => ({
    ...s,
    gaps: gapsStmt.all(s.id),
    traceEvents: s.source === 'trace' ? traceStmt.all(s.id) : [],
  }));

  return { sweeper, sessions: sessionsFull };
}

function getTeamStats({ start, end } = {}) {
  let query = `SELECT * FROM sessions WHERE error IS NULL AND source IN ('trace', 'comparator')`;
  const params = [];
  if (start) { query += ` AND ingested_at >= ?`; params.push(start); }
  if (end) { query += ` AND ingested_at <= ?`; params.push(end); }
  const rows = db.prepare(query).all(...params);

  // On garde uniquement la session la plus récente par login dans la fenêtre,
  // pour ne pas fausser la médiane d'équipe avec plusieurs points du même AA.
  const latestByLogin = new Map();
  for (const r of rows) {
    const cur = latestByLogin.get(r.login);
    if (!cur || r.ingested_at > cur.ingested_at) latestByLogin.set(r.login, r);
  }
  const list = Array.from(latestByLogin.values());

  return {
    count: list.length,
    medianActions: median(list.map(r => r.total_actions)),
    medianRate: median(list.map(r => r.actions_per_hour)),
    medianInterval: median(list.map(r => r.median_interval_min)),
    medianGapsTotal: median(list.map(r => r.gaps_total_min)),
    medianStations: median(list.map(r => r.distinct_stations)),
    meanActions: mean(list.map(r => r.total_actions)),
    meanRate: mean(list.map(r => r.actions_per_hour)),
    meanInterval: mean(list.map(r => r.median_interval_min)),
    meanGapsTotal: mean(list.map(r => r.gaps_total_min)),
    meanStations: mean(list.map(r => r.distinct_stations)),
    rows: list,
  };
}

function getTeamHourlySeries({ start, end } = {}) {
  let query = `SELECT login, total_actions, range_end, ingested_at FROM sessions WHERE source = 'activity' AND error IS NULL`;
  const params = [];
  if (start) { query += ` AND ingested_at >= ?`; params.push(start); }
  if (end) { query += ` AND ingested_at <= ?`; params.push(end); }
  const rows = db.prepare(query).all(...params);

  const byLogin = new Map();
  for (const r of rows) {
    const ts = r.range_end || r.ingested_at;
    if (!ts) continue;
    const hourKey = ts.slice(0, 13); // "YYYY-MM-DDTHH" (heure UTC — converti en local côté front)
    if (!byLogin.has(r.login)) byLogin.set(r.login, new Map());
    const hourly = byLogin.get(r.login);
    hourly.set(hourKey, (hourly.get(hourKey) || 0) + (r.total_actions || 0));
  }

  return Array.from(byLogin.entries()).map(([login, hourly]) => ({
    login,
    hourlyActions: Array.from(hourly.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hour, actions]) => ({ hour, actions })),
  }));
}

function deleteSession(id) {
  return db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
}

module.exports = {
  db,
  insertFullSession,
  listSweepersWithLatest,
  getTodayActivitySummary,
  getSweeperDetail,
  getTeamStats,
  getTeamHourlySeries,
  deleteSession,
  median,
  mean,
};
