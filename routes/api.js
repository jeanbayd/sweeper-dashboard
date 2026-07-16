'use strict';

const express = require('express');
const router = express.Router();
const { listSweepersWithLatest, getSweeperDetail, getTeamStats, getTeamHourlySeries, deleteSession } = require('../db');

// GET /api/sweepers?todayStart=... -> cartes profil (liste + dernière session + tendance + stats du jour)
// todayStart : ISO du début de journée en heure locale du navigateur (le front l'envoie).
router.get('/sweepers', (req, res) => {
  res.json(listSweepersWithLatest(req.query.todayStart));
});

// GET /api/sweepers/:login -> détail complet (historique, gaps, trace)
router.get('/sweepers/:login', (req, res) => {
  const detail = getSweeperDetail(req.params.login);
  if (!detail) return res.status(404).json({ error: 'Sweeper inconnu.' });
  res.json(detail);
});

// GET /api/team?start=...&end=... -> stats d'équipe façon comparator, sur une fenêtre
// + hourlySeries : activité horaire (pings FCR Lite) par login sur la même fenêtre,
//   pour la courbe de comparaison actions/h multi-sweepers.
router.get('/team', (req, res) => {
  const range = { start: req.query.start, end: req.query.end };
  const stats = getTeamStats(range);
  const hourlySeries = getTeamHourlySeries(range);
  res.json({ ...stats, hourlySeries });
});

// DELETE /api/sessions/:id -> nettoyage manuel (erreur de saisie, test, etc.)
router.delete('/sessions/:id', (req, res) => {
  const info = deleteSession(req.params.id);
  res.json({ ok: true, deleted: info.changes });
});

module.exports = router;
