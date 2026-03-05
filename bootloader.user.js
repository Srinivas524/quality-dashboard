// ==UserScript==
// @name         Quality Dashboard — Bootloader
// @namespace    https://github.com/YOUR_USERNAME/quality-dashboard
// @version      1.0.0
// @description  Bootloader for Quality Dashboard. Loads app from SharePoint.
// @match        https://amazon.sharepoint.com/sites/SNA4IB/SitePages/CollabHome.aspx*
// @match        https://amazon.sharepoint.com/sites/SNA4IB/SitePages/Receive.aspx*
// @match        https://amazon.sharepoint.com/sites/SNA4IB/SitePages/Stow.aspx*
// @connect      amazon.sharepoint.com
// @connect      atlas.qubit.amazon.dev
// @connect      fclm-portal.amazon.com
// @connect      hooks.slack.com
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/YOUR_USERNAME/quality-dashboard/main/bootloader.user.js
// @downloadURL  https://raw.githubusercontent.com/YOUR_USERNAME/quality-dashboard/main/bootloader.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  // ██  CONFIG — Change these if your site/library differs
  // ═══════════════════════════════════════════════════════════════

  const SITE_URL = 'https://amazon.sharepoint.com/sites/SNA4IB';
  const LIBRARY  = 'DashboardApp';
  const BASE_URL = `${SITE_URL}/${LIBRARY}`;

  // Manifest location (the brain of the app)
  const MANIFEST_URL = `${BASE_URL}/manifest.json`;

  // ═══════════════════════════════════════════════════════════════
  // ██  PHASE 0 — KILL SHAREPOINT IMMEDIATELY
  // ═══════════════════════════════════════════════════════════════

  window.stop();

  // Block SharePoint fetch requests
  const _origFetch = window.fetch;
  window.fetch = function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (
      url.includes('sharepoint.com') ||
      url.includes('sharepointonline') ||
      url.includes('microsoft') ||
      url.includes('office')
    ) {
      return new Promise(() => {}); // black hole
    }
    return _origFetch.apply(this, args);
  };

  // Block SharePoint XHR requests
  const _origXHR = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (
      typeof url === 'string' &&
      (url.includes('sharepoint.com') ||
       url.includes('sharepointonline') ||
       url.includes('microsoft') ||
       url.includes('office'))
    ) {
      this.send = () => {};
      return;
    }
    return _origXHR.call(this, method, url, ...rest);
  };

  // Kill service workers
  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then(regs =>
      regs.forEach(r => r.unregister())
    );
  }

  // Kill any SP elements that sneak in
  const _spKiller = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const tag = node.tagName;
        if (tag === 'SCRIPT' || tag === 'IFRAME') { node.remove(); continue; }
        if (tag === 'LINK' && node.href && !node.href.startsWith('data:')) { node.remove(); continue; }
        if (
          node.id === 's4-workspace' ||
          node.id === 'spPageChromeAppDiv' ||
          node.id === 'sp-appBar' ||
          node.className?.includes?.('sp-')
        ) {
          node.remove();
        }
      }
    }
  });
  _spKiller.observe(document.documentElement, { childList: true, subtree: true });

  // ═══════════════════════════════════════════════════════════════
  // ██  PHASE 1 — EXPOSE GM FUNCTIONS TO LOADED SCRIPTS
  // ═══════════════════════════════════════════════════════════════
  //
  //  Scripts loaded from SharePoint run in page scope, NOT
  //  userscript scope. They can't access GM_* directly.
  //  We bridge them here.
  //

  window.__APP_BRIDGE__ = {
    GM_xmlhttpRequest: GM_xmlhttpRequest,
    GM_getValue:       GM_getValue,
    GM_setValue:        GM_setValue,
    SITE_URL:          SITE_URL,
    LIBRARY:           LIBRARY,
    BASE_URL:          BASE_URL
  };

  // ═══════════════════════════════════════════════════════════════
  // ██  PHASE 2 — LOADING SCREEN
  // ═══════════════════════════════════════════════════════════════

  const LOAD_STAGES = [
    '🔪 Killing SharePoint...',
    '🧹 Clearing the page...',
    '📡 Fetching manifest...',
    '📦 Loading core modules...',
    '🧩 Loading shared components...',
    '📄 Loading page modules...',
    '✅ Launching!'
  ];

  function injectLoadingScreen() {
    document.documentElement.innerHTML = '';

    const head = document.createElement('head');
    head.innerHTML = `
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <title>⏳ Loading Dashboard...</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
          background:#0f172a;color:white;
          display:flex;align-items:center;justify-content:center;
          min-height:100vh;overflow:hidden;
        }
        .bl-wrap{text-align:center;animation:fadeUp .6s ease}
        @keyframes fadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}

        .bl-spinner{
          width:64px;height:64px;margin:0 auto 28px;
          border:4px solid rgba(255,255,255,.1);
          border-top:4px solid #2563eb;
          border-radius:50%;animation:spin .8s linear infinite;
        }
        .bl-title{font-size:28px;font-weight:700;margin-bottom:8px;letter-spacing:-.5px}
        .bl-sub{color:#64748b;font-size:14px;margin-bottom:32px}
        .bl-stage{
          font-size:15px;color:#94a3b8;
          min-height:24px;transition:all .3s ease;
          margin-bottom:20px;
        }
        .bl-stage.active{color:#2563eb;font-weight:600}
        .bl-bar-track{
          width:320px;height:6px;
          background:rgba(255,255,255,.08);
          border-radius:99px;overflow:hidden;margin:0 auto;
        }
        .bl-bar-fill{
          height:100%;width:0%;
          background:linear-gradient(90deg,#2563eb,#7c3aed,#2563eb);
          background-size:200% 100%;border-radius:99px;
          animation:shimmer 1.5s ease infinite;
          transition:width .5s ease;
        }
        .bl-dots{display:flex;gap:8px;justify-content:center;margin-top:24px;}
        .bl-dot{
          width:8px;height:8px;border-radius:50%;
          background:rgba(255,255,255,.15);transition:all .3s ease;
        }
        .bl-dot.done{background:#2563eb}
        .bl-dot.active{background:#2563eb;animation:pulse 1s ease infinite;transform:scale(1.3)}
        .bl-fade-out{animation:blFadeOut .4s ease forwards}
        @keyframes blFadeOut{to{opacity:0;transform:scale(.97)}}

        /* Error state */
        .bl-error{
          background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.3);
          border-radius:12px;padding:24px;margin-top:24px;max-width:480px;
          text-align:left;
        }
        .bl-error h3{color:#fca5a5;margin-bottom:8px;font-size:16px;}
        .bl-error p{color:#fda4af;font-size:13px;line-height:1.6;}
        .bl-error code{
          background:rgba(0,0,0,.3);padding:2px 8px;border-radius:4px;
          font-size:12px;color:#fb7185;
        }
        .bl-retry{
          margin-top:16px;padding:10px 24px;
          background:#2563eb;color:white;border:none;
          border-radius:8px;font-weight:600;font-size:14px;
          cursor:pointer;
        }
        .bl-retry:hover{opacity:.85}
      </style>
    `;

    const body = document.createElement('body');
    body.innerHTML = `
      <div class="bl-wrap" id="bl-screen">
        <div class="bl-spinner"></div>
        <div class="bl-title">⚡ Quality Dashboard</div>
        <div class="bl-sub">Loading from SharePoint — hang tight</div>
        <div class="bl-stage" id="bl-stage">${LOAD_STAGES[0]}</div>
        <div class="bl-bar-track">
          <div class="bl-bar-fill" id="bl-bar"></div>
        </div>
        <div class="bl-dots" id="bl-dots">
          ${LOAD_STAGES.map(() => '<div class="bl-dot"></div>').join('')}
        </div>
        <div id="bl-error-container"></div>
      </div>
    `;

    document.documentElement.appendChild(head);
    document.documentElement.appendChild(body);
    updateStage(0);
  }

  function updateStage(idx) {
    const stageEl = document.getElementById('bl-stage');
    const barEl   = document.getElementById('bl-bar');
    const dotsEl  = document.getElementById('bl-dots');
    if (!stageEl || !barEl || !dotsEl) return;

    stageEl.textContent = LOAD_STAGES[idx] || '';
    stageEl.className = 'bl-stage active';

    const pct = Math.round(((idx + 1) / LOAD_STAGES.length) * 100);
    barEl.style.width = pct + '%';

    const dots = dotsEl.children;
    for (let i = 0; i < dots.length; i++) {
      dots[i].className = i < idx ? 'bl-dot done'
                        : i === idx ? 'bl-dot active'
                        : 'bl-dot';
    }
  }

  function showBootError(title, message, details) {
    const container = document.getElementById('bl-error-container');
    if (!container) return;

    // Stop the spinner
    const spinner = document.querySelector('.bl-spinner');
    if (spinner) spinner.style.display = 'none';

    container.innerHTML = `
      <div class="bl-error">
        <h3>❌ ${title}</h3>
        <p>${message}</p>
        ${details ? `<p style="margin-top:8px;"><code>${details}</code></p>` : ''}
        <button class="bl-retry" onclick="location.reload()">🔄 Retry</button>
      </div>
    `;
  }

  function dismissLoading() {
    const screen = document.getElementById('bl-screen');
    if (!screen) return Promise.resolve();
    return new Promise(resolve => {
      screen.classList.add('bl-fade-out');
      setTimeout(resolve, 400);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // ██  PHASE 3 — FILE FETCHER
  // ═══════════════════════════════════════════════════════════════

  /**
   * Fetch a file from SharePoint Document Library.
   * Uses GM_xmlhttpRequest so auth cookies are included.
   *
   * @param {string} relativePath — e.g. "core/config.js"
   * @returns {Promise<string>} file content as text
   */
  function fetchFile(relativePath) {
    const url = `${BASE_URL}/${relativePath}`;
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        anonymous: false,
        timeout: 15000,
        headers: {
          'Accept': 'text/plain,application/javascript,text/css,application/json,*/*'
        },
        onload(res) {
          // Check for auth redirect
          if (
            res.status === 401 || res.status === 403 ||
            (res.finalUrl && /midway|login|sso|signin|auth/i.test(res.finalUrl)) ||
            /<html[\s>]/i.test(res.responseText?.slice(0, 500) || '') &&
            /sign.in|login|authentication/i.test(res.responseText?.slice(0, 2000) || '')
          ) {
            reject(new Error(`AUTH_FAILED:${relativePath}`));
            return;
          }

          if (res.status >= 200 && res.status < 300) {
            resolve(res.responseText);
          } else {
            reject(new Error(`HTTP ${res.status} for ${relativePath}`));
          }
        },
        onerror() {
          reject(new Error(`NETWORK_ERROR:${relativePath}`));
        },
        ontimeout() {
          reject(new Error(`TIMEOUT:${relativePath}`));
        }
      });
    });
  }

  /**
   * Fetch multiple files in order.
   * @param {string[]} paths — array of relative paths
   * @returns {Promise<{path:string, content:string}[]>}
   */
  async function fetchFiles(paths) {
    const results = [];
    for (const path of paths) {
      const content = await fetchFile(path);
      results.push({ path, content });
    }
    return results;
  }

  // ═══════════════════════════════════════════════════════════════
  // ██  PHASE 4 — INJECTORS
  // ═══════════════════════════════════════════════════════════════

  function injectCSS(content, id) {
    const style = document.createElement('style');
    if (id) style.id = `app-css-${id}`;
    style.textContent = content;
    document.head.appendChild(style);
  }

  function injectJS(content, id) {
    const script = document.createElement('script');
    if (id) script.id = `app-js-${id}`;
    script.textContent = content;
    document.body.appendChild(script);
  }

  // ═══════════════════════════════════════════════════════════════
  // ██  PHASE 5 — PAGE DETECTION
  // ═══════════════════════════════════════════════════════════════

  function detectCurrentPage() {
    const path = window.location.pathname.toLowerCase();
    const filename = path.split('/').pop();

    // Map SharePoint page filenames → page keys
    if (filename.includes('collabhome'))  return 'home';
    if (filename.includes('receive'))     return 'receive';
    if (filename.includes('stow'))        return 'stow';

    // Default fallback
    return 'home';
  }

  // ═══════════════════════════════════════════════════════════════
  // ██  PHASE 6 — MAIN BOOT SEQUENCE
  // ═══════════════════════════════════════════════════════════════

  async function boot() {
    const currentPageKey = detectCurrentPage();

    console.log(`[Bootloader] v1.0.0 | Page: ${currentPageKey}`);
    console.log(`[Bootloader] Library: ${BASE_URL}`);

    try {
      // ── Stage 0: Kill SP (already done above) ──
      await sleep(300);

      // ── Stage 1: Clear page ──
      updateStage(1);
      await sleep(300);

      // ── Stage 2: Fetch manifest ──
      updateStage(2);

      let manifest;
      try {
        const manifestRaw = await fetchFile('manifest.json');
        manifest = JSON.parse(manifestRaw);
        console.log('[Bootloader] Manifest loaded:', manifest.version);
      } catch (e) {
        showBootError(
          'Failed to load manifest',
          'Could not fetch <strong>manifest.json</strong> from the SharePoint library. Make sure the <code>DashboardApp</code> library exists and you have access.',
          e.message
        );
        return;
      }

      // Check minimum bootloader version
      if (manifest.minBootloaderVersion) {
        const current = '1.0.0';
        if (versionCompare(current, manifest.minBootloaderVersion) < 0) {
          showBootError(
            'Bootloader update required',
            `Your bootloader is <code>v${current}</code> but the app requires <code>v${manifest.minBootloaderVersion}</code>. Tampermonkey should auto-update, or reinstall the script.`,
            null
          );
          return;
        }
      }

      // Store manifest globally
      window.__APP_BRIDGE__.manifest = manifest;
      window.__APP_BRIDGE__.currentPage = currentPageKey;

      // ── Stage 3: Load core modules ──
      updateStage(3);

      // Disconnect SP killer before we build our own page
      _spKiller.disconnect();

      // Build clean document shell
      document.documentElement.innerHTML = '';
      const head = document.createElement('head');
      head.innerHTML = `
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1.0">
        <title>${manifest.pages?.[currentPageKey]?.title || 'Dashboard'} — Quality Dashboard</title>
      `;
      const body = document.createElement('body');
      document.documentElement.appendChild(head);
      document.documentElement.appendChild(body);

      // Load core CSS
      if (manifest.core) {
        const coreCSSFiles = manifest.core.filter(f => f.endsWith('.css'));
        for (const file of coreCSSFiles) {
          try {
            const content = await fetchFile(file);
            injectCSS(content, file.replace(/[/.]/g, '-'));
            console.log(`[Bootloader] ✅ CSS: ${file}`);
          } catch (e) {
            console.warn(`[Bootloader] ⚠️ Failed to load CSS: ${file}`, e.message);
          }
        }
      }

      // Load core JS
      if (manifest.core) {
        const coreJSFiles = manifest.core.filter(f => f.endsWith('.js'));
        for (const file of coreJSFiles) {
          try {
            const content = await fetchFile(file);
            injectJS(content, file.replace(/[/.]/g, '-'));
            console.log(`[Bootloader] ✅ JS: ${file}`);
          } catch (e) {
            console.warn(`[Bootloader] ⚠️ Failed to load JS: ${file}`, e.message);
          }
        }
      }

      // ── Stage 4: Load shared components ──
      updateStage(4);

      if (manifest.shared) {
        for (const file of manifest.shared) {
          try {
            const content = await fetchFile(file);
            if (file.endsWith('.css')) {
              injectCSS(content, file.replace(/[/.]/g, '-'));
            } else {
              injectJS(content, file.replace(/[/.]/g, '-'));
            }
            console.log(`[Bootloader] ✅ Shared: ${file}`);
          } catch (e) {
            console.warn(`[Bootloader] ⚠️ Failed to load shared: ${file}`, e.message);
          }
        }
      }

      // ── Stage 5: Load page-specific modules ──
      updateStage(5);

      const pageConfig = manifest.pages?.[currentPageKey];
      if (pageConfig) {
        // Page CSS
        if (pageConfig.css) {
          for (const file of pageConfig.css) {
            try {
              const content = await fetchFile(file);
              injectCSS(content, file.replace(/[/.]/g, '-'));
              console.log(`[Bootloader] ✅ Page CSS: ${file}`);
            } catch (e) {
              console.warn(`[Bootloader] ⚠️ Failed: ${file}`, e.message);
            }
          }
        }

        // Page JS
        if (pageConfig.js) {
          for (const file of pageConfig.js) {
            try {
              const content = await fetchFile(file);
              injectJS(content, file.replace(/[/.]/g, '-'));
              console.log(`[Bootloader] ✅ Page JS: ${file}`);
            } catch (e) {
              console.warn(`[Bootloader] ⚠️ Failed: ${file}`, e.message);
            }
          }
        }
      } else {
        console.warn(`[Bootloader] No page config for: ${currentPageKey}`);
      }

      // ── Stage 6: Launch! ──
      updateStage(6);
      await sleep(300);

      // Call the app's init if it registered one
      if (typeof window.App?.init === 'function') {
        console.log('[Bootloader] Calling App.init()...');
        window.App.init(currentPageKey);
      } else {
        console.warn('[Bootloader] No App.init() found — scripts may self-initialize');
      }

      console.log('[Bootloader] ✅ Boot complete');

    } catch (err) {
      console.error('[Bootloader] Fatal error:', err);
      showBootError(
        'Boot Failed',
        'An unexpected error occurred during startup.',
        err.message
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ██  UTILITIES
  // ═══════════════════════════════════════════════════════════════

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  /**
   * Compare semver strings. Returns -1, 0, or 1.
   */
  function versionCompare(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // ██  START
  // ═══════════════════════════════════════════════════════════════

  // Inject loading screen immediately
  if (document.documentElement) {
    injectLoadingScreen();
  } else {
    document.addEventListener('DOMContentLoaded', injectLoadingScreen, { once: true });
  }

  // Start boot after DOM is minimally ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100), { once: true });
  } else {
    setTimeout(boot, 100);
  }

})();
