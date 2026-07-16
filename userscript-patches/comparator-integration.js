/* =========================================================================
 *  PATCH — FCR Sweeper Comparator
 *  3 modifications, dans l'ordre.
 * ========================================================================= */

/* -------------------------------------------------------------------------
 * 1) EN-TÊTE // ==UserScript==
 * ---------------------------------------------------------------------- */
// @connect      roboscout.amazon.com
// @connect      onrender.com                <-- AJOUTER CETTE LIGNE

/* -------------------------------------------------------------------------
 * 2) Juste après 'use strict';
 *    Coller l'intégralité du contenu de shared-push-module.js ici.
 * ---------------------------------------------------------------------- */

/* -------------------------------------------------------------------------
 * 3) Dans buildPanel(), juste après document.body.appendChild(wrap);
 * ---------------------------------------------------------------------- */
// AVANT :
//   document.body.appendChild(wrap);
//   makeDraggable(wrap, wrap.querySelector('#fcr-cmp-header'));
//
// APRÈS :
    document.body.appendChild(wrap);
    makeDraggable(wrap, wrap.querySelector('#fcr-cmp-header'));
    fcrPushBuildConfigUI(wrap.querySelector('#fcr-cmp-body')); // <-- AJOUTER

/* -------------------------------------------------------------------------
 * 4) Dans le handler goBtn, juste après renderResults(...) (dans le bloc try,
 *    après la ligne `lastRun = { entries, results, range, thresholdMin, resolveStations };`)
 * ---------------------------------------------------------------------- */
// AVANT :
//   lastRun = { entries, results, range, thresholdMin, resolveStations };
//   renderResults(resultsEl, results, thresholdMin, resolveStations, range);
//   exportBtn.style.display = results.some(r => !r.error) ? 'inline-block' : 'none';
//   statusEl.textContent = `Terminé — ...`;
//
// APRÈS :
        lastRun = { entries, results, range, thresholdMin, resolveStations };
        renderResults(resultsEl, results, thresholdMin, resolveStations, range);
        exportBtn.style.display = results.some(r => !r.error) ? 'inline-block' : 'none';
        statusEl.textContent = `Terminé — ${results.filter(r => !r.error).length}/${results.length} sweeper(s) analysé(s) avec succès (période : ${formatDatetimeLabel(range.startDate)} → ${formatDatetimeLabel(range.endDate)}).`;

        // --- AJOUT: push vers le dashboard Render (un seul appel pour tous les logins) ---
        fcrPushToBackend('comparator', {
          range: {
            startDate: range.startDate.toISOString(),
            endDate: range.endDate.toISOString(),
          },
          thresholdMin,
          results: results.map(r => r.error
            ? { login: r.login, error: r.error }
            : {
                login: r.login,
                totalActions: r.totalActions,
                actionsPerHour: r.actionsPerHour,
                avgIntervalMin: r.avgIntervalMin,
                medianIntervalMin: r.medianIntervalMin,
                gaps: r.gaps,
                gapsTotalMin: r.gapsTotalMin,
                distinctStations: r.distinctStations,
                firstAction: r.firstAction,
                lastAction: r.lastAction,
              }),
        }, statusEl);
        // --- FIN AJOUT ---
