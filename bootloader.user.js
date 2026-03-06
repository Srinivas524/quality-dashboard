// ==UserScript==
// @name         SNA4 IB Quality Dashboard -- Bootloader
// @namespace    https://github.com/Srinivas524/quality-dashboard
// @version      1.3.0
// @description  Dual-mode -- full dashboard on SharePoint, floating widget on Atlas
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

  var BOOT_VERSION = '1.3.0';
  var SP_BASE = 'https://amazon.sharepoint.com/sites/SNA4IB';
  var FILE_BASE = SP_BASE + '/DashboardApp/pages/receive';
  var ROOT_ID = 'receive-root';

  var FULLPAGE_FILES = {
    html: FILE_BASE + '/receive.html',
    css:  FILE_BASE + '/receive.css',
    js:   FILE_BASE + '/receive.js'
  };

  var FLOAT_FILES = {
    css: FILE_BASE + '/float.css',
    js:  FILE_BASE + '/float.js'
  };

  var hostname = window.location.hostname.toLowerCase();
  var MODE = 'unknown';
  if (hostname.indexOf('sharepoint.com') > -1) MODE = 'fullpage';
  else if (hostname.indexOf('atlas.qubit.amazon.dev') > -1) MODE = 'floating';

  if (MODE === 'unknown') return;

  console.log('[RECEIVE BOOT] Mode: ' + MODE + ' | v' + BOOT_VERSION);

  window.RECEIVE_BOOT_VERSION = BOOT_VERSION;
  window.RECEIVE_MODE = MODE;

  // -- Locked-down proxy for JS files loaded from SharePoint --
  window.GM_xmlhttpRequest_proxy = (function () {
    var ALLOWED_PREFIXES = [
      'https://atlas.qubit.amazon.dev/graphql',
      'https://fclm-portal.amazon.com/employee/timeDetails',
      FILE_BASE
    ];

    return function (opts) {
      if (!opts || !opts.url) return;

      var allowed = false;
      for (var i = 0; i < ALLOWED_PREFIXES.length; i++) {
        if (opts.url.indexOf(ALLOWED_PREFIXES[i]) === 0) { allowed = true; break; }
      }

      if (!allowed) {
        console.warn('[RECEIVE BOOT] Blocked unauthorized request to:', opts.url);
        if (opts.onerror) opts.onerror({ error: 'Blocked by bootloader' });
        return;
      }

      opts.anonymous = false;
      opts.timeout = Math.min(opts.timeout || 20000, 30000);
      return GM_xmlhttpRequest(opts);
    };
  })();

  // -- Internal fetch (unrestricted, only used by bootloader itself) --
  function fetchFile(url) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url + '?_nocache=' + Date.now(),
        headers: { 'Cache-Control': 'no-cache' },
        timeout: 15000,
        onload: function (res) {
          if (res.status >= 200 && res.status < 400) resolve(res.responseText);
          else reject(new Error('HTTP ' + res.status + ' for ' + url));
        },
        onerror: function () { reject(new Error('Network error: ' + url)); },
        ontimeout: function () { reject(new Error('Timeout: ' + url)); }
      });
    });
  }

  // ============================================================
  // FULLPAGE MODE (SharePoint)
  // ============================================================

  var spBlocker = null;

  if (MODE === 'fullpage') {
    spBlocker = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          if (node.nodeType !== 1) continue;
          var tag = node.tagName;
          if (tag === 'LINK' || tag === 'STYLE' || tag === 'SCRIPT') node.remove();
        }
      }
    });
    if (document.documentElement) {
      spBlocker.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function cleanLeaks() {
    if (!document.body) return;
    var children = document.body.children;
    for (var i = children.length - 1; i >= 0; i--) {
      var child = children[i];
      if (child.id !== ROOT_ID && child.tagName !== 'SCRIPT' && !child.classList.contains('receive-toast')) child.remove();
    }
  }

  function startLeakCleaner() {
    cleanLeaks();
    setTimeout(cleanLeaks, 500);
    setTimeout(cleanLeaks, 1000);
    setTimeout(cleanLeaks, 2000);
    setTimeout(cleanLeaks, 5000);
    var bo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var nodes = muts[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (n.nodeType === 1 && n.id !== ROOT_ID && n.tagName !== 'SCRIPT' && !n.classList.contains('receive-toast')) n.remove();
        }
      }
    });
    if (document.body) bo.observe(document.body, { childList: true });
  }

  function showLoadingScreen() {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.background = '#0f172a';
    document.body.style.fontFamily = "'Inter', system-ui, sans-serif";
    document.body.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:20px;">' +
        '<div style="width:48px;height:48px;border:4px solid rgba(37,99,235,0.2);border-top-color:#2563eb;border-radius:50%;animation:rspin 1s linear infinite;"></div>' +
        '<div style="color:#e2e8f0;font-size:18px;font-weight:700;">Receive Quality Monitor</div>' +
        '<div style="color:#64748b;font-size:13px;">Loading dashboard...</div>' +
        '<div style="display:flex;gap:6px;margin-top:8px;">' +
          '<div style="width:8px;height:8px;border-radius:50%;background:rgba(37,99,235,0.2);" id="bp-html"></div>' +
          '<div style="width:8px;height:8px;border-radius:50%;background:rgba(37,99,235,0.2);" id="bp-css"></div>' +
          '<div style="width:8px;height:8px;border-radius:50%;background:rgba(37,99,235,0.2);" id="bp-js"></div>' +
        '</div>' +
        '<div style="color:#475569;font-size:10px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-top:4px;">v' + BOOT_VERSION + '</div>' +
      '</div><style>@keyframes rspin{to{transform:rotate(360deg)}}</style>';
  }

  function markProgress(id) {
    var dot = document.getElementById(id);
    if (dot) dot.style.background = '#2563eb';
  }

  function showBootError(title, message, files) {
    var fl = '';
    if (files) { var k = Object.keys(files); for (var i = 0; i < k.length; i++) fl += '<div>' + k[i] + ': ' + files[k[i]] + '</div>'; }
    document.body.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:16px;font-family:Inter,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;">' +
        '<div style="font-size:48px;">\u26A0\uFE0F</div>' +
        '<div style="font-size:22px;font-weight:800;">' + title + '</div>' +
        '<div style="font-size:14px;color:#f87171;max-width:600px;text-align:center;word-break:break-all;">' + message + '</div>' +
        '<div style="margin-top:16px;padding:16px;background:#1e293b;border-radius:12px;font-size:12px;color:#94a3b8;max-width:600px;width:90%;">' + fl + '</div>' +
        '<button onclick="location.reload()" style="margin-top:16px;padding:10px 24px;border-radius:10px;border:none;background:#2563eb;color:white;font-size:14px;font-weight:700;cursor:pointer;">Reload</button>' +
      '</div>';
  }

  function bootFullPage() {
    if (spBlocker) spBlocker.disconnect();
    while (document.head.firstChild) document.head.firstChild.remove();
    while (document.body && document.body.firstChild) document.body.firstChild.remove();
    document.title = 'Receive Quality Monitor -- SNA4';
    var meta = document.createElement('meta');
    meta.name = 'viewport'; meta.content = 'width=device-width, initial-scale=1.0';
    document.head.appendChild(meta);
    showLoadingScreen();

    var fH = fetchFile(FULLPAGE_FILES.html).then(function (r) { markProgress('bp-html'); return r; });
    var fC = fetchFile(FULLPAGE_FILES.css).then(function (r) { markProgress('bp-css'); return r; });
    var fJ = fetchFile(FULLPAGE_FILES.js).then(function (r) { markProgress('bp-js'); return r; });

    Promise.all([fH, fC, fJ]).then(function (res) {
      GM_addStyle(res[1]);
      document.body.innerHTML = res[0];
      try { eval(res[2]); } catch (err) { showBootError('JS Error', err.message, FULLPAGE_FILES); return; }
      startLeakCleaner();
      console.log('[RECEIVE BOOT] Fullpage boot complete');
    }).catch(function (err) {
      showBootError('File Load Failed', err.message, FULLPAGE_FILES);
    });
  }

  // ============================================================
  // FLOATING MODE (Atlas)
  // ============================================================

  function bootFloating() {
    console.log('[RECEIVE BOOT] Loading float files from SharePoint...');

    var fCSS = fetchFile(FLOAT_FILES.css);
    var fJS = fetchFile(FLOAT_FILES.js);

    Promise.all([fCSS, fJS]).then(function (res) {
      GM_addStyle(res[0]);
      console.log('[RECEIVE BOOT] Float CSS injected');
      try { eval(res[1]); } catch (err) { console.error('[RECEIVE BOOT] Float JS error:', err); }
      console.log('[RECEIVE BOOT] Float JS executed');
    }).catch(function (err) {
      console.error('[RECEIVE BOOT] Float file load failed:', err.message);
      // Fallback: try JS only without CSS
      fJS.then(function (js) {
        console.warn('[RECEIVE BOOT] Running float JS without CSS');
        try { eval(js); } catch (e) { console.error('[RECEIVE BOOT] Float JS error:', e); }
      }).catch(function () {
        console.error('[RECEIVE BOOT] All float files failed. Widget not loaded.');
      });
    });
  }

  // ============================================================
  // ENTRY
  // ============================================================

  function boot() {
    if (MODE === 'fullpage') bootFullPage();
    else if (MODE === 'floating') bootFloating();
  }

  if (MODE === 'fullpage') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  } else {
    if (document.readyState === 'complete') setTimeout(boot, 500);
    else window.addEventListener('load', function () { setTimeout(boot, 500); });
  }

})();
