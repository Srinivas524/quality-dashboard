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
// @connect      amazon.sharepoint.com
// @connect      atlas.qubit.amazon.dev
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const BASE = 'https://amazon.sharepoint.com/sites/SNA4IB/DashboardApp/pages/receive';
  const FILES = {
    css: BASE + '/receive.css',
    js:  BASE + '/receive.js'
  };

  function fetchFile(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url + '?_=' + Date.now(),
        headers: { 'Accept': '*/*' },
        onload(res) {
          if (res.status >= 200 && res.status < 300) {
            resolve(res.responseText);
          } else {
            reject(new Error(`HTTP ${res.status} loading ${url}`));
          }
        },
        onerror: () => reject(new Error('Network error loading ' + url)),
        ontimeout: () => reject(new Error('Timeout loading ' + url))
      });
    });
  }

  async function boot() {
    try {
      const [css, js] = await Promise.all([
        fetchFile(FILES.css),
        fetchFile(FILES.js)
      ]);

      // Inject CSS
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);

      // Execute JS — pass GM_xmlhttpRequest into the sandbox
      const run = new Function('GM_xmlhttpRequest', js);
      run(GM_xmlhttpRequest);

      console.log('📡 Bootloader: receive module loaded');
    } catch (err) {
      console.error('📡 Bootloader: failed to load receive module', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 300), { once: true });
  } else {
    setTimeout(boot, 300);
  }

})();
