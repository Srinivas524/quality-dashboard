// ==UserScript==
// @name         Quality Dashboard — Bootloader
// @namespace    https://github.com/YOUR_USERNAME/quality-dashboard
// @version      1.0.0
// @description  Bootloader: kills SharePoint, loads dashboard from SiteAssets
// @match        https://amazon.sharepoint.com/sites/SNA4IB/SitePages/*
// @connect      atlas.qubit.amazon.dev
// @connect      fclm-portal.amazon.com
// @connect      hooks.slack.com
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @updateURL    https://raw.githubusercontent.com/YOUR_USERNAME/quality-dashboard/main/bootloader.user.js
// @downloadURL  https://raw.githubusercontent.com/YOUR_USERNAME/quality-dashboard/main/bootloader.user.js
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  CONFIG
  // ═══════════════════════════════════════════════════════════════

  const SITE_BASE = 'https://amazon.sharepoint.com/sites/SNA4IB';
  const ASSETS_BASE = `${SITE_BASE}/SiteAssets/QualityDashboard`;
  const MANIFEST_URL = `${ASSETS_BASE}/manifest.json`;

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 0 — KILL SHAREPOINT
  // ═══════════════════════════════════════════════════════════════

  window.stop();

  // Save originals BEFORE killing
  const _origFetch = window.fetch.bind(window);
  const _origXHROpen = XMLHttpRequest.prototype.open;

  // Kill SP fetch — but whitelist our SiteAssets path
  window.fetch = function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (url.includes('/SiteAssets/QualityDashboard/')) {
      return _origFetch(...args);
    }
    if (url.includes('sharepoint.com') || url.includes('sharepointonline') ||
        url.includes('microsoft') || url.includes('office')) {
      return new Promise(() => {});
    }
    return _origFetch(...args);
  };

  // Kill SP XHR — whitelist our assets
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (typeof url === 'string') {
      if (url.includes('/SiteAssets/QualityDashboard/')) {
        return _origXHROpen.call(this, method, url, ...rest);
      }
      if (url.includes('sharepoint.com') || url.includes('sharepointonline') ||
          url.includes('microsoft') || url.includes('office')) {
        this.send = () => {};
        return;
      }
    }
    return _origXHROpen.call(this, method, url, ...rest);
  };

  // Kill service workers
  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then(r => r.forEach(sw => sw.unregister()));
  }

  // DOM mutation killer — remove SP elements as they appear
  let _spKiller = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const tag = node.tagName;
        if (tag === 'SCRIPT' || tag === 'IFRAME') { node.remove(); continue; }
        if (tag === 'LINK' && node.href && !node.href.startsWith('data:') &&
            !node.href.includes('SiteAssets/QualityDashboard')) { node.remove(); continue; }
        if (node.id === 's4-workspace' || node.id === 'spPageChromeAppDiv' ||
            node.id === 'sp-appBar' || node.className?.includes?.('sp-')) {
          node.remove();
        }
      }
    }
  });
  _spKiller.observe(document.documentElement, { childList: true, subtree: true });

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 1 — LOADING SCREEN
  // ═══════════════════════════════════════════════════════════════

  const LOAD_STAGES = [
    '🔪 Killing SharePoint...',
    '🧹 Clearing the page...',
    '📡 Loading manifest...',
    '🎨 Loading core framework...',
    '📦 Loading page module...',
    '🔐 Checking authentication...',
    '✅ Ready!'
  ];

  let loadingStage = 0;

  function injectLoadingScreen() {
    document.documentElement.innerHTML = '';
    const head = document.createElement('head');
    head.innerHTML = `
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <title>📦 Loading Dashboard...</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
          background:#0f172a;color:white;display:flex;align-items:center;
          justify-content:center;min-height:100vh;overflow:hidden;}
        .ld-wrap{text-align:center;animation:fadeUp .6s ease}
        @keyframes fadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .ld-spinner{width:64px;height:64px;margin:0 auto 28px;
          border:4px solid rgba(255,255,255,.1);border-top:4px solid #2563eb;
          border-radius:50%;animation:spin .8s linear infinite;}
        .ld-title{font-size:28px;font-weight:700;margin-bottom:8px;letter-spacing:-.5px}
        .ld-sub{color:#64748b;font-size:14px;margin-bottom:32px}
        .ld-stage{font-size:15px;color:#94a3b8;min-height:24px;transition:all .3s;margin-bottom:20px}
        .ld-stage.active{color:#2563eb;font-weight:600}
        .ld-bar-track{width:320px;height:6px;background:rgba(255,255,255,.08);
          border-radius:99px;overflow:hidden;margin:0 auto}
        .ld-bar-fill{height:100%;width:0%;background:linear-gradient(90deg,#2563eb,#7c3aed,#2563eb);
          background-size:200% 100%;border-radius:99px;animation:shimmer 1.5s ease infinite;transition:width .5s}
        .ld-steps{display:flex;gap:8px;justify-content:center;margin-top:24px}
        .ld-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.15);transition:all .3s}
        .ld-dot.done{background:#2563eb}
        .ld-dot.active{background:#2563eb;animation:pulse 1s ease infinite;transform:scale(1.3)}
        .ld-fade-out{animation:fadeOut .4s ease forwards}
        @keyframes fadeOut{to{opacity:0;transform:scale(.97)}}
        .ld-error{color:#ef4444;margin-top:20px;font-size:14px}
      </style>`;

    const body = document.createElement('body');
    body.innerHTML = `
      <div class="ld-wrap" id="loading-screen">
        <div class="ld-spinner"></div>
        <div class="ld-title">📦 Quality Dashboard</div>
        <div class="ld-sub">Replacing SharePoint — hang tight</div>
        <div class="ld-stage" id="ld-stage">${LOAD_STAGES[0]}</div>
        <div class="ld-bar-track"><div class="ld-bar-fill" id="ld-bar"></div></div>
        <div class="ld-steps" id="ld-dots">${LOAD_STAGES.map(() => '<div class="ld-dot"></div>').join('')}</div>
        <div class="ld-error" id="ld-error" style="display:none;"></div>
      </div>`;

    document.documentElement.appendChild(head);
    document.documentElement.appendChild(body);
    updateLoadingStage(0);
  }

  function updateLoadingStage(idx) {
    loadingStage = idx;
    const stageEl = document.getElementById('ld-stage');
    const barEl = document.getElementById('ld-bar');
    const dotsEl = document.getElementById('ld-dots');
    if (!stageEl) return;
    stageEl.textContent = LOAD_STAGES[idx] || '';
    stageEl.className = 'ld-stage active';
    if (barEl) barEl.style.width = Math.round(((idx + 1) / LOAD_STAGES.length) * 100) + '%';
    if (dotsEl) {
      [...dotsEl.children].forEach((d, i) => {
        d.className = i < idx ? 'ld-dot done' : i === idx ? 'ld-dot active' : 'ld-dot';
      });
    }
  }

  function showLoadingError(msg) {
    const el = document.getElementById('ld-error');
    if (el) { el.style.display = 'block'; el.textContent = msg; }
  }

  function dismissLoading() {
    const screen = document.getElementById('loading-screen');
    if (!screen) return Promise.resolve();
    return new Promise(r => { screen.classList.add('ld-fade-out'); setTimeout(r, 400); });
  }

  if (document.documentElement) injectLoadingScreen();
  else document.addEventListener('DOMContentLoaded', injectLoadingScreen, { once: true });

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 2 — GLOBAL BRIDGE (window.Dashboard)
  // ═══════════════════════════════════════════════════════════════

  function getWarehouseId() {
    const urlParams = new URLSearchParams(window.location.search);
    let id = urlParams.get('warehouseId');
    if (id) return id;
    const m = window.location.pathname.match(/sites\/(\w+)/);
    if (m) { const s = m[1].replace(/IB$/, ''); if (s) return s; }
    return 'SNA4';
  }

  // Detect page from URL path
  function detectPage() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('receive'))    return 'receive';
    if (path.includes('stow'))       return 'stow';
    if (path.includes('collabhome') || path.endsWith('/sitepages/') || path.endsWith('/sitepages'))
      return 'home';
    return 'home'; // default
  }

  // Create the global bridge
  window.Dashboard = {
    version: '1.0.0',
    warehouseId: getWarehouseId(),
    currentPage: detectPage(),
    siteBase: SITE_BASE,
    assetsBase: ASSETS_BASE,

    // GM bridge — page scripts use this for cross-origin requests
    request(opts) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          anonymous: false,
          timeout: 15000,
          ...opts,
          onload: resolve,
          onerror: reject,
          ontimeout: reject
        });
      });
    },

    // Storage helpers
    storage: {
      get: (k) => localStorage.getItem(k),
      set: (k, v) => localStorage.setItem(k, v),
      remove: (k) => localStorage.removeItem(k)
    },

    // Page registry — page scripts register here
    pages: {},

    // Shared state — modules can read/write
    state: {},

    // UI namespace — components.js populates this
    ui: {},

    // Auth namespace — auth.js populates this
    auth: {},

    // API namespace — api.js populates this
    api: {}
  };

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 3 — FILE LOADER
  // ═══════════════════════════════════════════════════════════════

  async function fetchAsset(relativePath) {
    const url = `${ASSETS_BASE}/${relativePath}`;
    const cacheBust = `?v=${Date.now()}`;
    const resp = await _origFetch(url + cacheBust, { credentials: 'include' });
    if (!resp.ok) throw new Error(`Failed to load ${relativePath}: HTTP ${resp.status}`);
    return resp.text();
  }

  function injectCSS(cssText, id) {
    const style = document.createElement('style');
    if (id) style.id = id;
    style.textContent = cssText;
    document.head.appendChild(style);
  }

  function execJS(jsText, filename) {
    try {
      const fn = new Function(jsText);
      fn();
    } catch (e) {
      console.error(`Error executing ${filename}:`, e);
      throw e;
    }
  }

  async function loadCSS(relativePath) {
    const css = await fetchAsset(relativePath);
    injectCSS(css, relativePath.replace(/[\/\.]/g, '-'));
  }

  async function loadJS(relativePath) {
    const js = await fetchAsset(relativePath);
    execJS(js, relativePath);
  }

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 4 — ORCHESTRATE BOOT SEQUENCE
  // ═══════════════════════════════════════════════════════════════

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function boot() {
    const page = window.Dashboard.currentPage;
    console.log(`📦 Dashboard Bootloader | Page: ${page} | WH: ${window.Dashboard.warehouseId}`);

    try {
      // Stage 0 — already showing "Killing SharePoint"
      await sleep(300);

      // Stage 1 — Clearing
      updateLoadingStage(1);
      await sleep(300);

      // Stage 2 — Load manifest
      updateLoadingStage(2);
      const manifestText = await fetchAsset('manifest.json');
      const manifest = JSON.parse(manifestText);
      window.Dashboard.version = manifest.version;
      console.log('📋 Manifest loaded:', manifest.version);

      // Stage 3 — Load core framework
      updateLoadingStage(3);

      // Load core CSS
      for (const cssFile of manifest.core.css) {
        await loadCSS(cssFile);
      }

      // Load core JS (order matters)
      for (const jsFile of manifest.core.js) {
        await loadJS(jsFile);
      }

      console.log('⚙️ Core framework loaded');

      // Stage 4 — Load page module
      updateLoadingStage(4);

      const pageConfig = manifest.pages[page];
      if (!pageConfig) throw new Error(`No page config for "${page}" in manifest`);

      for (const cssFile of (pageConfig.css || [])) {
        await loadCSS(cssFile);
      }
      for (const jsFile of (pageConfig.js || [])) {
        await loadJS(jsFile);
      }

      console.log(`📄 Page module "${page}" loaded`);

      // Stage 5 — Kill SP observer, dismiss loading, build page
      updateLoadingStage(5);
      if (_spKiller) { _spKiller.disconnect(); _spKiller = null; }

      await dismissLoading();

      // Build the page shell (header + nav + content area + footer)
      Dashboard.ui.buildShell(page);

      // Stage 6 — Init the page
      updateLoadingStage(6);

      if (Dashboard.pages[page] && Dashboard.pages[page].init) {
        await Dashboard.pages[page].init();
      }

      console.log('✅ Dashboard ready');

    } catch (err) {
      console.error('💥 Boot failed:', err);
      showLoadingError(`Boot failed: ${err.message}. Check console.`);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100), { once: true });
  } else {
    setTimeout(boot, 100);
  }

})();
