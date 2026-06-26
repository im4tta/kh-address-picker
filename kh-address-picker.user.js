// ==UserScript==
// @name         KH Address Picker — Cambodia Bilingual Address Lookup
// @namespace    https://github.com/im4tta/kh-address-picker
// @version      1.2.0
// @description  🇰🇭 Bilingual Cambodia administrative address picker (province → district → commune → village) with search. Data is fetched from GitHub and cached locally.
// @author       im4tta
// @match        *://*/*
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcng9IjE4IiBmaWxsPSIjMDMyZWE1Ii8+PHJlY3QgeT0iMzMiIHdpZHRoPSIxMDAiIGhlaWdodD0iMzQiIGZpbGw9IiNlMDAwMjUiLz48L3N2Zz4=
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// @license      MIT
// @supportURL   https://github.com/im4tta/kh-address-picker/issues
// @homepageURL  https://github.com/im4tta/kh-address-picker
// ==/UserScript==

(function () {
  'use strict';

  // ================================================================
  // CONFIG — update DATA_URL if you move the repo or the data path.
  // The file at DATA_URL must be: { "version": "...", "provinces": [...] }
  // ================================================================
  const DATA_URL = 'https://raw.githubusercontent.com/im4tta/kh-address-picker/main/data/tree-data.json';
  const CACHE_DATA_KEY = 'kh_addr_tree_data_v1';
  const CACHE_META_KEY = 'kh_addr_tree_meta_v1';
  const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // re-check for fresh data once a day
  const FETCH_TIMEOUT_MS = 15000;

  let tree = null, searchIndex = null, fabEl, panelEl, bodyEl;

  const STYLE = `
    #kh-addr-fab { position: fixed; bottom: 20px; right: 20px; width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #032ea5, #0066cc); color: white; font-size: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 999999; user-select: none; }
    #kh-addr-fab:hover { box-shadow: 0 6px 16px rgba(0,0,0,0.25); transform: scale(1.05); }
    #kh-addr-panel { position: fixed; bottom: 80px; right: 20px; width: 380px; max-height: 600px; background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.15); z-index: 999998; display: none; flex-direction: column; }
    #kh-addr-panel.open { display: flex; }
    .kh-addr-header { padding: 16px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center; }
    .kh-addr-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
    .kh-addr-close { cursor: pointer; font-size: 20px; color: #666; }
    .kh-addr-body { flex: 1; overflow-y: auto; padding: 12px; }
    .kh-addr-footer { padding: 8px 12px; border-top: 1px solid #e0e0e0; font-size: 11px; color: #999; }
    .kh-addr-search { width: 100%; padding: 8px; margin-bottom: 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
    .kh-addr-search-results { border: 1px solid #ddd; border-radius: 6px; max-height: 200px; overflow-y: auto; margin-bottom: 12px; display: none; }
    .kh-addr-search-row { padding: 8px; cursor: pointer; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
    .kh-addr-search-row:hover { background: #f5f5f5; }
    .kh-addr-search-row b { display: block; font-size: 13px; margin-bottom: 2px; }
    .kh-addr-search-row span { color: #666; }
    .kh-addr-select { width: 100%; padding: 8px; margin-bottom: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; box-sizing: border-box; }
    .kh-addr-result { display: none; background: #f9f9f9; padding: 12px; border-radius: 6px; margin-top: 12px; border: 1px solid #e0e0e0; }
    .kh-addr-result.show { display: block; }
    .kh-addr-result-line { padding: 6px 0; font-size: 12px; line-height: 1.4; }
    .kh-addr-result-line b { color: #032ea5; font-weight: 600; min-width: 60px; display: inline-block; }
    .kh-addr-copy-row { display: flex; gap: 8px; margin-top: 10px; }
    .kh-addr-btn { flex: 1; padding: 8px; background: #032ea5; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; }
    .kh-addr-btn:hover { background: #0066cc; }
    .kh-addr-btn.secondary { background: #ddd; color: #333; }
    .kh-addr-btn.secondary:hover { background: #ccc; }
    .kh-addr-status { padding: 32px 16px; text-align: center; color: #999; font-size: 13px; }
    .kh-addr-status.error { color: #c0392b; }
    .kh-addr-status small { display: block; margin-top: 6px; color: #aaa; font-size: 11px; word-break: break-word; }
  `;

  // ================================================================
  // Data loading: cache-first, with a background refresh when stale.
  // ================================================================
  function fetchRemoteData() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: DATA_URL,
        timeout: FETCH_TIMEOUT_MS,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            try {
              resolve(JSON.parse(res.responseText));
            } catch (e) {
              reject(new Error('Bad data format: ' + e.message));
            }
          } else {
            reject(new Error('HTTP ' + res.status));
          }
        },
        onerror: () => reject(new Error('Network error')),
        ontimeout: () => reject(new Error('Request timed out')),
      });
    });
  }

  function loadCachedData() {
    try {
      const raw = GM_getValue(CACHE_DATA_KEY, null);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveCache(payload) {
    try {
      GM_setValue(CACHE_DATA_KEY, JSON.stringify(payload));
      GM_setValue(CACHE_META_KEY, JSON.stringify({ fetchedAt: Date.now(), version: payload.version || null }));
    } catch (e) {
      // storage unavailable — degrade silently, refetch next time
    }
  }

  function cacheIsStale() {
    try {
      const meta = JSON.parse(GM_getValue(CACHE_META_KEY, '{}') || '{}');
      if (!meta.fetchedAt) return true;
      return (Date.now() - meta.fetchedAt) > CACHE_MAX_AGE_MS;
    } catch (e) {
      return true;
    }
  }

  function setTree(payload) {
    tree = payload.provinces || payload; // tolerate either wrapped or raw array
    searchIndex = buildSearchIndex(tree);
  }

  function refreshDataInBackground() {
    fetchRemoteData().then((payload) => {
      saveCache(payload);
      setTree(payload);
      if (panelEl && panelEl.classList.contains('open')) renderPicker();
    }).catch(() => { /* keep using whatever is already cached/rendered */ });
  }

  function loadData() {
    const cached = loadCachedData();
    if (cached) {
      setTree(cached);
      renderPicker();
      if (cacheIsStale()) refreshDataInBackground();
      return;
    }
    showStatus('Loading address data…');
    fetchRemoteData().then((payload) => {
      saveCache(payload);
      setTree(payload);
      renderPicker();
    }).catch(showError);
  }

  // ================================================================
  // Search index
  // ================================================================
  function buildSearchIndex(tree) {
    const index = [];
    for (const p of tree) {
      for (const d of p.districts) {
        for (const c of d.communes) {
          for (const v of c.villages) {
            const haystack = `${p.kh} ${p.en} ${d.kh} ${d.en} ${c.kh} ${c.en} ${v.kh} ${v.en}`.toLowerCase();
            index.push({ province: p, district: d, commune: c, village: v, haystack });
          }
        }
      }
    }
    return index;
  }

  function copyText(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      const temp = document.createElement('div');
      temp.textContent = '✓ Copied';
      temp.style.cssText = 'position:fixed;bottom:100px;right:30px;background:#032ea5;color:white;padding:8px 12px;border-radius:4px;font-size:12px;z-index:1000000;';
      document.body.appendChild(temp);
      setTimeout(() => temp.remove(), 1500);
    } catch (e) {
      alert('Copy failed: ' + e.message);
    }
    document.body.removeChild(textArea);
  }

  // ================================================================
  // Status / error states inside the panel body
  // ================================================================
  function showStatus(msg) {
    bodyEl.innerHTML = `<div class="kh-addr-status">${msg}</div>`;
  }

  function showError(err) {
    bodyEl.innerHTML = `
      <div class="kh-addr-status error">
        Could not load address data.
        <small>${(err && err.message) || err}</small>
        <div style="margin-top:12px;"><button class="kh-addr-btn" id="kh-addr-retry">Retry</button></div>
      </div>`;
    document.getElementById('kh-addr-retry').addEventListener('click', loadData);
  }

  // ================================================================
  // Picker UI
  // ================================================================
  function renderPicker() {
    const selProvince = document.createElement('select');
    selProvince.className = 'kh-addr-select';
    const selDistrict = document.createElement('select');
    selDistrict.className = 'kh-addr-select';
    const selCommune = document.createElement('select');
    selCommune.className = 'kh-addr-select';
    const selVillage = document.createElement('select');
    selVillage.className = 'kh-addr-select';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search village, commune, district…';
    searchInput.className = 'kh-addr-search';
    const searchResultsEl = document.createElement('div');
    searchResultsEl.className = 'kh-addr-search-results';
    const resultEl = document.createElement('div');
    resultEl.className = 'kh-addr-result';

    bodyEl.innerHTML = '';
    bodyEl.appendChild(searchInput);
    bodyEl.appendChild(searchResultsEl);
    bodyEl.appendChild(selProvince);
    bodyEl.appendChild(selDistrict);
    bodyEl.appendChild(selCommune);
    bodyEl.appendChild(selVillage);
    bodyEl.appendChild(resultEl);

    selProvince.innerHTML = '<option value="">Select province…</option>';
    tree.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.code;
      opt.textContent = `${p.kh} / ${p.en}`;
      selProvince.appendChild(opt);
    });

    function resetSelect(sel, placeholder) {
      sel.innerHTML = `<option value="">${placeholder}</option>`;
      sel.disabled = true;
    }

    function fillCurrentResult() {
      const p = tree.find(x => x.code === selProvince.value);
      const d = p?.districts.find(x => x.code === selDistrict.value);
      const c = d?.communes.find(x => x.code === selCommune.value);
      const v = c?.villages.find(x => x.code === selVillage.value);

      if (!p) { resultEl.classList.remove('show'); return; }

      const khParts = [v?.kh, c?.kh, d?.kh, p?.kh].filter(Boolean);
      const enParts = [v?.en, c?.en, d?.en, p?.en].filter(Boolean);
      const codes = [p.code, d?.code, c?.code, v?.code].filter(Boolean).join(' / ');

      resultEl.innerHTML = `
        <div class="kh-addr-result-line"><b>Khmer</b>${khParts.join(', ')}</div>
        <div class="kh-addr-result-line"><b>English</b>${enParts.join(', ')}</div>
        <div class="kh-addr-result-line"><b>Codes</b>${codes}</div>
        <div class="kh-addr-copy-row">
          <button class="kh-addr-btn" id="kh-copy-kh">Copy Khmer</button>
          <button class="kh-addr-btn secondary" id="kh-copy-en">Copy English</button>
          <button class="kh-addr-btn secondary" id="kh-copy-codes">Copy codes</button>
        </div>`;
      resultEl.classList.add('show');

      document.getElementById('kh-copy-kh').onclick = () => copyText(khParts.join(', '));
      document.getElementById('kh-copy-en').onclick = () => copyText(enParts.join(', '));
      document.getElementById('kh-copy-codes').onclick = () => copyText(codes);
    }

    function setProvince(code, { cascade = true } = {}) {
      selProvince.value = code;
      const p = tree.find(x => x.code === code);
      resetSelect(selDistrict, 'Select district…');
      resetSelect(selCommune, 'Select commune…');
      resetSelect(selVillage, 'Select village…');
      if (!p) { fillCurrentResult(); return; }
      selDistrict.disabled = false;
      p.districts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.code;
        opt.textContent = `${d.kh} / ${d.en}`;
        selDistrict.appendChild(opt);
      });
      if (cascade) fillCurrentResult();
    }

    function setDistrict(code, { cascade = true } = {}) {
      selDistrict.value = code;
      const p = tree.find(x => x.code === selProvince.value);
      const d = p?.districts.find(x => x.code === code);
      resetSelect(selCommune, 'Select commune…');
      resetSelect(selVillage, 'Select village…');
      if (!d) { fillCurrentResult(); return; }
      selCommune.disabled = false;
      d.communes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.code;
        opt.textContent = `${c.kh} / ${c.en}`;
        selCommune.appendChild(opt);
      });
      if (cascade) fillCurrentResult();
    }

    function setCommune(code, { cascade = true } = {}) {
      selCommune.value = code;
      const p = tree.find(x => x.code === selProvince.value);
      const d = p?.districts.find(x => x.code === selDistrict.value);
      const c = d?.communes.find(x => x.code === code);
      resetSelect(selVillage, 'Select village…');
      if (!c) { fillCurrentResult(); return; }
      selVillage.disabled = false;
      c.villages.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.code;
        opt.textContent = `${v.kh} / ${v.en}`;
        selVillage.appendChild(opt);
      });
      if (cascade) fillCurrentResult();
    }

    selProvince.addEventListener('change', e => setProvince(e.target.value));
    selDistrict.addEventListener('change', e => setDistrict(e.target.value));
    selCommune.addEventListener('change', e => setCommune(e.target.value));
    selVillage.addEventListener('change', fillCurrentResult);

    let searchDebounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        const q = searchInput.value.trim().toLowerCase();
        if (!q) { searchResultsEl.style.display = 'none'; searchResultsEl.innerHTML = ''; return; }
        const matches = searchIndex.filter(row => row.haystack.includes(q)).slice(0, 30);
        if (!matches.length) {
          searchResultsEl.style.display = 'block';
          searchResultsEl.innerHTML = '<div class="kh-addr-search-row" style="opacity:.5;">No matches</div>';
          return;
        }
        searchResultsEl.style.display = 'block';
        searchResultsEl.innerHTML = matches.map((m, i) => `
          <div class="kh-addr-search-row" data-i="${i}">
            <b>${m.village.kh} / ${m.village.en}</b>
            <span>${m.commune.kh} ${m.commune.en} · ${m.district.kh} ${m.district.en} · ${m.province.kh} ${m.province.en}</span>
          </div>`).join('');
        searchResultsEl.querySelectorAll('.kh-addr-search-row[data-i]').forEach(rowEl => {
          rowEl.addEventListener('click', () => {
            const m = matches[Number(rowEl.dataset.i)];
            setProvince(m.province.code, { cascade: false });
            setDistrict(m.district.code, { cascade: false });
            setCommune(m.commune.code, { cascade: false });
            selVillage.value = m.village.code;
            fillCurrentResult();
            searchInput.value = '';
            searchResultsEl.style.display = 'none';
          });
        });
      }, 150);
    });
  }

  // ================================================================
  // Shell (fab + panel) — built once, data is loaded lazily on first open
  // ================================================================
  function buildShell() {
    GM_addStyle(STYLE);

    fabEl = document.createElement('div');
    fabEl.id = 'kh-addr-fab';
    fabEl.title = 'Cambodia Address Picker';
    fabEl.textContent = '🇰🇭';
    document.body.appendChild(fabEl);

    panelEl = document.createElement('div');
    panelEl.id = 'kh-addr-panel';
    panelEl.innerHTML = `<div class="kh-addr-header"><h3>Cambodia Address Picker</h3><div class="kh-addr-close" id="kh-addr-close">✕</div></div><div class="kh-addr-body" id="kh-addr-body"></div><div class="kh-addr-footer">Data: Cambodia Geographical List · github.com/im4tta/kh-address-picker</div>`;
    document.body.appendChild(panelEl);
    bodyEl = document.getElementById('kh-addr-body');

    fabEl.addEventListener('click', () => {
      const willOpen = !panelEl.classList.contains('open');
      panelEl.classList.toggle('open');
      if (!willOpen) return;
      if (!tree) {
        loadData();
      } else if (cacheIsStale()) {
        refreshDataInBackground();
      }
    });
    document.getElementById('kh-addr-close').addEventListener('click', () => panelEl.classList.remove('open'));
  }

  function init() {
    buildShell(); // data is fetched lazily when the panel is first opened, not on every page load
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
