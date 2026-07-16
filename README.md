# Sweeper Dashboard — ETZ2

Dashboard web (cartes profil sweepers + vue équipe historique) alimenté automatiquement
par les scripts Tampermonkey **FCR Trace Sweeper** et **FCR Sweeper Comparator**.

## Architecture

```
FCResearch (Tampermonkey)  --push (GM_xmlhttpRequest)-->  Backend Express/Render  --sert-->  Dashboard (page statique)
                                                                    |
                                                             SQLite (persistant)
```

- **Le scraping reste dans les scripts Tampermonkey** (seule brique avec accès réseau/session Amazon).
- **Ce backend** reçoit les résultats déjà calculés (JSON), les stocke, et sert le dashboard.
- **Le dashboard** (page statique dans `public/`) affiche cartes profil + historique + vue équipe.

## 1. Déploiement sur Render

1. Pousse ce dossier sur un repo GitHub (privé de préférence, ces données sont sensibles).
2. Sur Render : **New → Web Service**, connecte le repo.
   - Build command : `npm install`
   - Start command : `npm start`
   - Plan : **Starter minimum** (voir note persistance ci-dessous — le plan Free perd les données à chaque redeploy/mise en veille).
3. Variables d'environnement à ajouter (onglet *Environment*) :
   - `API_KEY` → génère une chaîne aléatoire longue (ex: `openssl rand -hex 24`). C'est la clé partagée entre les scripts Tampermonkey et le dashboard.
   - `DATA_DIR` → `/data` (voir étape 4).
4. **Important — persistance des données** : par défaut, le système de fichiers de Render est éphémère (tout redeploy/redémarrage efface la base). Pour un vrai historique dans le temps :
   - Va dans *Disks* sur ton service → ajoute un disque, mount path `/data`, 1 Go suffit largement.
   - Ceci nécessite un plan payant (~7$/mois, le plus petit plan). Le plan Free ne supporte pas les disques persistants.
   - Alternative gratuite si tu ne veux rien payer : le dashboard fonctionnera quand même, mais l'historique sera remis à zéro à chaque redeploy (et le service s'endort après 15 min d'inactivité) — acceptable pour tester, pas pour un vrai suivi dans la durée.
5. Une fois déployé, note l'URL (`https://xxxxx.onrender.com`).

## 2. Configurer les scripts Tampermonkey

Voir le dossier `userscript-patches/` :
- `shared-push-module.js` : module à coller dans les deux scripts (config + fonction d'envoi).
- `trace-sweeper-integration.js` : points d'insertion précis pour FCR Trace Sweeper.
- `comparator-integration.js` : points d'insertion précis pour FCR Sweeper Comparator.

Une fois les scripts patchés, ouvre le panneau de chaque script sur FCResearch : un petit bloc
**📡 Dashboard (Render)** apparaît en bas. Renseigne :
- URL : `https://xxxxx.onrender.com`
- Clé API : la même valeur que `API_KEY` configurée sur Render.

Chaque analyse lancée (Tracer / Comparer) sera automatiquement poussée vers le dashboard, en plus
de continuer à fonctionner normalement dans FCResearch (export CSV toujours disponible).

## 3. Utiliser le dashboard

Ouvre `https://xxxxx.onrender.com` dans un navigateur, entre la clé API (même valeur que `API_KEY`),
puis :
- **Cartes profil** : une carte par sweeper suivi, avec actions/h, tendance (sparkline), dernier
  passage, nombre de sessions. Clique sur une carte pour le détail (graphes dans le temps + dernier
  tracé physique si disponible).
- **Équipe** : sélectionne une période, obtiens une vue façon comparateur (médiane d'équipe, badges
  ▲/▼) mais basée sur l'historique stocké plutôt qu'une analyse live.

## Développement local

```bash
npm install
API_KEY=test123 npm start
# -> http://localhost:3000
```

## Structure

```
server.js              point d'entrée Express
db.js                   couche SQLite (schéma + requêtes)
middleware/auth.js      vérification clé API
routes/ingest.js        POST /api/ingest/trace, /api/ingest/comparator
routes/api.js           GET /api/sweepers, /api/sweepers/:login, /api/team
public/                 frontend statique (HTML/CSS/JS vanilla)
userscript-patches/     patches à appliquer aux 2 scripts Tampermonkey
```

## Sécurité

- Toutes les routes `/api/*` (sauf `/api/health`) exigent le header `x-api-key`.
- La clé est un secret partagé simple (usage solo) : suffisant pour dissuader un accès random sur
  Internet, mais ce n'est pas une authentification forte. Ne partage pas l'URL + la clé publiquement.
- Les données stockées sont des métriques de performance nominatives (login AA) : garde le repo
  GitHub privé et ne log pas la clé API dans un endroit visible.
