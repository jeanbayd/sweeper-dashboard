'use strict';

const express = require('express');
const path = require('path');
const { requireApiKey } = require('./middleware/auth');
const ingestRoutes = require('./routes/ingest');
const apiRoutes = require('./routes/api');

const app = express();
app.use(express.json({ limit: '5mb' }));

// Petit endpoint public pour vérifier que le service est en vie (ne fuite aucune donnée).
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Tout le reste de l'API nécessite la clé (ingestion depuis les scripts + lecture dashboard).
app.use('/api/ingest', requireApiKey, ingestRoutes);
app.use('/api', requireApiKey, apiRoutes);

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sweeper dashboard en écoute sur le port ${PORT}`);
  if (!process.env.API_KEY) {
    console.warn('⚠️  API_KEY non définie — toutes les routes /api/* renverront 500 tant qu\'elle n\'est pas configurée.');
  }
});
