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
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      amazon.sharepoint.com
// @connect      atlas.qubit.amazon.dev
// ==/UserScript==

(function () {
  'use strict';

  var SP_BASE = 'https://amazon.sharepoint.com/sites/SNA4IB/DashboardApp/pages/receive';

  var FILES = {
    css: SP_BASE + '/receive.css',
    js:  SP_BASE + '/receive.js'
  };

  // Expose GM_xmlhttpRequest so receive.js can call Atlas GraphQL
  window.GM_xmlhttpRequest_proxy = GM_xmlhttpRequest;

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

  function boot() {
    console.log('[AQM Boot] Loading receive module...');

    Promise.all([
      fetchFile(FILES.css),
      fetchFile(FILES.js)
    ]).then(function (results) {
      var cssText = results[0];
      var jsText  = results[1];

      // 1) Inject CSS
      GM_addStyle(cssText);
      console.log('[AQM Boot] ✅ CSS injected');

      // 2) Execute JS
      try {
        eval(jsText);
        console.log('[AQM Boot] ✅ JS executed — receive monitor loaded');
      } catch (err) {
        console.error('[AQM Boot] JS execution error:', err);
      }

    }).catch(function (err) {
      console.error('[AQM Boot] Failed to load receive module:', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(boot, 500);
    }, { once: true });
  } else {
    setTimeout(boot, 500);
  }

})();
