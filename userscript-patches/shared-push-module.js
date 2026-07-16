/* =========================================================================
 *  MODULE PARTAGÉ — À COLLER DANS LES DEUX SCRIPTS
 *  (FCR Trace Sweeper ET FCR Sweeper Comparator)
 *
 *  Où le coller : juste après la ligne 'use strict';, avant le reste du code.
 *
 *  N'oublie pas d'ajouter dans l'en-tête // ==UserScript== de CHAQUE script :
 *    // @connect      onrender.com
 *  (ou le domaine exact si tu utilises un domaine perso sur Render)
 * ========================================================================= */

/* ---- Config backend (persistée via GM_setValue) ------------------------ */
const FCR_PUSH_KEYS = {
  url: 'fcr_push_backend_url',   // ex: https://sweeper-dashboard.onrender.com
  key: 'fcr_push_api_key',
};

function fcrPushGetConfig() {
  return {
    url: (GM_getValue(FCR_PUSH_KEYS.url, '') || '').replace(/\/+$/, ''),
    key: GM_getValue(FCR_PUSH_KEYS.key, ''),
  };
}

function fcrPushSetConfig(url, key) {
  GM_setValue(FCR_PUSH_KEYS.url, url || '');
  GM_setValue(FCR_PUSH_KEYS.key, key || '');
}

/**
 * Envoie un payload JSON vers le backend du dashboard.
 * Ne bloque jamais le script principal : les erreurs réseau sont juste loguées
 * et affichées dans le statusEl si fourni (le tracé/comparatif reste utilisable
 * même si le dashboard est injoignable).
 */
function fcrPushToBackend(endpoint, payload, statusEl) {
  const { url, key } = fcrPushGetConfig();
  if (!url || !key) {
    console.warn('FCR Push: backend non configuré (URL / clé API manquantes) — envoi ignoré.');
    return;
  }
  GM_xmlhttpRequest({
    method: 'POST',
    url: `${url}/api/ingest/${endpoint}`,
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    data: JSON.stringify(payload),
    timeout: 15000,
    onload: (res) => {
      if (res.status >= 200 && res.status < 300) {
        console.log('FCR Push: envoyé au dashboard avec succès.', endpoint);
        if (statusEl) statusEl.textContent += ' · 📡 dashboard mis à jour';
      } else {
        console.warn('FCR Push: échec envoi dashboard', res.status, res.responseText);
        if (statusEl) statusEl.textContent += ' · ⚠️ échec envoi dashboard';
      }
    },
    onerror: (e) => {
      console.warn('FCR Push: erreur réseau vers le dashboard', e);
      if (statusEl) statusEl.textContent += ' · ⚠️ dashboard injoignable';
    },
    ontimeout: () => {
      console.warn('FCR Push: timeout vers le dashboard');
      if (statusEl) statusEl.textContent += ' · ⚠️ timeout dashboard';
    },
  });
}

/**
 * Ajoute un petit bloc de config (URL backend + clé API) dans un panneau
 * existant. `containerEl` doit être un élément où insérer le bloc (ex: en bas
 * du panel, dans une section "⚙ Dashboard").
 */
function fcrPushBuildConfigUI(containerEl) {
  const { url, key } = fcrPushGetConfig();
  const wrap = document.createElement('div');
  wrap.className = 'fcr-push-config';
  wrap.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px dashed #ffffff22;font-size:11px;';
  wrap.innerHTML = `
    <div style="opacity:.7;margin-bottom:4px;">📡 Dashboard (Render)</div>
    <input type="text" class="fcr-push-url" placeholder="https://xxx.onrender.com" style="width:100%;margin-bottom:4px;" value="${url}">
    <input type="password" class="fcr-push-key" placeholder="Clé API" style="width:100%;margin-bottom:4px;" value="${key}">
    <button type="button" class="fcr-push-save" style="width:100%;">💾 Enregistrer</button>
  `;
  containerEl.appendChild(wrap);
  wrap.querySelector('.fcr-push-save').addEventListener('click', () => {
    fcrPushSetConfig(
      wrap.querySelector('.fcr-push-url').value.trim(),
      wrap.querySelector('.fcr-push-key').value.trim()
    );
    const btn = wrap.querySelector('.fcr-push-save');
    const old = btn.textContent;
    btn.textContent = '✅ Enregistré';
    setTimeout(() => (btn.textContent = old), 1500);
  });
}
