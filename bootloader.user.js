// ==UserScript==
// @name         Atlas Receive Quality Monitor
// @version      2.1.0
// @description  Auto-monitors Receive Error Indicator & Decant Error Indicator for SNA4
// @author       Srinivas524
// @namespace    https://github.com/Srinivas524/quality-dashboard
// @homepageURL  https://github.com/Srinivas524/quality-dashboard
// @updateURL    https://github.com/Srinivas524/quality-dashboard/raw/refs/heads/main/receive-monitor.user.js
// @downloadURL  https://github.com/Srinivas524/quality-dashboard/raw/refs/heads/main/receive-monitor.user.js
// @match        https://amazon.sharepoint.com/sites/SNA4IB/SitePages/Receive.aspx
// @connect      atlas.qubit.amazon.dev
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const GRAPHQL_URL = "https://atlas.qubit.amazon.dev/graphql";
  const WAREHOUSE_ID = "SNA4";
  const DEPARTMENT = "receive";
  const THRESHOLD = 3300;
  const TRACKED_DEFECTS = ["Receive Error Indicator", "Decant Error Indicator"];
  const AUTO_REFRESH_MIN = 5;

  // ═══════════════════════════════════════════════════════════════
  // SHIFT TIME CALCULATION
  // ═══════════════════════════════════════════════════════════════

  function getShiftTimeRange() {
    const now = new Date();
    const hour = now.getHours();
    const shift = (hour >= 7 && hour < 18) ? 'day' : 'night';
    let start = new Date(now);
    let end = new Date(now);

    if (shift === 'day') {
      start.setHours(7, 0, 0, 0);
      end.setHours(17, 30, 0, 0);
    } else {
      if (hour >= 18) {
        start.setHours(18, 0, 0, 0);
        end.setDate(end.getDate() + 1);
        end.setHours(5, 0, 0, 0);
      } else {
        start.setDate(start.getDate() - 1);
        start.setHours(18, 0, 0, 0);
        end.setHours(5, 0, 0, 0);
      }
    }

    return {
      shift,
      startTime: Math.floor(start.getTime() / 1000),
      endTime: Math.floor(end.getTime() / 1000),
      startLocal: start.toLocaleString(),
      endLocal: end.toLocaleString()
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // SILENT PRE-AUTH
  // ═══════════════════════════════════════════════════════════════

  function silentPreAuth() {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;opacity:0;pointer-events:none;';
      iframe.src = 'https://atlas.qubit.amazon.dev';

      const timeout = setTimeout(() => { iframe.remove(); resolve(); }, 8000);

      iframe.onload = () => {
        clearTimeout(timeout);
        setTimeout(() => { iframe.remove(); resolve(); }, 500);
      };

      iframe.onerror = () => {
        clearTimeout(timeout);
        iframe.remove();
        resolve();
      };

      document.body.appendChild(iframe);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // GRAPHQL
  // ═══════════════════════════════════════════════════════════════

  const QUERY = `fragment ReportParts on Report {
    totalsReports {
      warehouseId defectType defectTypeAltName processPath subProcessAltName
      defectCount opportunities metricValue threshold metricType __typename
    }
    rawReports {
      processPath
      processLevelReport {
        aggregationField managerId subProcess subProcessAltName
        defectMap { k v __typename }
        totalDefects metricValue __typename
      }
      __typename
    }
    totalsReportsErrorMessage rawReportsErrorMessage __typename
  }
  query ($warehouseId: String!, $department: String!, $subprocess: String, $timeRanges: [TimeRange!]!) {
    getReportingByWarehouseId(warehouseId: $warehouseId, department: $department, subprocess: $subprocess, timeRanges: $timeRanges) {
      ...ReportParts __typename
    }
  }`;

  function fetchAtlas(timeRange) {
    const payload = {
      variables: {
        warehouseId: WAREHOUSE_ID,
        department: DEPARTMENT,
        subprocess: null,
        timeRanges: [{ startTime: timeRange.startTime, endTime: timeRange.endTime }]
      },
      query: QUERY
    };

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: GRAPHQL_URL,
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        data: JSON.stringify(payload),
        anonymous: false,
        timeout: 20000,
        onload(res) {
          try { resolve(JSON.parse(res.responseText)); }
          catch (e) { reject({ error: 'Parse error', detail: e.message }); }
        },
        onerror: (e) => reject({ error: 'Network error', details: e }),
        ontimeout: () => reject({ error: 'Timeout (20s)' })
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // PROCESS DATA
  // ═══════════════════════════════════════════════════════════════

  function processData(parsed) {
    const data = parsed?.data?.getReportingByWarehouseId;
    if (!data) return { status: 'error', message: 'No data returned from Atlas' };

    const totals = data.totalsReports || [];
    const rawReports = data.rawReports || [];

    const indicators = {};
    totals.forEach(r => {
      if (r.processPath === 'Receive' && TRACKED_DEFECTS.includes(r.defectType)) {
        indicators[r.defectType] = {
          metricValue: r.metricValue,
          over: r.metricValue > THRESHOLD
        };
      }
    });

    const flaggedNames = TRACKED_DEFECTS.filter(name => indicators[name]?.over);

    if (flaggedNames.length === 0) {
      return { status: 'clear', indicators, employees: [] };
    }

    const receiveRaw = rawReports.find(r => r.processPath === 'Receive');
    if (!receiveRaw) return { status: 'flagged', indicators, employees: [] };

    const employees = [];
    (receiveRaw.processLevelReport || []).forEach(emp => {
      let receiveVal = 0;
      let decantVal = 0;

      (emp.defectMap || []).forEach(d => {
        if (d.k === 'Receive Error Indicator') receiveVal = d.v || 0;
        if (d.k === 'Decant Error Indicator') decantVal = d.v || 0;
      });

      let hasRelevant = false;
      if (flaggedNames.includes('Receive Error Indicator') && receiveVal > 0) hasRelevant = true;
      if (flaggedNames.includes('Decant Error Indicator') && decantVal > 0) hasRelevant = true;

      if (hasRelevant) {
        employees.push({
          login: emp.aggregationField || '-',
          manager: emp.managerId || '-',
          receiveErrors: receiveVal,
          decantErrors: decantVal
        });
      }
    });

    employees.sort((a, b) => {
      let totalA = 0;
      let totalB = 0;
      if (flaggedNames.includes('Receive Error Indicator')) { totalA += a.receiveErrors; totalB += b.receiveErrors; }
      if (flaggedNames.includes('Decant Error Indicator')) { totalA += a.decantErrors; totalB += b.decantErrors; }
      return totalB - totalA;
    });

    return { status: 'flagged', indicators, employees };
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  function renderResults(result) {
    const content = document.getElementById('content');

    if (result.status === 'error') {
      content.innerHTML = `
        <div class="status-card error">
          <div class="status-icon">❌</div>
          <div class="status-title">Error</div>
          <div class="status-msg">${result.message}</div>
        </div>`;
      return;
    }

    const recvInd = result.indicators['Receive Error Indicator'];
    const decInd = result.indicators['Decant Error Indicator'];

    let html = `<div class="indicator-boxes">
      <div class="indicator-box ${recvInd?.over ? 'over' : 'under'}">
        <div class="indicator-label">Receive Error Indicator</div>
        <div class="indicator-status">${recvInd?.over ? '🚨 OVER THRESHOLD' : '✅ UNDER THRESHOLD'}</div>
        <div class="indicator-threshold">Threshold: ${THRESHOLD.toLocaleString()}</div>
      </div>
      <div class="indicator-box ${decInd?.over ? 'over' : 'under'}">
        <div class="indicator-label">Decant Error Indicator</div>
        <div class="indicator-status">${decInd?.over ? '🚨 OVER THRESHOLD' : '✅ UNDER THRESHOLD'}</div>
        <div class="indicator-threshold">Threshold: ${THRESHOLD.toLocaleString()}</div>
      </div>
    </div>`;

    if (result.status === 'clear') {
      html += `
        <div class="status-card clear">
          <div class="status-icon">✅</div>
          <div class="status-title">All Clear</div>
          <div class="status-msg">Both indicators are under threshold — no action needed</div>
        </div>`;
      content.innerHTML = html;
      return;
    }

    if (result.employees.length === 0) {
      html += `
        <div class="status-card warn">
          <div class="status-icon">⚠️</div>
          <div class="status-title">Threshold Exceeded</div>
          <div class="status-msg">No individual employees found with non-zero defect counts</div>
        </div>`;
      content.innerHTML = html;
      return;
    }

    html += `<div class="emp-header">👥 ${result.employees.length} employee${result.employees.length > 1 ? 's' : ''} with defects</div>`;
    html += `<div class="table-wrap"><table>
      <thead><tr>
        <th>#</th>
        <th>Login</th>
        <th>Manager</th>
        <th>Receive Errors</th>
        <th>Decant Errors</th>
      </tr></thead><tbody>`;

    result.employees.forEach((e, i) => {
      html += `<tr>
        <td class="num">${i + 1}</td>
        <td><strong>${e.login}</strong></td>
        <td>${e.manager}</td>
        <td class="num ${e.receiveErrors > 0 ? 'val-bad' : ''}">${e.receiveErrors}</td>
        <td class="num ${e.decantErrors > 0 ? 'val-bad' : ''}">${e.decantErrors}</td>
      </tr>`;
    });

    html += `</tbody></table></div>`;
    content.innerHTML = html;
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGE BUILD
  // ═══════════════════════════════════════════════════════════════

  function nukePage() {
    document.title = `Atlas — ${WAREHOUSE_ID} Receive Monitor`;
    document.documentElement.innerHTML = `
    <head>
      <meta charset="utf-8">
      <title>Atlas — ${WAREHOUSE_ID} Receive Monitor</title>
      <style>${CSS}</style>
    </head>
    <body>
      <div id="app">
        <header>
          <div class="header-left">
            <h1>📡 Receive Quality Monitor</h1>
            <span class="warehouse-badge">${WAREHOUSE_ID}</span>
          </div>
          <div class="header-right">
            <button id="btn-refresh" class="btn-refresh" title="Refresh now">🔄</button>
            <span id="clock"></span>
          </div>
        </header>
        <div class="shift-bar" id="shift-bar"></div>
        <div id="content">
          <div class="loading">
            <div class="spinner"></div>
            <div>Establishing session...</div>
          </div>
        </div>
        <div class="footer" id="footer"></div>
      </div>
    </body>`;
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════

  function renderShiftBar(tr) {
    const el = document.getElementById('shift-bar');
    const icon = tr.shift === 'day' ? '☀️' : '🌙';
    el.innerHTML = `${icon} <strong>${tr.shift.toUpperCase()} SHIFT</strong> &nbsp;—&nbsp; ${tr.startLocal} → ${tr.endLocal}`;
  }

  function renderFooter(elapsed) {
    const el = document.getElementById('footer');
    el.textContent = `Last updated: ${new Date().toLocaleTimeString()} — ${elapsed}ms — Auto-refreshes every ${AUTO_REFRESH_MIN} min`;
  }

  function startClock() {
    const el = document.getElementById('clock');
    if (!el) return;
    const tick = () => { el.textContent = new Date().toLocaleTimeString(); };
    tick();
    setInterval(tick, 1000);
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', bottom: '24px', right: '24px',
      background: '#1e293b', color: '#fff',
      padding: '12px 24px', borderRadius: '10px',
      fontSize: '14px', zIndex: '99999',
      boxShadow: '0 8px 32px rgba(0,0,0,.3)',
      transition: 'all .3s', opacity: '0', transform: 'translateY(10px)'
    });
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
    setTimeout(() => {
      t.style.opacity = '0'; t.style.transform = 'translateY(10px)';
      setTimeout(() => t.remove(), 300);
    }, 2500);
  }

  // ═══════════════════════════════════════════════════════════════
  // MAIN RUN CYCLE
  // ═══════════════════════════════════════════════════════════════

  async function runFetch(isAutoRefresh) {
    const content = document.getElementById('content');
    const tr = getShiftTimeRange();
    renderShiftBar(tr);

    if (!isAutoRefresh) {
      content.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
          <div>Establishing session...</div>
        </div>`;
      await silentPreAuth();
    }

    content.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <div>Fetching Receive data...</div>
      </div>`;

    const startMs = performance.now();

    try {
      const parsed = await fetchAtlas(tr);
      const elapsed = Math.round(performance.now() - startMs);
      const result = processData(parsed);
      renderResults(result);
      renderFooter(elapsed);
      if (isAutoRefresh) showToast('🔄 Auto-refreshed');
    } catch (err) {
      if (isAutoRefresh) {
        await silentPreAuth();
        try {
          const parsed = await fetchAtlas(tr);
          const elapsed = Math.round(performance.now() - startMs);
          const result = processData(parsed);
          renderResults(result);
          renderFooter(elapsed);
          showToast('🔄 Re-authenticated & refreshed');
          return;
        } catch (retryErr) {
          err = retryErr;
        }
      }

      content.innerHTML = `
        <div class="status-card error">
          <div class="status-icon">❌</div>
          <div class="status-title">Fetch Failed</div>
          <div class="status-msg">Session may have expired. Try refreshing the page.</div>
          <pre class="error-detail">${JSON.stringify(err, null, 2)}</pre>
        </div>`;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CSS
  // ═══════════════════════════════════════════════════════════════

  const CSS = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a; color: #e2e8f0; min-height: 100vh;
    }
    #app { max-width: 1000px; margin: 0 auto; padding: 16px 24px; }

    header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 0; border-bottom: 1px solid #1e293b; margin-bottom: 16px;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    h1 { font-size: 22px; font-weight: 800; color: #f8fafc; }
    .warehouse-badge {
      background: #2563eb; color: white; padding: 4px 12px;
      border-radius: 6px; font-size: 13px; font-weight: 700;
    }
    .header-right { display: flex; align-items: center; gap: 12px; font-size: 14px; color: #94a3b8; font-variant-numeric: tabular-nums; }

    .btn-refresh {
      background: #1e293b; border: 1px solid #334155; color: #94a3b8;
      padding: 6px 12px; border-radius: 8px; font-size: 16px;
      cursor: pointer; transition: all 0.2s;
    }
    .btn-refresh:hover { background: #334155; color: #e2e8f0; transform: rotate(90deg); }

    .shift-bar {
      background: #1e293b; border-radius: 10px; padding: 12px 16px;
      font-size: 13px; color: #94a3b8; margin-bottom: 16px;
      border: 1px solid #334155;
    }

    .indicator-boxes { display: flex; gap: 16px; margin-bottom: 20px; }
    .indicator-box {
      flex: 1; border-radius: 12px; padding: 20px 24px;
      display: flex; flex-direction: column; gap: 6px;
    }
    .indicator-box.over {
      background: rgba(220,38,38,0.08); border: 2px solid rgba(220,38,38,0.4);
    }
    .indicator-box.under {
      background: rgba(34,197,94,0.06); border: 2px solid rgba(34,197,94,0.3);
    }
    .indicator-label {
      font-size: 14px; font-weight: 700; color: #e2e8f0;
    }
    .indicator-status {
      font-size: 18px; font-weight: 800;
    }
    .indicator-box.over .indicator-status { color: #f87171; }
    .indicator-box.under .indicator-status { color: #4ade80; }
    .indicator-threshold {
      font-size: 12px; color: #64748b;
    }

    .status-card {
      text-align: center; padding: 60px 20px; border-radius: 12px;
      border: 1px solid #1e293b; margin: 20px 0;
    }
    .status-card.clear { background: rgba(34,197,94,0.05); border-color: rgba(34,197,94,0.2); }
    .status-card.error { background: rgba(220,38,38,0.05); border-color: rgba(220,38,38,0.2); }
    .status-card.warn { background: rgba(251,191,36,0.05); border-color: rgba(251,191,36,0.2); }
    .status-icon { font-size: 48px; margin-bottom: 12px; }
    .status-title { font-size: 22px; font-weight: 800; margin-bottom: 8px; }
    .status-card.clear .status-title { color: #4ade80; }
    .status-card.error .status-title { color: #f87171; }
    .status-card.warn .status-title { color: #fbbf24; }
    .status-msg { font-size: 14px; color: #94a3b8; }
    .error-detail {
      text-align: left; background: #0f172a; padding: 16px; margin-top: 16px;
      border-radius: 8px; font-size: 12px; color: #f87171;
      max-height: 150px; overflow: auto; font-family: 'SF Mono', monospace;
    }

    .emp-header {
      font-size: 14px; font-weight: 700; color: #e2e8f0;
      margin-bottom: 12px; padding: 8px 0;
      border-bottom: 1px solid #1e293b;
    }

    .table-wrap {
      overflow: auto; max-height: 60vh;
      border: 1px solid #1e293b; border-radius: 10px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead { position: sticky; top: 0; z-index: 10; }
    th {
      background: #1e293b; color: #94a3b8; padding: 10px 14px;
      text-align: left; font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.5px;
      border-bottom: 2px solid #334155; white-space: nowrap;
    }
    td {
      padding: 10px 14px; border-bottom: 1px solid #1e293b;
      color: #cbd5e1; white-space: nowrap;
    }
    tr:hover td { background: rgba(37,99,235,0.05); }
    .num { text-align: right; font-variant-numeric: tabular-nums; font-family: 'SF Mono', monospace; }
    .val-bad { color: #f87171; font-weight: 700; }

    .footer {
      margin-top: 16px; padding: 12px 0; font-size: 12px;
      color: #475569; border-top: 1px solid #1e293b; text-align: center;
    }

    .loading {
      text-align: center; padding: 80px 20px; color: #94a3b8;
      display: flex; flex-direction: column; align-items: center; gap: 16px;
    }
    .spinner {
      width: 40px; height: 40px;
      border: 3px solid #334155; border-top-color: #2563eb;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;

  // ═══════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════

  async function init() {
    nukePage();
    startClock();
    document.getElementById('btn-refresh').onclick = () => runFetch(false);
    await runFetch(false);
    setInterval(() => runFetch(true), AUTO_REFRESH_MIN * 60 * 1000);
    console.log('📡 Receive Quality Monitor loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300), { once: true });
  } else {
    setTimeout(init, 300);
  }

})();
