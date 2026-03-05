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

  const GRAPHQL_URL = "https://atlas.qubit.amazon.dev/graphql";
  const WAREHOUSE_ID = "SNA4";
  const DEPARTMENT = "receive";
  const THRESHOLD = 3300;
  const TRACKED_DEFECTS = ["Receive Error Indicator", "Decant Error Indicator"];
  const AUTO_REFRESH_MIN = 5;

  let panelOpen = false;
  let badgeStatus = 'loading'; // 'loading' | 'clear' | 'flagged' | 'error'
  let autoRefreshTimer = null;
  let initialized = false;

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
      let totalA = 0, totalB = 0;
      if (flaggedNames.includes('Receive Error Indicator')) { totalA += a.receiveErrors; totalB += b.receiveErrors; }
      if (flaggedNames.includes('Decant Error Indicator')) { totalA += a.decantErrors; totalB += b.decantErrors; }
      return totalB - totalA;
    });

    return { status: 'flagged', indicators, employees };
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER INSIDE PANEL
  // ═══════════════════════════════════════════════════════════════

  function renderResults(result) {
    const content = document.getElementById('aqm-content');
    if (!content) return;

    if (result.status === 'error') {
      badgeStatus = 'error';
      updateBadge();
      content.innerHTML = `
        <div class="aqm-status-card aqm-error">
          <div class="aqm-status-icon">❌</div>
          <div class="aqm-status-title">Error</div>
          <div class="aqm-status-msg">${result.message}</div>
        </div>`;
      return;
    }

    const recvInd = result.indicators['Receive Error Indicator'];
    const decInd = result.indicators['Decant Error Indicator'];

    let html = `<div class="aqm-indicator-boxes">
      <div class="aqm-indicator-box ${recvInd?.over ? 'aqm-over' : 'aqm-under'}">
        <div class="aqm-indicator-label">Receive Error Indicator</div>
        <div class="aqm-indicator-status">${recvInd?.over ? '🚨 OVER' : '✅ UNDER'}</div>
        <div class="aqm-indicator-threshold">Threshold: ${THRESHOLD.toLocaleString()}</div>
      </div>
      <div class="aqm-indicator-box ${decInd?.over ? 'aqm-over' : 'aqm-under'}">
        <div class="aqm-indicator-label">Decant Error Indicator</div>
        <div class="aqm-indicator-status">${decInd?.over ? '🚨 OVER' : '✅ UNDER'}</div>
        <div class="aqm-indicator-threshold">Threshold: ${THRESHOLD.toLocaleString()}</div>
      </div>
    </div>`;

    if (result.status === 'clear') {
      badgeStatus = 'clear';
      updateBadge();
      html += `
        <div class="aqm-status-card aqm-clear">
          <div class="aqm-status-icon">✅</div>
          <div class="aqm-status-title">All Clear</div>
          <div class="aqm-status-msg">Both indicators under threshold</div>
        </div>`;
      content.innerHTML = html;
      return;
    }

    badgeStatus = 'flagged';
    updateBadge();

    if (result.employees.length === 0) {
      html += `
        <div class="aqm-status-card aqm-warn">
          <div class="aqm-status-icon">⚠️</div>
          <div class="aqm-status-title">Threshold Exceeded</div>
          <div class="aqm-status-msg">No individual employees found with non-zero defect counts</div>
        </div>`;
      content.innerHTML = html;
      return;
    }

    html += `<div class="aqm-emp-header">👥 ${result.employees.length} employee${result.employees.length > 1 ? 's' : ''} with defects</div>`;
    html += `<div class="aqm-table-wrap"><table class="aqm-table">
      <thead><tr>
        <th>#</th>
        <th>Login</th>
        <th>Manager</th>
        <th>Recv Err</th>
        <th>Dcnt Err</th>
      </tr></thead><tbody>`;

    result.employees.forEach((e, i) => {
      html += `<tr>
        <td class="aqm-num">${i + 1}</td>
        <td><strong>${e.login}</strong></td>
        <td>${e.manager}</td>
        <td class="aqm-num ${e.receiveErrors > 0 ? 'aqm-val-bad' : ''}">${e.receiveErrors}</td>
        <td class="aqm-num ${e.decantErrors > 0 ? 'aqm-val-bad' : ''}">${e.decantErrors}</td>
      </tr>`;
    });

    html += `</tbody></table></div>`;
    content.innerHTML = html;
  }

  // ═══════════════════════════════════════════════════════════════
  // BADGE UPDATE (on floating icon)
  // ═══════════════════════════════════════════════════════════════

  function updateBadge() {
    const dot = document.getElementById('aqm-badge-dot');
    if (!dot) return;
    dot.className = 'aqm-badge-dot';
    if (badgeStatus === 'clear') {
      dot.classList.add('aqm-dot-green');
      dot.title = 'All clear';
    } else if (badgeStatus === 'flagged') {
      dot.classList.add('aqm-dot-red');
      dot.title = 'Threshold exceeded!';
    } else if (badgeStatus === 'error') {
      dot.classList.add('aqm-dot-yellow');
      dot.title = 'Error';
    } else {
      dot.classList.add('aqm-dot-blue');
      dot.title = 'Loading...';
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SHIFT BAR & FOOTER
  // ═══════════════════════════════════════════════════════════════

  function renderShiftBar(tr) {
    const el = document.getElementById('aqm-shift-bar');
    if (!el) return;
    const icon = tr.shift === 'day' ? '☀️' : '🌙';
    el.innerHTML = `${icon} <strong>${tr.shift.toUpperCase()} SHIFT</strong> &nbsp;—&nbsp; ${tr.startLocal} → ${tr.endLocal}`;
  }

  function renderFooter(elapsed) {
    const el = document.getElementById('aqm-footer');
    if (!el) return;
    el.textContent = `Updated: ${new Date().toLocaleTimeString()} — ${elapsed}ms — Auto-refreshes every ${AUTO_REFRESH_MIN} min`;
  }

  function startClock() {
    const el = document.getElementById('aqm-clock');
    if (!el) return;
    const tick = () => { el.textContent = new Date().toLocaleTimeString(); };
    tick();
    setInterval(tick, 1000);
  }

  // ═══════════════════════════════════════════════════════════════
  // TOAST
  // ═══════════════════════════════════════════════════════════════

  function showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', bottom: '100px', right: '24px',
      background: '#1e293b', color: '#fff',
      padding: '10px 20px', borderRadius: '10px',
      fontSize: '13px', zIndex: '2147483647',
      boxShadow: '0 8px 32px rgba(0,0,0,.3)',
      transition: 'all .3s', opacity: '0', transform: 'translateY(10px)',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    });
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
    setTimeout(() => {
      t.style.opacity = '0'; t.style.transform = 'translateY(10px)';
      setTimeout(() => t.remove(), 300);
    }, 2500);
  }

  // ═══════════════════════════════════════════════════════════════
  // TOGGLE PANEL
  // ═══════════════════════════════════════════════════════════════

  function togglePanel() {
    const panel = document.getElementById('aqm-panel');
    const fab = document.getElementById('aqm-fab');
    if (!panel) return;

    panelOpen = !panelOpen;

    if (panelOpen) {
      panel.style.display = 'flex';
      requestAnimationFrame(() => {
        panel.style.opacity = '1';
        panel.style.transform = 'scale(1) translateY(0)';
      });
      fab.style.transform = 'scale(0.9)';
    } else {
      panel.style.opacity = '0';
      panel.style.transform = 'scale(0.95) translateY(20px)';
      setTimeout(() => { panel.style.display = 'none'; }, 200);
      fab.style.transform = 'scale(1)';
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // BUILD FLOATING UI
  // ═══════════════════════════════════════════════════════════════

  function buildFloatingUI() {
    // Inject scoped styles
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // === Floating Action Button ===
    const fab = document.createElement('div');
    fab.id = 'aqm-fab';
    fab.title = 'Atlas Receive Monitor';
    fab.innerHTML = `
      <span class="aqm-fab-icon">📡</span>
      <span class="aqm-badge-dot aqm-dot-blue" id="aqm-badge-dot"></span>
    `;
    fab.addEventListener('click', togglePanel);
    document.body.appendChild(fab);

    // === Floating Panel ===
    const panel = document.createElement('div');
    panel.id = 'aqm-panel';
    panel.innerHTML = `
      <div class="aqm-panel-header">
        <div class="aqm-panel-header-left">
          <span class="aqm-panel-title">📡 Receive Monitor</span>
          <span class="aqm-warehouse-badge">${WAREHOUSE_ID}</span>
        </div>
        <div class="aqm-panel-header-right">
          <button id="aqm-btn-refresh" class="aqm-btn-refresh" title="Refresh now">🔄</button>
          <span id="aqm-clock" class="aqm-clock"></span>
          <button id="aqm-btn-close" class="aqm-btn-close" title="Close panel">✕</button>
        </div>
      </div>
      <div class="aqm-shift-bar" id="aqm-shift-bar"></div>
      <div class="aqm-panel-body" id="aqm-content">
        <div class="aqm-loading">
          <div class="aqm-spinner"></div>
          <div>Establishing session...</div>
        </div>
      </div>
      <div class="aqm-footer" id="aqm-footer"></div>
    `;
    document.body.appendChild(panel);

    // Wire up buttons
    document.getElementById('aqm-btn-close').addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel();
    });
    document.getElementById('aqm-btn-refresh').addEventListener('click', (e) => {
      e.stopPropagation();
      runFetch(false);
    });

    // Prevent clicks inside panel from closing it
    panel.addEventListener('click', (e) => e.stopPropagation());

    startClock();
  }

  // ═══════════════════════════════════════════════════════════════
  // MAIN RUN CYCLE
  // ═══════════════════════════════════════════════════════════════

  async function runFetch(isAutoRefresh) {
    const content = document.getElementById('aqm-content');
    if (!content) return;
    const tr = getShiftTimeRange();
    renderShiftBar(tr);

    if (!isAutoRefresh) {
      badgeStatus = 'loading';
      updateBadge();
      content.innerHTML = `
        <div class="aqm-loading">
          <div class="aqm-spinner"></div>
          <div>Establishing session...</div>
        </div>`;
      await silentPreAuth();
    }

    content.innerHTML = `
      <div class="aqm-loading">
        <div class="aqm-spinner"></div>
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

      badgeStatus = 'error';
      updateBadge();
      content.innerHTML = `
        <div class="aqm-status-card aqm-error">
          <div class="aqm-status-icon">❌</div>
          <div class="aqm-status-title">Fetch Failed</div>
          <div class="aqm-status-msg">Session may have expired. Try refreshing.</div>
          <pre class="aqm-error-detail">${JSON.stringify(err, null, 2)}</pre>
        </div>`;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CSS — all prefixed with aqm- to avoid conflicts
  // ═══════════════════════════════════════════════════════════════

  const CSS = `
    /* ===== Floating Action Button ===== */
    #aqm-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border: 2px solid #334155;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 2147483646;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 0 rgba(37,99,235,0.4);
      transition: all 0.3s cubic-bezier(.4,0,.2,1);
      user-select: none;
    }
    #aqm-fab:hover {
      transform: scale(1.1) !important;
      box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 4px rgba(37,99,235,0.25);
      border-color: #2563eb;
    }
    .aqm-fab-icon {
      font-size: 26px;
      line-height: 1;
    }

    /* Badge dot */
    .aqm-badge-dot {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid #0f172a;
      transition: background 0.3s;
    }
    .aqm-dot-green { background: #22c55e; }
    .aqm-dot-red { background: #ef4444; animation: aqm-pulse 1.5s infinite; }
    .aqm-dot-yellow { background: #f59e0b; }
    .aqm-dot-blue { background: #3b82f6; animation: aqm-pulse 1.5s infinite; }

    @keyframes aqm-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
      50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
    }

    /* ===== Floating Panel ===== */
    #aqm-panel {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 520px;
      max-height: calc(100vh - 120px);
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 16px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
      z-index: 2147483647;
      display: none;
      flex-direction: column;
      opacity: 0;
      transform: scale(0.95) translateY(20px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #e2e8f0;
      font-size: 13px;
      line-height: 1.5;
      overflow: hidden;
    }

    /* Panel Header */
    .aqm-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid #1e293b;
      background: #0f172a;
      flex-shrink: 0;
    }
    .aqm-panel-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .aqm-panel-title {
      font-size: 15px;
      font-weight: 800;
      color: #f8fafc;
    }
    .aqm-warehouse-badge {
      background: #2563eb;
      color: white;
      padding: 2px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
    }
    .aqm-panel-header-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .aqm-clock {
      font-size: 12px;
      color: #64748b;
      font-variant-numeric: tabular-nums;
    }
    .aqm-btn-refresh {
      background: #1e293b;
      border: 1px solid #334155;
      color: #94a3b8;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
      line-height: 1;
    }
    .aqm-btn-refresh:hover {
      background: #334155;
      color: #e2e8f0;
      transform: rotate(90deg);
    }
    .aqm-btn-close {
      background: none;
      border: 1px solid transparent;
      color: #64748b;
      font-size: 16px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
      transition: all 0.2s;
      line-height: 1;
    }
    .aqm-btn-close:hover {
      background: rgba(239,68,68,0.1);
      color: #f87171;
      border-color: rgba(239,68,68,0.3);
    }

    /* Shift bar */
    .aqm-shift-bar {
      background: #1e293b;
      padding: 8px 16px;
      font-size: 11px;
      color: #94a3b8;
      border-bottom: 1px solid #334155;
      flex-shrink: 0;
    }

    /* Scrollable body */
    .aqm-panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 14px 16px;
      min-height: 120px;
    }

    /* Indicator boxes */
    .aqm-indicator-boxes {
      display: flex;
      gap: 10px;
      margin-bottom: 14px;
    }
    .aqm-indicator-box {
      flex: 1;
      border-radius: 10px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .aqm-indicator-box.aqm-over {
      background: rgba(220,38,38,0.08);
      border: 2px solid rgba(220,38,38,0.4);
    }
    .aqm-indicator-box.aqm-under {
      background: rgba(34,197,94,0.06);
      border: 2px solid rgba(34,197,94,0.3);
    }
    .aqm-indicator-label {
      font-size: 12px;
      font-weight: 700;
      color: #e2e8f0;
    }
    .aqm-indicator-status {
      font-size: 15px;
      font-weight: 800;
    }
    .aqm-indicator-box.aqm-over .aqm-indicator-status { color: #f87171; }
    .aqm-indicator-box.aqm-under .aqm-indicator-status { color: #4ade80; }
    .aqm-indicator-threshold {
      font-size: 11px;
      color: #64748b;
    }

    /* Status cards */
    .aqm-status-card {
      text-align: center;
      padding: 40px 16px;
      border-radius: 10px;
      border: 1px solid #1e293b;
      margin: 10px 0;
    }
    .aqm-status-card.aqm-clear { background: rgba(34,197,94,0.05); border-color: rgba(34,197,94,0.2); }
    .aqm-status-card.aqm-error { background: rgba(220,38,38,0.05); border-color: rgba(220,38,38,0.2); }
    .aqm-status-card.aqm-warn { background: rgba(251,191,36,0.05); border-color: rgba(251,191,36,0.2); }
    .aqm-status-icon { font-size: 36px; margin-bottom: 8px; }
    .aqm-status-title { font-size: 18px; font-weight: 800; margin-bottom: 6px; }
    .aqm-status-card.aqm-clear .aqm-status-title { color: #4ade80; }
    .aqm-status-card.aqm-error .aqm-status-title { color: #f87171; }
    .aqm-status-card.aqm-warn .aqm-status-title { color: #fbbf24; }
    .aqm-status-msg { font-size: 12px; color: #94a3b8; }
    .aqm-error-detail {
      text-align: left;
      background: #0f172a;
      padding: 12px;
      margin-top: 12px;
      border-radius: 8px;
      font-size: 11px;
      color: #f87171;
      max-height: 100px;
      overflow: auto;
      font-family: 'SF Mono', Consolas, monospace;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* Employee list */
    .aqm-emp-header {
      font-size: 13px;
      font-weight: 700;
      color: #e2e8f0;
      margin-bottom: 10px;
      padding: 6px 0;
      border-bottom: 1px solid #1e293b;
    }
    .aqm-table-wrap {
      overflow: auto;
      max-height: 40vh;
      border: 1px solid #1e293b;
      border-radius: 8px;
    }
    .aqm-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .aqm-table thead {
      position: sticky;
      top: 0;
      z-index: 5;
    }
    .aqm-table th {
      background: #1e293b;
      color: #94a3b8;
      padding: 8px 10px;
      text-align: left;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #334155;
      white-space: nowrap;
    }
    .aqm-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #1e293b;
      color: #cbd5e1;
      white-space: nowrap;
    }
    .aqm-table tr:hover td { background: rgba(37,99,235,0.05); }
    .aqm-num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-family: 'SF Mono', Consolas, monospace;
    }
    .aqm-val-bad { color: #f87171; font-weight: 700; }

    /* Footer */
    .aqm-footer {
      padding: 10px 16px;
      font-size: 11px;
      color: #475569;
      border-top: 1px solid #1e293b;
      text-align: center;
      flex-shrink: 0;
      background: #0f172a;
    }

    /* Loading */
    .aqm-loading {
      text-align: center;
      padding: 50px 16px;
      color: #94a3b8;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      font-size: 13px;
    }
    .aqm-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #334155;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: aqm-spin 0.8s linear infinite;
    }
    @keyframes aqm-spin { to { transform: rotate(360deg); } }

    /* Scrollbar styling inside panel */
    .aqm-panel-body::-webkit-scrollbar,
    .aqm-table-wrap::-webkit-scrollbar {
      width: 6px;
    }
    .aqm-panel-body::-webkit-scrollbar-track,
    .aqm-table-wrap::-webkit-scrollbar-track {
      background: transparent;
    }
    .aqm-panel-body::-webkit-scrollbar-thumb,
    .aqm-table-wrap::-webkit-scrollbar-thumb {
      background: #334155;
      border-radius: 3px;
    }

    /* Responsive: narrower screens */
    @media (max-width: 600px) {
      #aqm-panel {
        width: calc(100vw - 16px);
        right: 8px;
        bottom: 88px;
        max-height: calc(100vh - 100px);
      }
      .aqm-indicator-boxes {
        flex-direction: column;
      }
    }
  `;

  // ═══════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════

  async function init() {
    if (initialized) return;
    initialized = true;

    buildFloatingUI();
    await runFetch(false);

    autoRefreshTimer = setInterval(() => runFetch(true), AUTO_REFRESH_MIN * 60 * 1000);
    console.log('📡 Receive Quality Monitor (floating) loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500), { once: true });
  } else {
    setTimeout(init, 500);
  }

})();
