// ==UserScript==
// @name         SNA4 IB Quality Dashboard — Bootloader
// @namespace    https://github.com/Srinivas524/quality-dashboard
// @version      1.0.0
// @description  Dual-mode bootloader — full dashboard on SharePoint, floating widget on Atlas
// @author       Srinivas524
// @match        https://amazon.sharepoint.com/sites/SNA4IB/SitePages/Receive.aspx
// @match        https://atlas.qubit.amazon.dev/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      amazon.sharepoint.com
// @connect      atlas.qubit.amazon.dev
// @connect      raw.githubusercontent.com
// @connect      hooks.slack.com
// @updateURL    https://github.com/Srinivas524/quality-dashboard/raw/refs/heads/main/bootloader.user.js
// @downloadURL  https://github.com/Srinivas524/quality-dashboard/raw/refs/heads/main/bootloader.user.js
// ==/UserScript==

(function () {
  'use strict';

  var BOOT_VERSION = '1.0.0';
  var APP_NAME = 'SNA4 IB Quality Dashboard';

  var SP_BASE = 'https://amazon.sharepoint.com/sites/SNA4IB';
  var FILE_BASE = SP_BASE + '/DashboardApp/pages/receive';

  var FILES = {
    html: FILE_BASE + '/receive.html',
    css:  FILE_BASE + '/receive.css',
    js:   FILE_BASE + '/receive.js'
  };

  var ROOT_ID = 'receive-root';

  // ═══════════════════════════════════════════════════════
  // MODE DETECTION
  // ═══════════════════════════════════════════════════════

  var hostname = window.location.hostname.toLowerCase();
  var MODE = 'unknown';

  if (hostname.indexOf('sharepoint.com') > -1) {
    MODE = 'fullpage';
  } else if (hostname.indexOf('atlas.qubit.amazon.dev') > -1) {
    MODE = 'floating';
  }

  if (MODE === 'unknown') {
    console.warn('[RECEIVE BOOT] Unknown host — bootloader inactive');
    return;
  }

  console.log('[RECEIVE BOOT] Mode: ' + MODE + ' | v' + BOOT_VERSION);

  // ═══════════════════════════════════════════════════════
  // EXPOSE GLOBALS
  // ═══════════════════════════════════════════════════════

  window.RECEIVE_BOOT_VERSION = BOOT_VERSION;
  window.RECEIVE_MODE = MODE;
  window.GM_xmlhttpRequest_proxy = GM_xmlhttpRequest;

  // ═══════════════════════════════════════════════════════
  // FILE FETCHER
  // ═══════════════════════════════════════════════════════

  function fetchFile(url) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url + '?_nocache=' + Date.now(),
        headers: { 'Cache-Control': 'no-cache' },
        timeout: 15000,
        onload: function (res) {
          if (res.status >= 200 && res.status < 400) {
            resolve(res.responseText);
          } else {
            reject(new Error('HTTP ' + res.status + ' for ' + url));
          }
        },
        onerror: function () { reject(new Error('Network error: ' + url)); },
        ontimeout: function () { reject(new Error('Timeout: ' + url)); }
      });
    });
  }

  // ═══════════════════════════════════════════════════════
  // SHAREPOINT BLOCKER (only in fullpage mode)
  // ═══════════════════════════════════════════════════════

  var spBlocker = null;

  if (MODE === 'fullpage') {
    spBlocker = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          if (node.nodeType !== 1) continue;
          var tag = node.tagName;
          if (tag === 'LINK' || tag === 'STYLE' || tag === 'SCRIPT') {
            node.remove();
          }
        }
      }
    });

    if (document.documentElement) {
      spBlocker.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  // ═══════════════════════════════════════════════════════
  // LEAK CLEANER (fullpage mode only)
  // ═══════════════════════════════════════════════════════

  function cleanLeaks() {
    if (!document.body) return;
    var children = document.body.children;
    for (var i = children.length - 1; i >= 0; i--) {
      var child = children[i];
      if (child.id !== ROOT_ID &&
          child.tagName !== 'SCRIPT' &&
          !child.classList.contains('receive-toast')) {
        child.remove();
      }
    }
  }

  function startLeakCleaner() {
    cleanLeaks();
    setTimeout(cleanLeaks, 500);
    setTimeout(cleanLeaks, 1000);
    setTimeout(cleanLeaks, 2000);
    setTimeout(cleanLeaks, 5000);

    var bodyObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          if (node.nodeType === 1 &&
              node.id !== ROOT_ID &&
              node.tagName !== 'SCRIPT' &&
              !node.classList.contains('receive-toast')) {
            node.remove();
          }
        }
      }
    });

    if (document.body) {
      bodyObserver.observe(document.body, { childList: true });
    }
  }

  // ═══════════════════════════════════════════════════════
  // LOADING SCREEN (fullpage mode)
  // ═══════════════════════════════════════════════════════

  function showLoadingScreen() {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.background = '#0f172a';
    document.body.style.fontFamily = "'Inter', system-ui, sans-serif";

    document.body.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:20px;">' +
        '<div style="width:48px;height:48px;border:4px solid rgba(37,99,235,0.2);border-top-color:#2563eb;border-radius:50%;animation:rcv-spin 1s linear infinite;"></div>' +
        '<div style="color:#e2e8f0;font-size:18px;font-weight:700;">Receive Quality Monitor</div>' +
        '<div style="color:#64748b;font-size:13px;">Loading dashboard...</div>' +
        '<div style="display:flex;gap:6px;margin-top:8px;">' +
          '<div style="width:8px;height:8px;border-radius:50%;background:rgba(37,99,235,0.2);" id="bp-html"></div>' +
          '<div style="width:8px;height:8px;border-radius:50%;background:rgba(37,99,235,0.2);" id="bp-css"></div>' +
          '<div style="width:8px;height:8px;border-radius:50%;background:rgba(37,99,235,0.2);" id="bp-js"></div>' +
        '</div>' +
        '<div style="color:#475569;font-size:10px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-top:4px;">v' + BOOT_VERSION + '</div>' +
      '</div>' +
      '<style>@keyframes rcv-spin{to{transform:rotate(360deg)}}</style>';
  }

  function markProgress(id) {
    var dot = document.getElementById(id);
    if (dot) dot.style.background = '#2563eb';
  }

  // ═══════════════════════════════════════════════════════
  // ERROR SCREEN
  // ═══════════════════════════════════════════════════════

  function showBootError(title, message) {
    var targetEl = MODE === 'fullpage' ? document.body : null;
    if (!targetEl) {
      console.error('[RECEIVE BOOT] ' + title + ': ' + message);
      return;
    }

    targetEl.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:16px;font-family:Inter,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;">' +
        '<div style="font-size:48px;">⚠️</div>' +
        '<div style="font-size:22px;font-weight:800;">' + title + '</div>' +
        '<div style="font-size:14px;color:#f87171;max-width:600px;text-align:center;word-break:break-all;">' + message + '</div>' +
        '<div style="margin-top:16px;padding:16px;background:#1e293b;border-radius:12px;font-size:12px;color:#94a3b8;max-width:600px;width:90%;">' +
          '<div style="font-weight:700;margin-bottom:8px;color:#cbd5e1;">Files attempted:</div>' +
          '<div>HTML: ' + FILES.html + '</div>' +
          '<div>CSS: ' + FILES.css + '</div>' +
          '<div>JS: ' + FILES.js + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:10px;margin-top:16px;">' +
          '<button onclick="location.reload()" style="padding:10px 24px;border-radius:10px;border:none;background:#2563eb;color:white;font-size:14px;font-weight:700;cursor:pointer;">Reload</button>' +
        '</div>' +
      '</div>';
  }

  // ═══════════════════════════════════════════════════════
  // BOOT — FULLPAGE MODE (SharePoint)
  // ═══════════════════════════════════════════════════════

  function bootFullPage() {
    if (spBlocker) spBlocker.disconnect();

    while (document.head.firstChild) document.head.firstChild.remove();
    while (document.body && document.body.firstChild) document.body.firstChild.remove();

    document.title = 'Receive Quality Monitor — SNA4';

    var meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1.0';
    document.head.appendChild(meta);

    showLoadingScreen();

    console.log('[RECEIVE BOOT] Fetching files for fullpage mode...');

    var fetchHTML = fetchFile(FILES.html).then(function (r) { markProgress('bp-html'); return r; });
    var fetchCSS  = fetchFile(FILES.css).then(function (r) { markProgress('bp-css'); return r; });
    var fetchJS   = fetchFile(FILES.js).then(function (r) { markProgress('bp-js'); return r; });

    Promise.all([fetchHTML, fetchCSS, fetchJS]).then(function (results) {
      var htmlContent = results[0];
      var cssContent  = results[1];
      var jsContent   = results[2];

      console.log('[RECEIVE BOOT] All files loaded, injecting...');

      GM_addStyle(cssContent);
      console.log('[RECEIVE BOOT] ✅ CSS injected');

      document.body.innerHTML = htmlContent;
      console.log('[RECEIVE BOOT] ✅ HTML injected');

      try {
        eval(jsContent);
        console.log('[RECEIVE BOOT] ✅ JS executed');
      } catch (err) {
        console.error('[RECEIVE BOOT] JS error:', err);
        showBootError('JavaScript Error', err.message);
        return;
      }

      startLeakCleaner();
      console.log('[RECEIVE BOOT] ✅ Full-page boot complete');

    }).catch(function (err) {
      console.error('[RECEIVE BOOT] File fetch failed:', err);
      showBootError('File Load Failed', err.message);
    });
  }

  // ═══════════════════════════════════════════════════════
  // BOOT — FLOATING MODE (Atlas)
  // ═══════════════════════════════════════════════════════

  function bootFloating() {
    console.log('[RECEIVE BOOT] Fetching files for floating mode...');

    var fetchCSS = fetchFile(FILES.css);
    var fetchJS  = fetchFile(FILES.js);

    Promise.all([fetchCSS, fetchJS]).then(function (results) {
      var cssContent = results[0];
      var jsContent  = results[1];

      GM_addStyle(cssContent);
      console.log('[RECEIVE BOOT] ✅ CSS injected (floating)');

      try {
        eval(jsContent);
        console.log('[RECEIVE BOOT] ✅ JS executed (floating)');
      } catch (err) {
        console.error('[RECEIVE BOOT] JS error:', err);
      }

    }).catch(function (err) {
      console.error('[RECEIVE BOOT] File fetch failed:', err);
      // In floating mode, fail silently — don't break Atlas
    });
  }

  // ═══════════════════════════════════════════════════════
  // ENTRY POINT
  // ═══════════════════════════════════════════════════════

  function boot() {
    if (MODE === 'fullpage') {
      bootFullPage();
    } else if (MODE === 'floating') {
      bootFloating();
    }
  }

  if (MODE === 'fullpage') {
    // SharePoint: boot as early as possible
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  } else {
    // Atlas: wait for page to fully load
    if (document.readyState === 'complete') {
      setTimeout(boot, 500);
    } else {
      window.addEventListener('load', function () { setTimeout(boot, 500); });
    }
  }

})();
