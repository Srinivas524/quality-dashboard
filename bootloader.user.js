// ==UserScript==
// @name         Atlas Receive Quality Monitor
// @version      2.2.0
// @description  Auto-monitors Receive Error Indicator & Decant Error Indicator for SNA4
// @author       Srinivas524
// @namespace    https://github.com/Srinivas524/quality-dashboard
// @homepageURL  https://github.com/Srinivas524/quality-dashboard
// @updateURL    https://github.com/Srinivas524/quality-dashboard/raw/refs/heads/main/bootloader.user.js
// @downloadURL  https://github.com/Srinivas524/quality-dashboard/raw/refs/heads/main/bootloader.user.js
// @match        https://amazon.sharepoint.com/sites/SNA4IB/SitePages/Receive.aspx
// @match        https://atlas.qubit.amazon.dev/*
// @connect      atlas.qubit.amazon.dev
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ── SharePoint document library (same-origin, normal fetch) ──
  var SP_BASE = 'https://amazon.sharepoint.com/sites/SNA4IB/DashboardApp/pages/receive';

  var FILES = {
    css: SP_BASE + '/receive.css',
    js:  SP_BASE + '/receive.js'
  };

  // Cache-bust so edits are picked up immediately
  function cacheBust(url) {
    return url + '?v=' + Date.now();
  }

  // ── Load a file from SharePoint (same origin = plain fetch) ──
  function loadFile(url) {
    return fetch(cacheBust(url), {
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + url);
      return res.text();
    });
  }

  // ── Boot sequence ──
  function boot() {
    Promise.all([
      loadFile(FILES.css),
      loadFile(FILES.js)
    ]).then(function (results) {
      var cssText = results[0];
      var jsText  = results[1];

      // 1) Inject CSS
      var style = document.createElement('style');
      style.textContent = cssText;
      document.head.appendChild(style);

      // 2) Execute JS — pass GM_xmlhttpRequest into the sandbox
      //    receive.js can reference GM_xmlhttpRequest as a normal variable
      var run = new Function('GM_xmlhttpRequest', jsText);
      run(GM_xmlhttpRequest);

      console.log('[Bootloader] receive module loaded');

    }).catch(function (err) {
      console.error('[Bootloader] Failed to load receive module:', err);
    });
  }

  // ── Wait for DOM then boot ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(boot, 300);
    }, { once: true });
  } else {
    setTimeout(boot, 300);
  }

})();
