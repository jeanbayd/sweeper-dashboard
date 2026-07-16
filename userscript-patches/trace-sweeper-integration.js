/* =========================================================================
 *  PATCH — FCR Trace Sweeper
 *  3 modifications, dans l'ordre. Basé sur la structure du script tel que
 *  fourni ; si ta version en prod a déjà le multi-jour (startDate/endDate),
 *  remplace juste `dateVal` par tes variables de plage existantes — la forme
 *  du payload envoyé au backend ne change pas (range.startDate / range.endDate
 *  en ISO 8601).
 * ========================================================================= */

/* -------------------------------------------------------------------------
 * 1) EN-TÊTE // ==UserScript==
 *    Ajouter une ligne @connect pour autoriser GM_xmlhttpRequest vers Render.
 * ---------------------------------------------------------------------- */
// @connect      roboscout.amazon.com
// @connect      onrender.com                <-- AJOUTER CETTE LIGNE

/* -------------------------------------------------------------------------
 * 2) Juste après 'use strict';
 *    Coller l'intégralité du contenu de shared-push-module.js ici.
 * ---------------------------------------------------------------------- */

/* -------------------------------------------------------------------------
 * 3) Dans buildPanel(), juste après document.body.appendChild(panel);
 *    Ajoute le bloc de config (URL backend + clé API) en bas du panneau.
 * ---------------------------------------------------------------------- */
// AVANT :
//   document.body.appendChild(panel);
//
//   // date par défaut = aujourd'hui ...
//
// APRÈS :
    document.body.appendChild(panel);
    fcrPushBuildConfigUI(panel.querySelector('#fcr-trace-body')); // <-- AJOUTER

    // date par défaut = aujourd'hui (pour le traçage ET la recherche directe)
    // ... (reste inchangé)

/* -------------------------------------------------------------------------
 * 4) Dans runAnalysis(), juste après l'appel à renderResults(...) et AVANT
 *    `onDone && onDone(filtered, gaps, thresholdMin);`
 *    On pousse le résultat vers le dashboard.
 * ---------------------------------------------------------------------- */
// AVANT :
//   renderResults(resultsEl, groups, gaps, thresholdMin);
//   exportBtn.style.display = filtered.length ? 'inline-block' : 'none';
//   onDone && onDone(filtered, gaps, thresholdMin);
//
// APRÈS :
        renderResults(resultsEl, groups, gaps, thresholdMin);
        exportBtn.style.display = filtered.length ? 'inline-block' : 'none';

        // --- AJOUT: push vers le dashboard Render ---
        const loginForPush = sourceLogin || new URLSearchParams(location.search).get('s') || 'inconnu';
        fcrPushToBackend('trace', {
          login: loginForPush,
          range: {
            // Remplacer par tes bornes réelles si tu as déjà le multi-jour (startDate/endDate).
            // Ici, on reconstruit une plage sur la seule date "dateVal" du formulaire.
            startDate: new Date(`${dateVal}T00:00:00`).toISOString(),
            endDate: new Date(`${dateVal}T23:59:59`).toISOString(),
          },
          groups: groups.map(g => ({
            tote: g.tote,
            station: g.station,
            stationLabel: formatStationLabel(g.station || (g.rows[0] && g.rows[0].containerCode)),
            firstDate: g.firstDate,
            lastDate: g.lastDate,
            asin: g.rows[0] && g.rows[0].asin,
            matchUnreliable: g.rows[0] && g.rows[0].matchUnreliable,
            rows: g.rows.map(r => ({ date: r.date, asin: r.asin })),
          })),
          gaps,
        }, statusEl);
        // --- FIN AJOUT ---

        onDone && onDone(filtered, gaps, thresholdMin);

/* -------------------------------------------------------------------------
 * Note : le même bloc "AJOUT" peut être dupliqué dans le handler
 * '#fcr-direct-go' (analyse directe d'un AA distant) si tu veux aussi
 * pousser ces analyses-là vers le dashboard — il utilise le même runAnalysis()
 * donc c'est normalement déjà couvert automatiquement.
 * ---------------------------------------------------------------------- */
