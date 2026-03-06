// ==UserScript==
// @name         SNA4 IB Quality Dashboard -- Bootloader
// @namespace    https://github.com/Srinivas524/quality-dashboard
// @version      2.0.0
// @description  Minimal loader -- all logic lives on SharePoint
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
// @connect      fclm-portal.amazon.com
// @updateURL    https://github.com/Srinivas524/quality-dashboard/raw/refs/heads/main/bootloader.user.js
// @downloadURL  https://github.com/Srinivas524/quality-dashboard/raw/refs/heads/main/bootloader.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────
  var V    = '2.0.0';
  var BASE = 'https://amazon.sharepoint.com/sites/SNA4IB/DashboardApp/pages/receive';
  var ROOT = 'receive-root';

  // ── Mode detect ────────────────────────────────────────
  var host = location.hostname.toLowerCase();
  var MODE = host.indexOf('sharepoint.com')       > -1 ? 'fullpage'
           : host.indexOf('atlas.qubit.amazon.dev') > -1 ? 'floating'
           : null;
  if (!MODE) return;

  console.log('[BOOT] v' + V + ' | ' + MODE);

  // ── Secure proxy (only thing loaded code receives) ─────
  var ALLOWED = [
    'https://atlas.qubit.amazon.dev/',
    'https://fclm-portal.amazon.com/',
    'https://hooks.slack.com/'
  ];

  var gmProxy = function (opts) {
    if (!opts || !opts.url) return;
    for (var i = 0; i < ALLOWED.length; i++) {
      if (opts.url.indexOf(ALLOWED[i]) === 0) {
        opts.anonymous = false;
        opts.timeout = Math.min(opts.timeout || 20000, 30000);
        return GM_xmlhttpRequest(opts);
      }
    }
    console.warn('[BOOT] Blocked:', opts.url);
    if (opts.onerror) opts.onerror({ error: 'Blocked by bootloader' });
  };

  // ── Internal file loader (unrestricted, bootloader only) ─
  function load(url) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url + '?_=' + Date.now(),
        headers: { 'Cache-Control': 'no-cache' },
        timeout: 15000,
        onload: function (r) {
          r.status < 400 ? resolve(r.responseText) : reject(new Error('HTTP ' + r.status + ' → ' + url));
        },
        onerror: function () { reject(new Error('Network error → ' + url)); },
        ontimeout: function () { reject(new Error('Timeout → ' + url)); }
      });
    });
  }

  // ── Safe executor (no access to bootloader locals) ─────
  function exec(code) {
    try {
      (new Function('GM_fetch', 'BOOT_VERSION', 'BOOT_MODE', code))(gmProxy, V, MODE);
    } catch (e) {
      console.error('[BOOT] Exec error:', e);
      throw e;
    }
  }

  // ── Error screen ───────────────────────────────────────
  function showError(title, msg) {
    var s = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:16px;font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;';
    document.body.innerHTML =
      '<div style="' + s + '">' +
        '<div style="font-size:48px;">\u26A0\uFE0F</div>' +
        '<div style="font-size:22px;font-weight:800;">' + title + '</div>' +
        '<div style="font-size:14px;color:#f87171;max-width:600px;text-align:center;word-break:break-all;">' + msg + '</div>' +
        '<div style="color:#475569;font-size:11px;margin-top:8px;">Bootloader v' + V + '</div>' +
        '<button onclick="location.reload()" style="margin-top:12px;padding:10px 24px;border-radius:10px;border:none;background:#2563eb;color:white;font-size:14px;font-weight:700;cursor:pointer;">Reload</button>' +
      '</div>';
  }

  // ════════════════════════════════════════════════════════
  // FULLPAGE MODE (SharePoint)
  // ════════════════════════════════════════════════════════

  var spBlocker;

  if (MODE === 'fullpage') {
    spBlocker = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var nodes = muts[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (n.nodeType === 1) {
            var tag = n.tagName;
            if (tag === 'LINK' || tag === 'STYLE' || tag === 'SCRIPT') n.remove();
          }
        }
      }
    });
    if (document.documentElement) {
      spBlocker.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function showLoading() {
    document.body.style.cssText = 'margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif;';
    document.body.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:20px;">' +
        '<div style="width:48px;height:48px;border:4px solid rgba(37,99,235,0.2);border-top-color:#2563eb;border-radius:50%;animation:bspin 1s linear infinite;"></div>' +
        '<div style="color:#e2e8f0;font-size:18px;font-weight:700;">Receive Quality Monitor</div>' +
        '<div style="color:#64748b;font-size:13px;" id="boot-msg">Loading...</div>' +
        '<div style="display:flex;gap:6px;margin-top:8px;">' +
          '<div style="width:8px;height:8px;border-radius:50%;background:rgba(37,99,235,0.2);" id="bp0"></div>' +
          '<div style="width:8px;height:8px;border-radius:50%;background:rgba(37,99,235,0.2);" id="bp1"></div>' +
          '<div style="width:8px;height:8px;border-radius:50%;background:rgba(37,99,235,0.2);" id="bp2"></div>' +
        '</div>' +
        '<div style="color:#475569;font-size:10px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-top:4px;">v' + V + '</div>' +
      '</div><style>@keyframes bspin{to{transform:rotate(360deg)}}</style>';
  }

  function markDot(i) {
    var d = document.getElementById('bp' + i);
    if (d) d.style.background = '#2563eb';
  }

  function startLeakCleaner() {
    function clean() {
      if (!document.body) return;
      var kids = document.body.children;
      for (var i = kids.length - 1; i >= 0; i--) {
        var c = kids[i];
        if (c.id !== ROOT && c.tagName !== 'SCRIPT' && !c.classList.contains('receive-toast')) c.remove();
      }
    }
    clean();
    setTimeout(clean, 500);
    setTimeout(clean, 2000);
    setTimeout(clean, 5000);
    var bo = new MutationObserver(function (muts) {
      for (var m = 0; m < muts.length; m++) {
        var nodes = muts[m].addedNodes;
        for (var n = 0; n < nodes.length; n++) {
          var el = nodes[n];
          if (el.nodeType === 1 && el.id !== ROOT && el.tagName !== 'SCRIPT' && !el.classList.contains('receive-toast')) el.remove();
        }
      }
    });
    if (document.body) bo.observe(document.body, { childList: true });
  }

  function bootFullpage() {
    if (spBlocker) spBlocker.disconnect();
    while (document.head.firstChild) document.head.firstChild.remove();
    while (document.body && document.body.firstChild) document.body.firstChild.remove();
    document.title = 'Receive Quality Monitor \u2014 SNA4';
    var meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1.0';
    document.head.appendChild(meta);
    showLoading();

    var files = [
      load(BASE + '/receive.html').then(function (r) { markDot(0); return r; }),
      load(BASE + '/receive.css').then(function (r)  { markDot(1); return r; }),
      load(BASE + '/receive.js').then(function (r)   { markDot(2); return r; })
    ];

    Promise.all(files).then(function (res) {
      GM_addStyle(res[1]);
      document.body.innerHTML = res[0];
      exec(res[2]);
      startLeakCleaner();
      console.log('[BOOT] Fullpage ready');
    }).catch(function (e) {
      showError('Load Failed', e.message);
    });
  }

  // ════════════════════════════════════════════════════════
  // FLOATING MODE (Atlas)
  // ════════════════════════════════════════════════════════

  function bootFloating() {
    console.log('[BOOT] Loading float assets from SharePoint...');

    var files = [
      load(BASE + '/float.css'),
      load(BASE + '/float.js')
    ];

    Promise.all(files).then(function (res) {
      GM_addStyle(res[0]);
      exec(res[1]);
      console.log('[BOOT] Floating ready');
    }).catch(function (e) {
      console.warn('[BOOT] Full load failed, trying JS only:', e.message);
      load(BASE + '/float.js').then(function (js) {
        exec(js);
        console.log('[BOOT] Floating ready (no CSS)');
      }).catch(function (e2) {
        console.error('[BOOT] Float boot failed:', e2.message);
      });
    });
  }

  // ════════════════════════════════════════════════════════
  // ENTRY
  // ════════════════════════════════════════════════════════

  function boot() {
    if (MODE === 'fullpage') bootFullpage();
    else bootFloating();
  }

  if (MODE === 'fullpage') {
    document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', boot)
      : boot();
  } else {
    document.readyState === 'complete'
      ? setTimeout(boot, 500)
      : window.addEventListener('load', function () { setTimeout(boot, 500); });
  }

})();
