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

  var FLOAT_CSS_URL = FILE_BASE + '/float.css';

  var hostname = window.location.hostname.toLowerCase();
  var MODE = 'unknown';
  if (hostname.indexOf('sharepoint.com') > -1) MODE = 'fullpage';
  else if (hostname.indexOf('atlas.qubit.amazon.dev') > -1) MODE = 'floating';

  if (MODE === 'unknown') return;

  console.log('[RECEIVE BOOT] Mode: ' + MODE + ' | v' + BOOT_VERSION);

  window.RECEIVE_BOOT_VERSION = BOOT_VERSION;
  window.RECEIVE_MODE = MODE;

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
    console.log('[RECEIVE BOOT] Loading float CSS from SharePoint...');

    fetchFile(FLOAT_CSS_URL).then(function (css) {
      GM_addStyle(css);
      console.log('[RECEIVE BOOT] Float CSS injected');
      runFloatingWidget(GM_xmlhttpRequest);
    }).catch(function (err) {
      console.warn('[RECEIVE BOOT] Float CSS failed, using embedded fallback:', err.message);
      runFloatingWidget(GM_xmlhttpRequest);
    });
  }

  // ----------------------------------------------------------
  // EMBEDDED FLOATING WIDGET
  // ----------------------------------------------------------

  function runFloatingWidget(GM_fetch) {

    var GRAPHQL_URL = 'https://atlas.qubit.amazon.dev/graphql';
    var WAREHOUSE_ID = 'SNA4';
    var DEPARTMENT = 'receive';
    var THRESHOLD = 3300;
    var TRACKED_DEFECTS = ['Receive Error Indicator', 'Decant Error Indicator'];
    var AUTO_REFRESH_MIN = 5;
    var CLOCK_BATCH_SIZE = 3;
    var CLOCK_BATCH_DELAY = 800;

    var ICO = {
      sat: '\uD83D\uDCE1', check: '\u2705', siren: '\uD83D\uDEA8',
      warn: '\u26A0\uFE0F', cross: '\u274C', refresh: '\uD83D\uDD04',
      people: '\uD83D\uDC65', sun: '\u2600\uFE0F', moon: '\uD83C\uDF19',
      clock: '\uD83D\uDD52'
    };

    var panelOpen = false;
    var badgeStatus = 'loading';
    var isFetching = false;

    function esc(s) {
      if (!s) return '';
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function numFmt(n) {
      if (n == null) return '0';
      return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function pad2(n) { var s = String(n); return s.length < 2 ? '0' + s : s; }

    function cleanLogin(raw) {
      if (!raw) return '-';
      return raw.indexOf('-') > -1 ? raw.split('-').slice(1).join('-') : raw;
    }

    function showToast(msg) {
      var t = document.createElement('div');
      t.className = 'aqm-toast';
      t.textContent = msg;
      t.style.cssText = 'position:fixed;bottom:100px;right:24px;background:#1e293b;color:#fff;padding:10px 20px;border-radius:10px;font-size:13px;z-index:2147483647;box-shadow:0 8px 32px rgba(0,0,0,.3);opacity:0;transform:translateY(10px);transition:all .3s;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;';
      document.body.appendChild(t);
      requestAnimationFrame(function () { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
      setTimeout(function () {
        t.style.opacity = '0'; t.style.transform = 'translateY(10px)';
        setTimeout(function () { t.remove(); }, 300);
      }, 2500);
    }

    function getShiftTimeRange() {
      var now = new Date();
      var hour = now.getHours();
      var shift = (hour >= 7 && hour < 18) ? 'day' : 'night';
      var start = new Date(now), end = new Date(now);
      if (shift === 'day') {
        start.setHours(7, 0, 0, 0); end.setHours(17, 30, 0, 0);
      } else {
        if (hour >= 18) {
          start.setHours(18, 0, 0, 0); end.setDate(end.getDate() + 1); end.setHours(5, 0, 0, 0);
        } else {
          start.setDate(start.getDate() - 1); start.setHours(18, 0, 0, 0); end.setHours(5, 0, 0, 0);
        }
      }
      return { shift: shift, startTime: Math.floor(start.getTime() / 1000), endTime: Math.floor(end.getTime() / 1000), startLocal: start.toLocaleString(), endLocal: end.toLocaleString() };
    }

    function silentPreAuth() {
      return new Promise(function (resolve) {
        var iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;opacity:0;pointer-events:none;';
        iframe.src = 'https://atlas.qubit.amazon.dev';
        var to = setTimeout(function () { iframe.remove(); resolve(); }, 8000);
        iframe.onload = function () { clearTimeout(to); setTimeout(function () { iframe.remove(); resolve(); }, 500); };
        iframe.onerror = function () { clearTimeout(to); iframe.remove(); resolve(); };
        document.body.appendChild(iframe);
      });
    }

    // -- Clock status filter --

    function extractLastEvent(html) {
      var rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      var match;
      var events = [];
      while ((match = rowPattern.exec(html)) !== null) {
        var row = match[1];
        var typeMatch = row.match(/>(onclock\/paid|offclock\/unpaid)/i);
        if (!typeMatch) continue;
        var tdPattern = /<td[^>]*>(.*?)<\/td>/gi;
        var tds = [];
        var tdMatch;
        while ((tdMatch = tdPattern.exec(row)) !== null) {
          tds.push(tdMatch[1].trim());
        }
        if (tds.length < 2) continue;
        events.push({ type: typeMatch[1].toLowerCase(), ts: tds[0] + ' ' + tds[1] });
      }
      if (events.length === 0) return { status: 'Unknown', ts: 'No records' };
      var last = events[events.length - 1];
      return {
        status: last.type.indexOf('onclock') > -1 ? 'Clocked In' : 'Clocked Out',
        ts: last.ts
      };
    }

    function parseClockTimestamp(tsStr) {
      if (!tsStr || tsStr === 'No records' || tsStr === 'Error' || tsStr === 'Timeout') return null;
      var parts = tsStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!parts) return null;
      var month = parseInt(parts[1], 10) - 1;
      var day = parseInt(parts[2], 10);
      var year = parseInt(parts[3], 10);
      var hour = parseInt(parts[4], 10);
      var minute = parseInt(parts[5], 10);
      var ampm = parts[6].toUpperCase();
      if (ampm === 'PM' && hour !== 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
      return new Date(year, month, day, hour, minute, 0, 0);
    }

    function isWithinShift(tsStr, shiftRange) {
      var ts = parseClockTimestamp(tsStr);
      if (!ts) return false;
      var tsEpoch = Math.floor(ts.getTime() / 1000);
      return tsEpoch >= shiftRange.startTime && tsEpoch <= shiftRange.endTime;
    }

    function fetchClockStatus(login) {
      return new Promise(function (resolve) {
        var now = new Date();
        var start = new Date(now.getTime() - 24 * 3600 * 1000);
        var fmt = function (d) {
          return d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate());
        };
        var url = 'https://fclm-portal.amazon.com/employee/timeDetails?employeeId=' +
          encodeURIComponent(login) +
          '&warehouseId=' + WAREHOUSE_ID + '&spanType=Intraday' +
          '&startDateIntraday=' + fmt(start) + '&endDateIntraday=' + fmt(now) +
          '&startHourIntraday=' + start.getHours() + '&startMinuteIntraday=' + start.getMinutes() +
          '&endHourIntraday=' + now.getHours() + '&endMinuteIntraday=' + now.getMinutes();

        GM_fetch({
          method: 'GET', url: url, anonymous: false, timeout: 10000,
          onload: function (res) { resolve(extractLastEvent(res.responseText)); },
          onerror: function () { resolve({ status: 'Unknown', ts: 'Error' }); },
          ontimeout: function () { resolve({ status: 'Unknown', ts: 'Timeout' }); }
        });
      });
    }

    function filterByClockStatus(employees, shiftRange, onProgress) {
      return new Promise(function (resolve) {
        if (!employees.length) { resolve([]); return; }
        var valid = [];
        var checked = 0;
        var total = employees.length;

        function processBatch(startIdx) {
          var batch = employees.slice(startIdx, startIdx + CLOCK_BATCH_SIZE);
          if (batch.length === 0) { resolve(valid); return; }

          var promises = [];
          for (var i = 0; i < batch.length; i++) {
            (function (emp) {
              promises.push(
                fetchClockStatus(emp.login).then(function (result) {
                  checked++;
                  if (onProgress) onProgress(checked, total);
                  emp.clockStatus = result.status;
                  emp.clockTime = result.ts;
                  if (isWithinShift(result.ts, shiftRange)) {
                    valid.push(emp);
                  }
                })
              );
            })(batch[i]);
          }

          Promise.all(promises).then(function () {
            if (startIdx + CLOCK_BATCH_SIZE >= employees.length) {
              resolve(valid);
            } else {
              setTimeout(function () {
                processBatch(startIdx + CLOCK_BATCH_SIZE);
              }, CLOCK_BATCH_DELAY);
            }
          });
        }

        processBatch(0);
      });
    }

    // -- GraphQL --

    var QUERY = 'fragment ReportParts on Report { totalsReports { warehouseId defectType defectTypeAltName processPath subProcessAltName defectCount opportunities metricValue threshold metricType __typename } rawReports { processPath processLevelReport { aggregationField managerId subProcess subProcessAltName defectMap { k v __typename } totalDefects metricValue __typename } __typename } totalsReportsErrorMessage rawReportsErrorMessage __typename } query ($warehouseId: String!, $department: String!, $subprocess: String, $timeRanges: [TimeRange!]!) { getReportingByWarehouseId(warehouseId: $warehouseId, department: $department, subprocess: $subprocess, timeRanges: $timeRanges) { ...ReportParts __typename } }';

    function fetchAtlas(tr) {
      return new Promise(function (resolve, reject) {
        if (!GM_fetch) { reject({ error: 'GM_xmlhttpRequest not available' }); return; }
        GM_fetch({
          method: 'POST', url: GRAPHQL_URL,
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          data: JSON.stringify({ variables: { warehouseId: WAREHOUSE_ID, department: DEPARTMENT, subprocess: null, timeRanges: [{ startTime: tr.startTime, endTime: tr.endTime }] }, query: QUERY }),
          anonymous: false, timeout: 20000,
          onload: function (res) { try { resolve(JSON.parse(res.responseText)); } catch (e) { reject({ error: 'Parse error' }); } },
          onerror: function () { reject({ error: 'Network error' }); },
          ontimeout: function () { reject({ error: 'Timeout' }); }
        });
      });
    }

    function processData(parsed) {
      var data = parsed && parsed.data && parsed.data.getReportingByWarehouseId;
      if (!data) return { status: 'error', message: 'No data returned from Atlas' };
      var totals = data.totalsReports || [];
      var rawReports = data.rawReports || [];
      var indicators = {};
      var i;
      for (i = 0; i < totals.length; i++) {
        var r = totals[i];
        if (r.processPath === 'Receive' && TRACKED_DEFECTS.indexOf(r.defectType) > -1) {
          indicators[r.defectType] = { metricValue: r.metricValue, over: r.metricValue > THRESHOLD };
        }
      }
      var flagged = [];
      for (i = 0; i < TRACKED_DEFECTS.length; i++) {
        if (indicators[TRACKED_DEFECTS[i]] && indicators[TRACKED_DEFECTS[i]].over) flagged.push(TRACKED_DEFECTS[i]);
      }
      if (flagged.length === 0) return { status: 'clear', indicators: indicators, employees: [] };
      var receiveRaw = null;
      for (i = 0; i < rawReports.length; i++) {
        if (rawReports[i].processPath === 'Receive') { receiveRaw = rawReports[i]; break; }
      }
      if (!receiveRaw) return { status: 'flagged', indicators: indicators, employees: [] };
      var employees = [];
      var empList = receiveRaw.processLevelReport || [];
      for (i = 0; i < empList.length; i++) {
        var emp = empList[i];
        var rv = 0, dv = 0;
        var dm = emp.defectMap || [];
        for (var d = 0; d < dm.length; d++) {
          if (dm[d].k === 'Receive Error Indicator') rv = dm[d].v || 0;
          if (dm[d].k === 'Decant Error Indicator') dv = dm[d].v || 0;
        }
        var has = false;
        if (flagged.indexOf('Receive Error Indicator') > -1 && rv > 0) has = true;
        if (flagged.indexOf('Decant Error Indicator') > -1 && dv > 0) has = true;
        if (has) {
          var rawLogin = emp.aggregationField || '-';
          var login = cleanLogin(rawLogin);
          employees.push({ login: login, manager: emp.managerId || '-', receiveErrors: rv, decantErrors: dv, total: rv + dv });
        }
      }
      employees.sort(function (a, b) { return b.total - a.total; });
      return { status: 'flagged', indicators: indicators, employees: employees };
    }

    // -- Build UI --

    var fab = document.createElement('div');
    fab.id = 'aqm-fab';
    fab.title = 'Atlas Receive Monitor';
    fab.innerHTML = '<span class="aqm-fab-icon">' + ICO.sat + '</span><span class="aqm-badge-dot aqm-dot-blue" id="aqm-badge-dot"></span>';
    document.body.appendChild(fab);

    var panel = document.createElement('div');
    panel.id = 'aqm-panel';
    panel.innerHTML =
      '<div class="aqm-panel-header">' +
        '<div class="aqm-panel-header-left"><span class="aqm-panel-title">' + ICO.sat + ' Receive Monitor</span><span class="aqm-warehouse-badge">' + WAREHOUSE_ID + '</span></div>' +
        '<div class="aqm-panel-header-right"><button id="aqm-btn-refresh" class="aqm-btn-refresh" title="Refresh">' + ICO.refresh + '</button><span id="aqm-clock" class="aqm-clock"></span><button id="aqm-btn-close" class="aqm-btn-close" title="Close">\u2715</button></div>' +
      '</div>' +
      '<div class="aqm-shift-bar" id="aqm-shift-bar"></div>' +
      '<div class="aqm-panel-body" id="aqm-content"><div class="aqm-loading"><div class="aqm-spinner"></div><div>Establishing session...</div></div></div>' +
      '<div class="aqm-footer" id="aqm-footer"></div>';
    document.body.appendChild(panel);
    panel.addEventListener('click', function (e) { e.stopPropagation(); });

    function togglePanel() {
      panelOpen = !panelOpen;
      if (panelOpen) {
        panel.style.display = 'flex';
        requestAnimationFrame(function () { panel.style.opacity = '1'; panel.style.transform = 'scale(1) translateY(0)'; });
        fab.style.transform = 'scale(0.9)';
      } else {
        panel.style.opacity = '0';
        panel.style.transform = 'scale(0.95) translateY(20px)';
        setTimeout(function () { panel.style.display = 'none'; }, 200);
        fab.style.transform = 'scale(1)';
      }
    }

    fab.addEventListener('click', togglePanel);
    document.getElementById('aqm-btn-close').addEventListener('click', function (e) { e.stopPropagation(); togglePanel(); });
    document.getElementById('aqm-btn-refresh').addEventListener('click', function (e) { e.stopPropagation(); runFetch(false); });

    var clockEl = document.getElementById('aqm-clock');
    if (clockEl) {
      var tick = function () { clockEl.textContent = new Date().toLocaleTimeString(); };
      tick(); setInterval(tick, 1000);
    }

    function updateBadge() {
      var dot = document.getElementById('aqm-badge-dot');
      if (!dot) return;
      dot.className = 'aqm-badge-dot';
      if (badgeStatus === 'clear') dot.classList.add('aqm-dot-green');
      else if (badgeStatus === 'flagged') dot.classList.add('aqm-dot-red');
      else if (badgeStatus === 'error') dot.classList.add('aqm-dot-yellow');
      else dot.classList.add('aqm-dot-blue');
    }

    function renderShift(tr) {
      var el = document.getElementById('aqm-shift-bar');
      if (!el) return;
      var icon = tr.shift === 'day' ? ICO.sun : ICO.moon;
      el.innerHTML = icon + ' <strong>' + tr.shift.toUpperCase() + ' SHIFT</strong> &nbsp;&mdash;&nbsp; ' + esc(tr.startLocal) + ' &rarr; ' + esc(tr.endLocal);
    }

    function renderResults(result) {
      var content = document.getElementById('aqm-content');
      if (!content) return;

      if (result.status === 'error') {
        badgeStatus = 'error'; updateBadge();
        content.innerHTML = '<div class="aqm-status-card aqm-error"><div class="aqm-status-icon">' + ICO.cross + '</div><div class="aqm-status-title">Error</div><div class="aqm-status-msg">' + esc(result.message) + '</div></div>';
        return;
      }

      var ri = result.indicators['Receive Error Indicator'];
      var di = result.indicators['Decant Error Indicator'];

      var html = '<div class="aqm-indicator-boxes">' +
        '<div class="aqm-indicator-box ' + (ri && ri.over ? 'aqm-over' : 'aqm-under') + '"><div class="aqm-indicator-label">Receive Error Indicator</div><div class="aqm-indicator-status">' + (ri && ri.over ? ICO.siren + ' OVER' : ICO.check + ' UNDER') + '</div><div class="aqm-indicator-threshold">Threshold: ' + numFmt(THRESHOLD) + '</div></div>' +
        '<div class="aqm-indicator-box ' + (di && di.over ? 'aqm-over' : 'aqm-under') + '"><div class="aqm-indicator-label">Decant Error Indicator</div><div class="aqm-indicator-status">' + (di && di.over ? ICO.siren + ' OVER' : ICO.check + ' UNDER') + '</div><div class="aqm-indicator-threshold">Threshold: ' + numFmt(THRESHOLD) + '</div></div></div>';

      if (result.status === 'clear') {
        badgeStatus = 'clear'; updateBadge();
        html += '<div class="aqm-status-card aqm-clear"><div class="aqm-status-icon">' + ICO.check + '</div><div class="aqm-status-title">All Clear</div><div class="aqm-status-msg">Both indicators under threshold</div></div>';
        content.innerHTML = html; return;
      }

      badgeStatus = 'flagged'; updateBadge();

      if (!result.employees.length) {
        html += '<div class="aqm-status-card aqm-warn"><div class="aqm-status-icon">' + ICO.warn + '</div><div class="aqm-status-title">Threshold Exceeded</div><div class="aqm-status-msg">No employees matched current shift window</div></div>';
        content.innerHTML = html; return;
      }

      html += '<div class="aqm-emp-header">' + ICO.people + ' ' + result.employees.length + ' employee' + (result.employees.length > 1 ? 's' : '') + ' with defects (shift-verified)</div>';
      if (result.filteredOut > 0) {
        html += '<div class="aqm-filter-note">' + ICO.clock + ' ' + result.filteredOut + ' employee' + (result.filteredOut > 1 ? 's' : '') + ' filtered out (outside shift window)</div>';
      }
      html += '<div class="aqm-table-wrap"><table class="aqm-table"><thead><tr><th>#</th><th>Login</th><th>Manager</th><th>Recv Err</th><th>Dcnt Err</th><th>Clock</th></tr></thead><tbody>';
      for (var i = 0; i < result.employees.length; i++) {
        var e = result.employees[i];
        var clockCls = e.clockStatus === 'Clocked In' ? ' aqm-val-good' : '';
        html += '<tr><td class="aqm-num">' + (i + 1) + '</td><td><strong>' + esc(e.login) + '</strong></td><td>' + esc(e.manager) + '</td>' +
          '<td class="aqm-num' + (e.receiveErrors > 0 ? ' aqm-val-bad' : '') + '">' + e.receiveErrors + '</td>' +
          '<td class="aqm-num' + (e.decantErrors > 0 ? ' aqm-val-bad' : '') + '">' + e.decantErrors + '</td>' +
          '<td class="aqm-clock-cell' + clockCls + '"><div class="aqm-clock-status">' + esc(e.clockStatus || '-') + '</div><div class="aqm-clock-time">' + esc(e.clockTime || '-') + '</div></td></tr>';
      }
      html += '</tbody></table></div>';
      content.innerHTML = html;
    }

    function renderFooter(elapsed) {
      var el = document.getElementById('aqm-footer');
      if (el) el.textContent = 'Updated: ' + new Date().toLocaleTimeString() + ' -- ' + elapsed + 'ms -- Auto-refreshes every ' + AUTO_REFRESH_MIN + ' min';
    }

    function showVerifyingUI(content, indicators) {
      var ri = indicators['Receive Error Indicator'];
      var di = indicators['Decant Error Indicator'];
      var html = '<div class="aqm-indicator-boxes">' +
        '<div class="aqm-indicator-box ' + (ri && ri.over ? 'aqm-over' : 'aqm-under') + '"><div class="aqm-indicator-label">Receive Error Indicator</div><div class="aqm-indicator-status">' + (ri && ri.over ? ICO.siren + ' OVER' : ICO.check + ' UNDER') + '</div><div class="aqm-indicator-threshold">Threshold: ' + numFmt(THRESHOLD) + '</div></div>' +
        '<div class="aqm-indicator-box ' + (di && di.over ? 'aqm-over' : 'aqm-under') + '"><div class="aqm-indicator-label">Decant Error Indicator</div><div class="aqm-indicator-status">' + (di && di.over ? ICO.siren + ' OVER' : ICO.check + ' UNDER') + '</div><div class="aqm-indicator-threshold">Threshold: ' + numFmt(THRESHOLD) + '</div></div></div>';
      html += '<div class="aqm-verify-progress" id="aqm-verify-progress">' +
        '<div class="aqm-spinner"></div>' +
        '<div class="aqm-verify-text">' + ICO.clock + ' Verifying shift clock-in status...</div>' +
        '<div class="aqm-verify-bar-wrap"><div class="aqm-verify-bar" id="aqm-verify-bar" style="width:0%"></div></div>' +
        '<div class="aqm-verify-count" id="aqm-verify-count">0 / 0</div></div>';
      content.innerHTML = html;
    }

    function runFetch(isAuto) {
      if (isFetching) return;
      isFetching = true;
      var content = document.getElementById('aqm-content');
      if (!content) { isFetching = false; return; }
      var tr = getShiftTimeRange();
      renderShift(tr);

      if (!isAuto) {
        badgeStatus = 'loading'; updateBadge();
        content.innerHTML = '<div class="aqm-loading"><div class="aqm-spinner"></div><div>Establishing session...</div></div>';
      }

      function doFetch() {
        content.innerHTML = '<div class="aqm-loading"><div class="aqm-spinner"></div><div>Fetching Receive data...</div></div>';
        var startMs = Date.now();

        fetchAtlas(tr).then(function (parsed) {
          var result = processData(parsed);

          if (result.status !== 'flagged' || result.employees.length === 0) {
            isFetching = false;
            renderResults(result);
            renderFooter(Date.now() - startMs);
            if (isAuto) showToast(ICO.refresh + ' Auto-refreshed');
            return;
          }

          // Clock filter layer
          var unfilteredCount = result.employees.length;
          showVerifyingUI(content, result.indicators);

          filterByClockStatus(result.employees, tr, function (checked, total) {
            var bar = document.getElementById('aqm-verify-bar');
            var count = document.getElementById('aqm-verify-count');
            if (bar) bar.style.width = Math.round((checked / total) * 100) + '%';
            if (count) count.textContent = checked + ' / ' + total;
          }).then(function (filtered) {
            isFetching = false;
            result.employees = filtered;
            result.filteredOut = unfilteredCount - filtered.length;
            renderResults(result);
            renderFooter(Date.now() - startMs);
            if (isAuto) showToast(ICO.refresh + ' Auto-refreshed');
            console.log('[RECEIVE FLOAT] Clock filter: ' + unfilteredCount + ' → ' + filtered.length + ' (' + result.filteredOut + ' removed)');
          });

        }).catch(function (err) {
          if (isAuto) {
            silentPreAuth().then(function () { return fetchAtlas(tr); }).then(function (parsed) {
              isFetching = false;
              var result = processData(parsed);
              if (result.status === 'flagged' && result.employees.length > 0) {
                var uc = result.employees.length;
                filterByClockStatus(result.employees, tr, null).then(function (filtered) {
                  result.employees = filtered;
                  result.filteredOut = uc - filtered.length;
                  renderResults(result);
                  renderFooter(Date.now() - startMs);
                  showToast(ICO.refresh + ' Re-authenticated');
                });
              } else {
                renderResults(result);
                renderFooter(Date.now() - startMs);
                showToast(ICO.refresh + ' Re-authenticated');
              }
            }).catch(function () {
              isFetching = false; badgeStatus = 'error'; updateBadge();
              content.innerHTML = '<div class="aqm-status-card aqm-error"><div class="aqm-status-icon">' + ICO.cross + '</div><div class="aqm-status-title">Fetch Failed</div><div class="aqm-status-msg">Session expired. Try refreshing.</div></div>';
            });
            return;
          }
          isFetching = false; badgeStatus = 'error'; updateBadge();
          content.innerHTML = '<div class="aqm-status-card aqm-error"><div class="aqm-status-icon">' + ICO.cross + '</div><div class="aqm-status-title">Fetch Failed</div><div class="aqm-status-msg">Session expired. Try refreshing.</div><pre class="aqm-error-detail">' + esc(JSON.stringify(err, null, 2)) + '</pre></div>';
        });
      }

      if (!isAuto) silentPreAuth().then(doFetch);
      else doFetch();
    }

    runFetch(false);
    setInterval(function () { runFetch(true); }, AUTO_REFRESH_MIN * 60 * 1000);
    console.log('[RECEIVE FLOAT] Widget ready');
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
