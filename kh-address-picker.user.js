// ==UserScript==
// @name         KH Address Picker — Cambodia Bilingual Address Lookup
// @namespace    https://github.com/im4tta/kh-address-picker
// @version      1.2.0
// @description  🇰🇭 Bilingual Cambodia administrative address picker (province → district → commune → village) with search. Draggable, theme-proof UI. Data is fetched from GitHub and cached locally.
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
  const FAB_POS_KEY = 'kh_addr_fab_pos_v1';
  const PANEL_POS_KEY = 'kh_addr_panel_pos_v1';
  const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // re-check for fresh data once a day
  const FETCH_TIMEOUT_MS = 15000;

  let tree = null, searchIndex = null, fabEl, panelEl, bodyEl;

  const STYLE = `
    /* Every widget element forces its own colors so it stays readable on any
       host page, including sites in dark mode. Never inherit color/background. */
    #kh-addr-fab, #kh-addr-panel, #kh-addr-panel * {
      color-scheme: light;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    /* ---- Floating action button ---- */
    #kh-addr-fab {
      position: fixed; bottom: 24px; right: 24px; width: 54px; height: 54px;
      border-radius: 50%; background: linear-gradient(135deg, #032ea5, #0066cc);
      color: #ffffff; font-size: 26px; cursor: grab; display: flex;
      align-items: center; justify-content: center; line-height: 1;
      box-shadow: 0 6px 18px rgba(3,46,165,0.35); z-index: 2147483646;
      user-select: none; touch-action: none;
      transition: transform .15s ease, box-shadow .15s ease;
    }
    #kh-addr-fab:hover { box-shadow: 0 8px 22px rgba(3,46,165,0.45); transform: scale(1.06); }
    #kh-addr-fab:active { cursor: grabbing; transform: scale(0.98); }
    #kh-addr-fab.kh-dragging { cursor: grabbing; transition: none; box-shadow: 0 10px 28px rgba(0,0,0,0.4); }

    /* ---- Panel ---- */
    #kh-addr-panel {
      position: fixed; bottom: 90px; right: 24px; width: 380px; max-height: 76vh;
      background: #ffffff; color: #1a1a1a; border: 1px solid #e3e3e3;
      border-radius: 14px; box-shadow: 0 16px 48px rgba(0,0,0,0.28);
      z-index: 2147483647; display: none; flex-direction: column; overflow: hidden;
      opacity: 0; transform: translateY(8px) scale(.98);
      transition: opacity .16s ease, transform .16s ease;
    }
    #kh-addr-panel.open { display: flex; opacity: 1; transform: translateY(0) scale(1); }
    #kh-addr-panel.kh-dragging { transition: none; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }

    /* ---- Header (drag handle) ---- */
    .kh-addr-header {
      padding: 13px 14px; display: flex; justify-content: space-between;
      align-items: center; gap: 8px; cursor: move; touch-action: none;
      background: linear-gradient(135deg, #032ea5, #0066cc); color: #ffffff;
      user-select: none;
    }
    .kh-addr-header-left { display: flex; align-items: center; gap: 9px; min-width: 0; }
    .kh-addr-grip { display: flex; flex-direction: column; gap: 2px; opacity: .7; flex: none; }
    .kh-addr-grip span { display: block; width: 14px; height: 2px; border-radius: 2px; background: #ffffff; }
    .kh-addr-header h3 { margin: 0; font-size: 15px; font-weight: 600; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .kh-addr-close {
      cursor: pointer; font-size: 16px; color: #ffffff; flex: none;
      width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
      border-radius: 6px; transition: background .12s ease;
    }
    .kh-addr-close:hover { background: rgba(255,255,255,0.22); }

    /* ---- Body ---- */
    .kh-addr-body { flex: 1; overflow-y: auto; padding: 14px; background: #ffffff; color: #1a1a1a; }
    .kh-addr-body::-webkit-scrollbar { width: 9px; }
    .kh-addr-body::-webkit-scrollbar-thumb { background: #cfcfcf; border-radius: 6px; }
    .kh-addr-body::-webkit-scrollbar-thumb:hover { background: #b5b5b5; }

    .kh-addr-field-label { display: block; font-size: 11px; font-weight: 600; color: #555555; margin: 0 0 4px 2px; text-transform: uppercase; letter-spacing: .3px; }
    .kh-addr-divider { display: flex; align-items: center; gap: 8px; margin: 14px 0 10px; color: #999999; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; }
    .kh-addr-divider::before, .kh-addr-divider::after { content: ""; flex: 1; height: 1px; background: #ececec; }

    /* ---- Footer ---- */
    .kh-addr-footer { padding: 9px 14px; border-top: 1px solid #eee; font-size: 11px; color: #999999; background: #fafafa; text-align: center; }

    /* ---- Search ---- */
    .kh-addr-search-wrap { position: relative; }
    .kh-addr-search {
      width: 100%; padding: 10px 12px 10px 34px; border: 1px solid #d8d8d8; border-radius: 9px;
      font-size: 14px; background: #ffffff; color: #1a1a1a; transition: border-color .12s ease, box-shadow .12s ease;
    }
    .kh-addr-search:focus { outline: none; border-color: #0066cc; box-shadow: 0 0 0 3px rgba(0,102,204,0.15); }
    .kh-addr-search::placeholder { color: #9a9a9a; }
    .kh-addr-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: #9a9a9a; font-size: 14px; pointer-events: none; }
    .kh-addr-search-results { border: 1px solid #e0e0e0; border-radius: 9px; max-height: 220px; overflow-y: auto; margin-top: 8px; display: none; background: #ffffff; box-shadow: 0 4px 14px rgba(0,0,0,0.07); }
    .kh-addr-search-row { padding: 9px 11px; cursor: pointer; border-bottom: 1px solid #f2f2f2; font-size: 12px; color: #1a1a1a; }
    .kh-addr-search-row:last-child { border-bottom: none; }
    .kh-addr-search-row:hover { background: #f3f7ff; }
    .kh-addr-search-row b { display: block; font-size: 13px; margin-bottom: 2px; color: #1a1a1a; }
    .kh-addr-search-row span { color: #777777; }

    /* ---- Selects ---- */
    .kh-addr-select {
      width: 100%; padding: 9px 11px; margin-bottom: 9px; border: 1px solid #d8d8d8; border-radius: 9px;
      font-size: 13px; background: #ffffff; color: #1a1a1a; cursor: pointer; transition: border-color .12s ease, box-shadow .12s ease;
    }
    .kh-addr-select:focus { outline: none; border-color: #0066cc; box-shadow: 0 0 0 3px rgba(0,102,204,0.15); }
    .kh-addr-select:disabled { background: #f4f4f4; color: #aaaaaa; cursor: not-allowed; }
    .kh-addr-select option { background: #ffffff; color: #1a1a1a; }

    /* ---- Result card ---- */
    .kh-addr-result { display: none; background: #f7f9ff; padding: 13px; border-radius: 10px; margin-top: 6px; border: 1px solid #e2e9ff; color: #1a1a1a; }
    .kh-addr-result.show { display: block; animation: kh-fade .18s ease; }
    @keyframes kh-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .kh-addr-result-line { padding: 5px 0; font-size: 12.5px; line-height: 1.45; color: #1a1a1a; display: flex; gap: 8px; }
    .kh-addr-result-line b { color: #032ea5; font-weight: 700; min-width: 64px; flex: none; }
    .kh-addr-copy-row { display: flex; gap: 7px; margin-top: 12px; flex-wrap: wrap; }

    /* ---- Buttons ---- */
    .kh-addr-btn { flex: 1 1 auto; min-width: 92px; padding: 9px 10px; background: #032ea5; color: #ffffff; border: none; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; transition: background .12s ease, transform .05s ease; }
    .kh-addr-btn:hover { background: #0066cc; }
    .kh-addr-btn:active { transform: scale(0.97); }
    .kh-addr-btn.secondary { background: #eef0f4; color: #333333; }
    .kh-addr-btn.secondary:hover { background: #e2e5ea; }
    .kh-addr-clear { width: 100%; margin-top: 4px; padding: 8px; background: transparent; color: #c0392b; border: 1px solid #f0d4d0; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; transition: background .12s ease; }
    .kh-addr-clear:hover { background: #fdf2f1; }

    /* ---- Status / spinner ---- */
    .kh-addr-status { padding: 36px 16px; text-align: center; color: #888888; font-size: 13px; }
    .kh-addr-status.error { color: #c0392b; }
    .kh-addr-status small { display: block; margin-top: 6px; color: #aaaaaa; font-size: 11px; word-break: break-word; }
    .kh-addr-spinner { width: 26px; height: 26px; margin: 0 auto 12px; border: 3px solid #e0e0e0; border-top-color: #032ea5; border-radius: 50%; animation: kh-spin .8s linear infinite; }
    @keyframes kh-spin { to { transform: rotate(360deg); } }

    /* ---- Toast ---- */
    #kh-addr-toast {
      position: fixed; left: 50%; bottom: 36px; transform: translateX(-50%) translateY(20px);
      background: #1a1a1a; color: #ffffff; padding: 10px 18px; border-radius: 999px;
      font-size: 13px; font-weight: 500; z-index: 2147483647; opacity: 0; pointer-events: none;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3); transition: opacity .2s ease, transform .2s ease;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #kh-addr-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

    @media (max-width: 460px) {
      #kh-addr-panel { width: calc(100vw - 24px); right: 12px; left: 12px; }
    }
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

  // ================================================================
  // Toast + clipboard
  // ================================================================
  let toastTimer;
  function showToast(msg) {
    let toast = document.getElementById('kh-addr-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'kh-addr-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    requestAnimationFrame(() => toast.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
  }

  function copyText(text) {
    const done = () => showToast('✓ Copied to clipboard');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      done();
    } catch (e) {
      showToast('Copy failed');
    }
    document.body.removeChild(textArea);
  }

  // ================================================================
  // Status / error states inside the panel body
  // ================================================================
  function showStatus(msg) {
    bodyEl.innerHTML = `<div class="kh-addr-status"><div class="kh-addr-spinner"></div>${msg}</div>`;
  }

  function showError(err) {
    bodyEl.innerHTML = `
      <div class="kh-addr-status error">
        Could not load address data.
        <small>${(err && err.message) || err}</small>
        <div style="margin-top:14px;"><button class="kh-addr-btn" id="kh-addr-retry">Retry</button></div>
      </div>`;
    document.getElementById('kh-addr-retry').addEventListener('click', loadData);
  }

  // ================================================================
  // Picker UI
  // ================================================================
  function renderPicker() {
    bodyEl.innerHTML = `
      <div class="kh-addr-search-wrap">
        <span class="kh-addr-search-icon">🔍</span>
        <input type="text" class="kh-addr-search" placeholder="Search village, commune, district…" />
      </div>
      <div class="kh-addr-search-results"></div>
      <div class="kh-addr-divider">or pick step by step</div>
      <label class="kh-addr-field-label">Province / ខេត្ត</label>
      <select class="kh-addr-select" data-role="province"></select>
      <label class="kh-addr-field-label">District / ស្រុក</label>
      <select class="kh-addr-select" data-role="district"></select>
      <label class="kh-addr-field-label">Commune / ឃុំ</label>
      <select class="kh-addr-select" data-role="commune"></select>
      <label class="kh-addr-field-label">Village / ភូមិ</label>
      <select class="kh-addr-select" data-role="village"></select>
      <div class="kh-addr-result"></div>
      <button class="kh-addr-clear" style="display:none;">Clear selection</button>
    `;

    const searchInput = bodyEl.querySelector('.kh-addr-search');
    const searchResultsEl = bodyEl.querySelector('.kh-addr-search-results');
    const selProvince = bodyEl.querySelector('[data-role="province"]');
    const selDistrict = bodyEl.querySelector('[data-role="district"]');
    const selCommune = bodyEl.querySelector('[data-role="commune"]');
    const selVillage = bodyEl.querySelector('[data-role="village"]');
    const resultEl = bodyEl.querySelector('.kh-addr-result');
    const clearBtn = bodyEl.querySelector('.kh-addr-clear');

    selProvince.innerHTML = '<option value="">Select province…</option>';
    tree.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.code;
      opt.textContent = `${p.kh} / ${p.en}`;
      selProvince.appendChild(opt);
    });
    resetSelect(selDistrict, 'Select district…');
    resetSelect(selCommune, 'Select commune…');
    resetSelect(selVillage, 'Select village…');

    function resetSelect(sel, placeholder) {
      sel.innerHTML = `<option value="">${placeholder}</option>`;
      sel.disabled = true;
    }

    function fillCurrentResult() {
      const p = tree.find(x => x.code === selProvince.value);
      const d = p?.districts.find(x => x.code === selDistrict.value);
      const c = d?.communes.find(x => x.code === selCommune.value);
      const v = c?.villages.find(x => x.code === selVillage.value);

      if (!p) { resultEl.classList.remove('show'); clearBtn.style.display = 'none'; return; }
      clearBtn.style.display = 'block';

      const khParts = [v?.kh, c?.kh, d?.kh, p?.kh].filter(Boolean);
      const enParts = [v?.en, c?.en, d?.en, p?.en].filter(Boolean);
      const codes = [p.code, d?.code, c?.code, v?.code].filter(Boolean).join(' / ');

      resultEl.innerHTML = `
        <div class="kh-addr-result-line"><b>Khmer</b><span>${khParts.join(', ')}</span></div>
        <div class="kh-addr-result-line"><b>English</b><span>${enParts.join(', ')}</span></div>
        <div class="kh-addr-result-line"><b>Codes</b><span>${codes}</span></div>
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

    clearBtn.addEventListener('click', () => {
      setProvince('');
      searchInput.value = '';
      searchResultsEl.style.display = 'none';
      searchResultsEl.innerHTML = '';
      searchInput.focus();
    });

    let searchDebounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        const q = searchInput.value.trim().toLowerCase();
        if (!q) { searchResultsEl.style.display = 'none'; searchResultsEl.innerHTML = ''; return; }
        const matches = searchIndex.filter(row => row.haystack.includes(q)).slice(0, 30);
        if (!matches.length) {
          searchResultsEl.style.display = 'block';
          searchResultsEl.innerHTML = '<div class="kh-addr-search-row" style="opacity:.5;cursor:default;">No matches found</div>';
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
  // Dragging — works for both the FAB and the panel header.
  // Distinguishes a click (open/close) from a drag via a movement threshold.
  // Positions are clamped to the viewport and persisted via GM storage.
  // ================================================================
  const DRAG_THRESHOLD = 5; // px before a press counts as a drag

  function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

  function savePos(key, pos) {
    try { GM_setValue(key, JSON.stringify(pos)); } catch (e) { /* ignore */ }
  }
  function loadPos(key) {
    try { const r = GM_getValue(key, null); return r ? JSON.parse(r) : null; } catch (e) { return null; }
  }

  // Make `handle` drag `target`. onClick fires only when the press did NOT move.
  function makeDraggable(handle, target, storageKey, onClick) {
    let startX, startY, originLeft, originTop, moved, dragging;

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      // Don't start a drag when interacting with controls inside the handle.
      if (e.target.closest('.kh-addr-close')) return;

      dragging = true; moved = false;
      startX = e.clientX; startY = e.clientY;
      const rect = target.getBoundingClientRect();
      originLeft = rect.left; originTop = rect.top;
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

      if (!moved) {
        moved = true;
        target.classList.add('kh-dragging');
        // Switch from bottom/right anchoring to top/left so we can move freely.
        target.style.bottom = 'auto';
        target.style.right = 'auto';
      }
      const w = target.offsetWidth, h = target.offsetHeight;
      const left = clamp(originLeft + dx, 4, window.innerWidth - w - 4);
      const top = clamp(originTop + dy, 4, window.innerHeight - h - 4);
      target.style.left = left + 'px';
      target.style.top = top + 'px';
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      if (moved) {
        target.classList.remove('kh-dragging');
        const rect = target.getBoundingClientRect();
        savePos(storageKey, { left: rect.left, top: rect.top });
      } else if (typeof onClick === 'function') {
        onClick();
      }
    }
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
  }

  function applySavedPos(el, key) {
    const pos = loadPos(key);
    if (!pos) return false;
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.bottom = 'auto';
    el.style.right = 'auto';
    el.style.left = clamp(pos.left, 4, window.innerWidth - w - 4) + 'px';
    el.style.top = clamp(pos.top, 4, window.innerHeight - h - 4) + 'px';
    return true;
  }

  // ================================================================
  // Shell (fab + panel) — built once, data is loaded lazily on first open
  // ================================================================
  function buildShell() {
    GM_addStyle(STYLE);

    fabEl = document.createElement('div');
    fabEl.id = 'kh-addr-fab';
    fabEl.title = 'Cambodia Address Picker · drag to move, click to open';
    fabEl.textContent = '🇰🇭';
    document.body.appendChild(fabEl);

    panelEl = document.createElement('div');
    panelEl.id = 'kh-addr-panel';
    panelEl.innerHTML = `
      <div class="kh-addr-header" id="kh-addr-header">
        <div class="kh-addr-header-left">
          <span class="kh-addr-grip"><span></span><span></span><span></span></span>
          <h3>Cambodia Address Picker</h3>
        </div>
        <div class="kh-addr-close" id="kh-addr-close" title="Close">✕</div>
      </div>
      <div class="kh-addr-body" id="kh-addr-body"></div>
      <div class="kh-addr-footer">Data: Cambodia Geographical List · github.com/im4tta/kh-address-picker</div>`;
    document.body.appendChild(panelEl);
    bodyEl = document.getElementById('kh-addr-body');

    // Restore saved positions.
    applySavedPos(fabEl, FAB_POS_KEY);

    function openPanel() {
      if (panelEl.classList.contains('open')) return;
      // Position the panel near the FAB the first time, then remember its own spot.
      if (!applySavedPos(panelEl, PANEL_POS_KEY)) positionPanelNearFab();
      panelEl.classList.add('open');
      if (!tree) {
        loadData();
      } else if (cacheIsStale()) {
        refreshDataInBackground();
      }
    }
    function closePanel() { panelEl.classList.remove('open'); }
    function togglePanel() {
      panelEl.classList.contains('open') ? closePanel() : openPanel();
    }

    function positionPanelNearFab() {
      const f = fabEl.getBoundingClientRect();
      const w = 380, h = Math.min(window.innerHeight * 0.76, 520);
      let left = f.right - w;            // align panel right edge with fab
      let top = f.top - h - 12;          // place above the fab
      if (top < 8) top = f.bottom + 12;  // not enough room above → go below
      left = clamp(left, 8, window.innerWidth - w - 8);
      top = clamp(top, 8, window.innerHeight - h - 8);
      panelEl.style.bottom = 'auto';
      panelEl.style.right = 'auto';
      panelEl.style.left = left + 'px';
      panelEl.style.top = top + 'px';
    }

    // FAB: draggable, and a non-drag press opens/closes the panel.
    makeDraggable(fabEl, fabEl, FAB_POS_KEY, togglePanel);
    // Panel: draggable by its header.
    makeDraggable(document.getElementById('kh-addr-header'), panelEl, PANEL_POS_KEY, null);

    document.getElementById('kh-addr-close').addEventListener('click', closePanel);

    // Close on Escape for convenience.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panelEl.classList.contains('open')) closePanel();
    });

    // Keep everything on-screen if the window is resized.
    window.addEventListener('resize', () => {
      [[fabEl, FAB_POS_KEY], [panelEl, PANEL_POS_KEY]].forEach(([el, key]) => {
        if (el.style.left) applySavedPos(el, key);
      });
    });
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
