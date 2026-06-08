/* ============================================================
   LeaveFlow – Admin Dashboard JS  (v2)
   Reads real data from localStorage written by the employee app.
   Key: leaveflow_employee_data → { leavesUsed, leavesRemaining, leaveHistory[] }
   Key: leaveflow_employee_name → string
   Key: leaveflow_pending_leaves → array of { name, date }
   ============================================================ */

'use strict';

// ── State ───────────────────────────────────────────────────────
const adminState = {
  currentPanel: 'overview',
  currentMonth: null,
  data: null
};

// ── DOM helper ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Date utilities ──────────────────────────────────────────────
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function pad(n) { return String(n).padStart(2, '0'); }

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function prevMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m-2, 1);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}

function nextMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getInitials(name) {
  return (name || '?').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '?';
}

function countWorkingDays(ym) {
  const [y, m] = ym.split('-').map(Number);
  const todayStr = todayISO();
  const [tY, tM, tD] = todayStr.split('-').map(Number);
  
  let endDay;
  if (y < tY || (y === tY && m < tM)) {
    // Past month: count the whole month
    endDay = new Date(y, m, 0).getDate();
  } else if (y === tY && m === tM) {
    // Current month: count up to today
    endDay = tD;
  } else {
    // Future month: 0 working days
    return 0;
  }
  
  let count = 0;
  for (let d = 1; d <= endDay; d++) {
    const wd = new Date(y, m-1, d).getDay();
    if (wd !== 0 && wd !== 6) count++;
  }
  return count;
}

// ── Toast ────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const c = $('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
}

// ══════════════════════════════════════════════════════════════════
//  READ REAL DATA FROM LOCALSTORAGE
//
//  The employee app writes these keys:
//    leaveflow_employee_name  — string
//    leaveflow_employee_data  — { leavesRemaining, leavesUsed, leaveHistory: [{date,type}] }
//    leaveflow_pending_leaves — [{id, name, date, timestamp}]   (offline queue)
//
//  We ALWAYS recount leavesUsed/remaining from leaveHistory for accuracy.
//  We also merge the pending queue so offline-submitted leaves appear instantly.
// ══════════════════════════════════════════════════════════════════
function readLocalData(month) {
  const today = todayISO();

  // 1. Employee name
  const empName = localStorage.getItem('leaveflow_employee_name') || null;
  if (!empName) return buildEmpty(month);

  // 2. Saved employee data blob
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('leaveflow_employee_data') || 'null'); } catch {}

  // 3. Pending (offline) leaves
  let pending = [];
  try { pending = JSON.parse(localStorage.getItem('leaveflow_pending_leaves') || '[]'); } catch {}

  // 4. Build full history = saved history + pending leaves (deduped by date)
  const savedHistory = Array.isArray(saved?.leaveHistory) ? saved.leaveHistory : [];
  const pendingDates = pending
    .filter(p => p.name === empName)
    .map(p => ({ date: p.date, type: 'Leave' }));

  const allHistory = [...savedHistory];
  pendingDates.forEach(p => {
    if (!allHistory.some(h => h.date === p.date)) allHistory.push(p);
  });

  // 5. Filter to the requested month
  const [y, m] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const monthEnd   = `${month}-${pad(new Date(y, m, 0).getDate())}`;

  const monthLeaves = allHistory.filter(l => {
    const d = (l.date || '').trim();
    return d >= monthStart && d <= monthEnd;
  });

  // 6. Recount from history (more accurate than cached counter)
  const leavesUsed      = monthLeaves.length;
  const leavesRemaining = Math.max(0, 4 - leavesUsed);
  const isOnLeaveToday  = monthLeaves.some(l => l.date === today);
  const isOverQuota     = leavesUsed > 4;

  // 7. Build structured objects
  const employee = {
    name: empName,
    leavesUsed,
    leavesRemaining,
    status: isOnLeaveToday ? 'On Leave' : 'Present'
  };

  const leaveRecords = monthLeaves
    .map(l => ({ date: l.date, employeeName: empName, leaveType: 'Leave' }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const workingDays  = countWorkingDays(month);
  const leaveDays    = leavesUsed;
  const presentDays  = Math.max(0, workingDays - leaveDays);
  const attendancePct = workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 100;

  return {
    employees:    [employee],
    leaves:       leaveRecords,
    attendance:   [{ employeeName: empName, workingDays, presentDays, leaveDays, attendancePct }],
    onLeaveToday: isOnLeaveToday ? 1 : 0,
    overQuota:    isOverQuota ? [employee] : [],
    month,
    source: 'local'
  };
}

function buildEmpty(month) {
  return { employees: [], leaves: [], attendance: [], onLeaveToday: 0, overQuota: [], month, source: 'empty' };
}

// ── Load dashboard data ──────────────────────────────────────────
async function loadDashboard() {
  // Force-reset any stuck refreshing state
  const refreshBtn = $('refresh-btn');
  refreshBtn?.classList.add('spinning');

  try {
    let result;
    if (API.isConfigured() && navigator.onLine) {
      // Add cache-busting _t param so browser doesn't serve stale GAS responses
      result = await API.getDashboardData(adminState.currentMonth);
    } else {
      result = readLocalData(adminState.currentMonth);
      if (result.source === 'empty') {
        showToast('No employee registered yet — open the employee app first', 'info');
      }
    }
    adminState.data = result;
    renderAll(result);
  } catch (err) {
    console.error('loadDashboard error:', err);
    showToast('Error loading data — showing local data', 'error');
    const fallback = readLocalData(adminState.currentMonth);
    adminState.data = fallback;
    renderAll(fallback);
  } finally {
    refreshBtn?.classList.remove('spinning');
  }
}

// ── Sidebar ──────────────────────────────────────────────────────
function initSidebar() {
  document.querySelectorAll('.nav-item[data-panel]').forEach(item => {
    item.addEventListener('click', () => {
      navigatePanel(item.dataset.panel);
      closeSidebar();
    });
  });

  const toggle  = $('sidebar-toggle');
  const sidebar = $('sidebar');
  const overlay = $('sidebar-overlay');

  toggle?.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    overlay.classList.toggle('show', open);
    toggle.setAttribute('aria-expanded', open);
  });
  overlay?.addEventListener('click', closeSidebar);

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    toggle?.setAttribute('aria-expanded', 'false');
  }
  window.closeSidebar = closeSidebar;
}

function navigatePanel(panel) {
  adminState.currentPanel = panel;

  // Sync sidebar nav items
  document.querySelectorAll('.nav-item[data-panel]').forEach(n => {
    const active = n.dataset.panel === panel;
    n.classList.toggle('active', active);
    n.setAttribute('aria-current', active ? 'page' : 'false');
  });

  // Sync mobile bottom nav items
  document.querySelectorAll('.mobile-nav-item').forEach(n => {
    const panelId = n.id.replace('mob-nav-', '');
    n.classList.toggle('active', panelId === panel);
  });

  document.querySelectorAll('.admin-panel').forEach(p => {
    p.classList.toggle('active', p.id === `panel-${panel}`);
  });

  const titles = {
    overview:   { title: 'Dashboard Overview',    sub: 'Real-time team attendance snapshot' },
    employees:  { title: 'Team Members',          sub: 'Leave balances and current status' },
    history:    { title: 'Leave History',          sub: 'All leave records this month' },
    attendance: { title: 'Attendance Report',      sub: 'Monthly attendance summary' }
  };
  const info = titles[panel] || titles.overview;
  $('topbar-title').textContent = info.title;
  $('topbar-sub').textContent   = info.sub;

  if (adminState.data) renderPanel(panel);
}

// ── Month navigation ─────────────────────────────────────────────
function initMonthNav() {
  $('month-prev')?.addEventListener('click', () => {
    adminState.currentMonth = prevMonth(adminState.currentMonth);
    updateMonthDisplay();
    loadDashboard();
  });
  $('month-next')?.addEventListener('click', () => {
    const nm = nextMonth(adminState.currentMonth);
    if (nm <= currentMonth()) {
      adminState.currentMonth = nm;
      updateMonthDisplay();
      loadDashboard();
    }
  });
}

function updateMonthDisplay() {
  const label = monthLabel(adminState.currentMonth);
  document.querySelectorAll('.month-label').forEach(el => el.textContent = label);
  const nextBtn = $('month-next');
  if (nextBtn) {
    const atCurrent = adminState.currentMonth >= currentMonth();
    nextBtn.disabled = atCurrent;
    nextBtn.style.opacity = atCurrent ? '0.4' : '1';
  }
}

// ── Render all ───────────────────────────────────────────────────
function renderAll(data) {
  renderOverview(data);
  renderEmployees(data);
  renderHistory(data);
  renderAttendance(data);
}

function renderPanel(panel) {
  const d = adminState.data;
  if (!d) return;
  if (panel === 'overview')   renderOverview(d);
  if (panel === 'employees')  renderEmployees(d);
  if (panel === 'history')    renderHistory(d);
  if (panel === 'attendance') renderAttendance(d);
}

// ── OVERVIEW ─────────────────────────────────────────────────────
function renderOverview(data) {
  const { employees = [], leaves = [], onLeaveToday = 0, overQuota = [] } = data;
  const today = todayISO();

  // Metric cards
  $('metric-total-employees').textContent = employees.length;
  $('metric-on-leave-today').textContent  = onLeaveToday;
  $('metric-total-leaves').textContent    = leaves.length;
  $('metric-over-quota').textContent      = overQuota.length;

  const avgBalance = employees.length
    ? (employees.reduce((s, e) => s + (e.leavesRemaining || 0), 0) / employees.length).toFixed(1)
    : 0;
  $('metric-avg-balance').textContent = avgBalance;

  // Over-quota alert
  const alertSection = $('alert-section');
  if (overQuota.length) {
    alertSection.classList.add('visible');
    $('alert-employees').innerHTML = overQuota.map(e => `
      <div class="alert-name">
        <div class="emp-avatar">${getInitials(e.name)}</div>
        ${e.name}
        <span style="opacity:0.65;font-size:0.75rem">(${e.leavesUsed} used)</span>
      </div>`).join('');
  } else {
    alertSection.classList.remove('visible');
  }

  // Today's leave table
  const todayLeaves = leaves.filter(l => l.date === today);
  $('today-leaves-count').textContent = todayLeaves.length;
  const tbody = $('today-leaves-body');

  if (todayLeaves.length) {
    tbody.innerHTML = todayLeaves.map(l => `
      <tr>
        <td><div class="employee-cell">
          <div class="emp-avatar">${getInitials(l.employeeName)}</div>
          <span class="emp-name">${l.employeeName}</span>
        </div></td>
        <td>${formatDate(l.date)}</td>
        <td><span class="chip chip-amber">On Leave</span></td>
      </tr>`).join('');
  } else {
    tbody.innerHTML = `<tr><td colspan="3">
      <div class="admin-empty">
        <div class="admin-empty-icon">✅</div>
        <h3>Full team present today</h3>
        <p>No leaves recorded for ${formatDate(today)}</p>
      </div></td></tr>`;
  }
}

// ── TEAM MEMBERS ─────────────────────────────────────────────────
function renderEmployees(data) {
  const { employees = [], overQuota = [] } = data;
  const overNames = new Set((overQuota || []).map(e => e.name));
  const tbody = $('employees-body');
  if (!tbody) return;

  $('employees-count').textContent = employees.length;

  if (!employees.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="admin-empty">
      <div class="admin-empty-icon">👥</div>
      <h3>No employees found</h3>
      <p>Open the employee app and register first</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = employees.map(emp => {
    const used      = emp.leavesUsed || 0;
    const remaining = emp.leavesRemaining ?? Math.max(0, 4 - used);
    const isOver    = used > 4 || overNames.has(emp.name);
    const barPct    = Math.min(100, (used / 4) * 100);
    const statusCls = emp.status === 'On Leave' ? 'chip-amber' : 'chip-green';
    const remColor  = remaining === 0 ? 'var(--red)' : remaining <= 1 ? 'var(--amber)' : 'var(--green)';

    return `<tr>
      <td><div class="employee-cell">
        <div class="emp-avatar">${getInitials(emp.name)}</div>
        <span class="emp-name">${emp.name}</span>
        ${isOver ? '<span class="emp-flag">Over quota</span>' : ''}
      </div></td>
      <td><span class="chip ${statusCls}">${emp.status || 'Present'}</span></td>
      <td>
        <div class="leave-bar-wrap">
          <div class="leave-bar-bg">
            <div class="leave-bar-fill ${isOver ? 'over' : ''}" style="width:${barPct}%"></div>
          </div>
          <span class="leave-bar-text">${used}/4</span>
        </div>
      </td>
      <td style="font-weight:600;color:${remColor}">${remaining}</td>
    </tr>`;
  }).join('');
}

// ── LEAVE HISTORY ────────────────────────────────────────────────
function renderHistory(data) {
  const { leaves = [], employees = [] } = data;

  $('history-count').textContent = leaves.length;

  // Repopulate filter dropdown
  const filter = $('history-filter');
  if (filter) {
    const prev = filter.value;
    filter.innerHTML = '<option value="">All employees</option>' +
      employees.map(e => `<option value="${e.name}">${e.name}</option>`).join('');
    // Restore selection if still valid
    if ([...filter.options].some(o => o.value === prev)) filter.value = prev;
  }

  applyHistoryFilter(leaves, filter ? filter.value : '');
}

function applyHistoryFilter(leaves, name) {
  const tbody   = $('history-body');
  const nameLower = (name || '').toLowerCase().trim();
  const sorted  = [...leaves]
    .filter(l => !nameLower || (l.employeeName || '').toLowerCase() === nameLower)
    .sort((a, b) => b.date.localeCompare(a.date));

  $('history-count').textContent = sorted.length;

  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan="3"><div class="admin-empty">
      <div class="admin-empty-icon">📋</div>
      <h3>No leave records</h3>
      <p>No leaves found for this period</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map(l => `
    <tr>
      <td>${formatDate(l.date)}</td>
      <td><div class="employee-cell">
        <div class="emp-avatar">${getInitials(l.employeeName)}</div>
        <span>${l.employeeName}</span>
      </div></td>
      <td><span class="chip chip-amber">Leave</span></td>
    </tr>`).join('');
}

// ── ATTENDANCE ───────────────────────────────────────────────────
function renderAttendance(data) {
  const { attendance = [] } = data;
  const tbody = $('attendance-body');

  $('attendance-count').textContent = attendance.length;

  if (!attendance.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="admin-empty">
      <div class="admin-empty-icon">📅</div>
      <h3>No attendance data</h3>
      <p>Attendance is derived automatically from leave records</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = attendance.map(a => {
    const pct  = a.attendancePct ?? 100;
    const chip = pct >= 90 ? 'chip-green' : pct >= 75 ? 'chip-amber' : 'chip-red';
    return `<tr>
      <td><div class="employee-cell">
        <div class="emp-avatar">${getInitials(a.employeeName)}</div>
        <span>${a.employeeName}</span>
      </div></td>
      <td style="font-weight:500">${a.workingDays}</td>
      <td style="color:var(--green);font-weight:600">${a.presentDays}</td>
      <td style="color:var(--amber);font-weight:600">${a.leaveDays}</td>
      <td><span class="chip ${chip}">${pct}%</span></td>
    </tr>`;
  }).join('');
}

// ── Refresh button ────────────────────────────────────────────────
function initRefresh() {
  $('refresh-btn')?.addEventListener('click', () => {
    loadDashboard();
  });
}

// ── History filter (persistent listener) ─────────────────────────
function initHistoryFilter() {
  $('history-filter')?.addEventListener('change', function () {
    const leaves = adminState.data?.leaves || [];
    applyHistoryFilter(leaves, this.value);
  });
}

// ── Add Member modal logic ────────────────────────────────────────
function initAddMember() {
  const overlay = $('add-member-modal-overlay');
  const btnOpen = $('add-member-btn');
  const btnCancel = $('cancel-add-member-btn');
  const form = $('add-member-form');
  const input = $('new-member-name');
  const btnSubmit = $('confirm-add-member-btn');

  if (!overlay || !btnOpen || !btnCancel || !form) return;

  function openModal() {
    input.value = '';
    overlay.classList.add('open');
    setTimeout(() => input.focus(), 200);
  }

  function closeModal() {
    overlay.classList.remove('open');
  }

  btnOpen.addEventListener('click', openModal);
  btnCancel.addEventListener('click', closeModal);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  // Handle ESC key to close modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) {
      closeModal();
    }
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name || name.length < 2) {
      showToast('Please enter a valid name (at least 2 characters)', 'error');
      input.focus();
      return;
    }

    btnSubmit.disabled = true;
    const originalText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = 'Saving...';

    try {
      if (API.isConfigured() && navigator.onLine) {
        const res = await API.registerEmployee(name);
        if (res.error) throw new Error(res.error);
        showToast(`Successfully registered ${name}!`, 'success');
      } else {
        // Fallback for offline/demo mode: save to local data structure
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem('leaveflow_employee_data') || 'null'); } catch {}
        
        // Save name locally to leaveflow_employee_name if there isn't one
        if (!localStorage.getItem('leaveflow_employee_name')) {
          localStorage.setItem('leaveflow_employee_name', name);
          localStorage.setItem('leaveflow_employee_data', JSON.stringify({
            leavesRemaining: 4,
            leavesUsed: 0,
            leaveHistory: [],
            status: 'Present'
          }));
        }
        showToast(`Registered ${name} locally (demo mode)!`, 'success');
      }
      closeModal();
      await loadDashboard();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to add team member', 'error');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalText;
    }
  });
}

// ── Init ─────────────────────────────────────────────────────────
async function init() {
  adminState.currentMonth = currentMonth();
  updateMonthDisplay();

  $('topbar-date').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });

  initSidebar();
  initMonthNav();
  initRefresh();
  initHistoryFilter();
  initAddMember();
  navigatePanel('overview');
  await loadDashboard();
}

// Expose navigatePanel globally so onclick attrs in HTML can call it
window.navigatePanel = navigatePanel;

document.addEventListener('DOMContentLoaded', init);
