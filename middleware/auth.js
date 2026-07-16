'use strict';

// Protection simple par clé partagée (usage solo).
// Le script Tampermonkey envoie la clé en header x-api-key,
// le frontend fait pareil après l'avoir demandée une fois (stockée en localStorage).
function requireApiKey(req, res, next) {
  const expected = process.env.API_KEY;
  if (!expected) {
    // Pas de clé configurée -> on bloque par sécurité (évite un dashboard ouvert à tous sur Internet).
    return res.status(500).json({ error: 'API_KEY non configurée côté serveur (variable d\'environnement manquante).' });
  }
  const provided = req.get('x-api-key');
  if (provided !== expected) {
    return res.status(401).json({ error: 'Clé API invalide ou manquante.' });
  }
  next();
}

module.exports = { requireApiKey };
