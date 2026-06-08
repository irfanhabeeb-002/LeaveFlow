/* ============================================================
   LeaveFlow – Main Employee App
   Present-by-default leave tracking PWA
   ============================================================ */

'use strict';

// ── Constants ──────────────────────────────────────────────
const STORAGE = {
  EMPLOYEE_NAME: 'leaveflow_employee_name',
  EMPLOYEE_DATA: 'leaveflow_employee_data',
  LAST_FETCH:    'leaveflow_last_fetch',
  PENDING:       'leaveflow_pending_leaves'
};

const MONTHLY_LEAVES = 4;
const CACHE_TTL_MS   = 5 * 60 * 1000; // 5 minutes

// ── State ───────────────────────────────────────────────────
const state = {
  employeeName: null,
  employeeData: null,
  isSubmitting: false,
  selectedDate: null
};

// ── DOM refs ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Utilities ─────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateLong(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function isWeekend(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDay() === 0 || d.getDay() === 6;
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function todayLabel() {
  const d = new Date();
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  const container = $('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Screen navigation ─────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = $(id);
  if (screen) screen.classList.add('active');
}

// ── Service Worker registration ────────────────────────────────
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showToast('App updated — refresh for latest version', 'info', 6000);
        }
      });
    });

    // Listen for sync messages from SW
    navigator.serviceWorker.addEventListener('message', async e => {
      if (e.data?.type === 'SYNC_LEAVE') {
        await syncPendingLeaves();
      }
    });

    // Background sync registration
    if ('sync' in reg) {
      reg.sync.register('sync-leave').catch(() => {});
    }
  } catch (err) {
    console.warn('SW registration failed:', err);
  }
}

// ── Online / Offline handling ──────────────────────────────────
function setupNetworkListeners() {
  function update() {
    const offline = !navigator.onLine;
    document.body.classList.toggle('offline', offline);
    if (!offline) {
      syncPendingLeaves();
    }
  }
  window.addEventListener('online',  update);
  window.addEventListener('offline', update);
  update();
}

// ── PWA Install prompt ─────────────────────────────────────────
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = $('install-btn');
  if (btn) btn.classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  const btn = $('install-btn');
  if (btn) btn.classList.add('hidden');
  showToast('LeaveFlow installed!', 'success');
});

// ── Local storage helpers ──────────────────────────────────────
function saveEmployeeData(data) {
  try {
    localStorage.setItem(STORAGE.EMPLOYEE_DATA, JSON.stringify(data));
    localStorage.setItem(STORAGE.LAST_FETCH, Date.now().toString());
  } catch (e) { console.warn('Storage save failed', e); }
}

function loadCachedData() {
  try {
    const raw = localStorage.getItem(STORAGE.EMPLOYEE_DATA);
    if (!raw) return null;
    const lastFetch = parseInt(localStorage.getItem(STORAGE.LAST_FETCH) || '0');
    const age = Date.now() - lastFetch;
    return { data: JSON.parse(raw), stale: age > CACHE_TTL_MS };
  } catch { return null; }
}

// ── Pending leave queue (offline support) ──────────────────────
function getPendingLeaves() {
  try { return JSON.parse(localStorage.getItem(STORAGE.PENDING) || '[]'); }
  catch { return []; }
}

function addPendingLeave(name, date) {
  const pending = getPendingLeaves();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  pending.push({ id, name, date, timestamp: Date.now() });
  localStorage.setItem(STORAGE.PENDING, JSON.stringify(pending));
  return id;
}

function removePendingLeave(id) {
  const pending = getPendingLeaves().filter(p => p.id !== id);
  localStorage.setItem(STORAGE.PENDING, JSON.stringify(pending));
}

async function syncPendingLeaves() {
  if (!navigator.onLine || !API.isConfigured()) return;
  const pending = getPendingLeaves();
  if (!pending.length) return;

  for (const item of pending) {
    try {
      await API.submitLeave(item.name, item.date);
      removePendingLeave(item.id);
    } catch { /* retry next time */ }
  }

  // Refresh data after sync
  await loadEmployeeData(state.employeeName, true);
}

// ── Onboarding ─────────────────────────────────────────────────
function initOnboarding() {
  const form = $('onboarding-form');
  const input = $('employee-name-input');
  const btn = $('register-btn');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name || name.length < 2) {
      input.focus();
      showToast('Please enter your full name', 'error');
      return;
    }

    btn.classList.add('loading');
    btn.disabled = true;

    try {
      if (API.isConfigured() && navigator.onLine) {
        // Query employee data to verify if they exist in Google Sheet directory
        const res = await API.getEmployeeData(name);
        if (res.error) {
          throw new Error(res.error);
        }
        
        // Save credentials locally
        localStorage.setItem(STORAGE.EMPLOYEE_NAME, name);
        state.employeeName = name;
        
        const data = {
          leavesRemaining: res.employee?.leavesRemaining ?? MONTHLY_LEAVES,
          leavesUsed: res.employee?.leavesUsed ?? 0,
          leaveHistory: res.leaveHistory || [],
          status: res.employee?.status || 'Present'
        };
        // Force-save as fresh (clear stale timestamp)
        localStorage.setItem(STORAGE.LAST_FETCH, Date.now().toString());
        saveEmployeeData(data);
        state.employeeData = data;
        applyEmployeeData(data);
        
        showScreen('screen-home');
        showToast(`Welcome back, ${name.split(' ')[0]}!`, 'success');
      } else {
        // Offline or API not configured:
        // Only allow logging in if they match the locally cached profile
        // or if in demo mode (API not configured).
        const cached = loadCachedData();
        const savedName = localStorage.getItem(STORAGE.EMPLOYEE_NAME);
        
        if (savedName && savedName.toLowerCase() === name.toLowerCase()) {
          state.employeeName = savedName;
          if (cached) {
            state.employeeData = cached.data;
            applyEmployeeData(cached.data);
          } else {
            useDefaultData(savedName);
          }
          showScreen('screen-home');
          showToast(`Welcome back, ${name.split(' ')[0]}!`, 'success');
        } else if (!API.isConfigured()) {
          // Demo Mode: Allow auto-registration
          localStorage.setItem(STORAGE.EMPLOYEE_NAME, name);
          state.employeeName = name;
          useDefaultData(name);
          showScreen('screen-home');
          showToast(`Welcome, ${name.split(' ')[0]} (Demo Mode)!`, 'success');
        } else {
          showToast('An active internet connection is required for first-time login.', 'error');
        }
      }
    } catch (err) {
      console.error(err);
      if (err.message && err.message.toLowerCase().includes('not found')) {
        showToast('Name not found in organization directory. Please contact your admin.', 'error', 6000);
      } else {
        showToast(err.message || 'Verification failed. Please try again.', 'error');
      }
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });
}

// ── Load employee data ─────────────────────────────────────────
async function loadEmployeeData(name, forceRefresh = false) {
  // Try cache first
  const cached = loadCachedData();
  if (cached && !cached.stale && !forceRefresh) {
    applyEmployeeData(cached.data);
    return;
  }
  if (cached) applyEmployeeData(cached.data); // show stale immediately

  // Fetch fresh
  if (!API.isConfigured() || !navigator.onLine) {
    if (!cached) useDefaultData(name);
    return;
  }

  try {
    const result = await API.getEmployeeData(name);
    const data = {
      leavesRemaining: result.employee?.leavesRemaining ?? MONTHLY_LEAVES,
      leavesUsed: result.employee?.leavesUsed ?? 0,
      leaveHistory: result.leaveHistory || [],
      status: result.employee?.status || 'Present'
    };
    saveEmployeeData(data);
    state.employeeData = data;
    applyEmployeeData(data);
  } catch (err) {
    if (!cached) useDefaultData(name);
  }
}

function useDefaultData(name) {
  const data = {
    leavesRemaining: MONTHLY_LEAVES,
    leavesUsed: 0,
    leaveHistory: [],
    status: 'Present'
  };
  state.employeeData = data;
  applyEmployeeData(data);
}

// ── Render home screen ─────────────────────────────────────────
function applyEmployeeData(data) {
  state.employeeData = data;

  const name = state.employeeName;
  const firstName = name ? name.split(' ')[0] : 'there';

  // Merge pending leaves into leaveHistory for display
  const pending = getPendingLeaves();
  const leaveHistory = [...(data.leaveHistory || [])];
  
  // Deduplicate: find pending leaves that are not already in the fetched history
  const unsyncedPending = pending.filter(p => 
    (!p.name || p.name.toLowerCase() === name.toLowerCase()) && 
    !leaveHistory.some(h => h.date === p.date)
  );
  
  unsyncedPending.forEach(p => {
    leaveHistory.push({ date: p.date, type: 'Leave', pending: true });
  });

  // Greeting — greeting-text does not exist in DOM; merge into greeting-name
  $('greeting-date').textContent = todayLabel();
  $('greeting-name').innerHTML = `${greetingText()}, <span>${firstName}</span> 👋`;

  // Status badge
  const today = todayISO();
  const isOnLeaveToday = leaveHistory.some(l => l.date === today);
  const statusEl = $('today-status');

  if (isOnLeaveToday || data.status === 'On Leave') {
    statusEl.className = 'status-badge on-leave';
    statusEl.innerHTML = `<span class="status-dot"></span> On Leave Today`;
  } else {
    statusEl.className = 'status-badge present';
    statusEl.innerHTML = `<span class="status-dot"></span> Present Today`;
  }

  // Stats (incorporating unsynced pending leaves)
  const used = (data.leavesUsed ?? 0) + unsyncedPending.length;
  const remaining = Math.max(0, MONTHLY_LEAVES - used);
  const isOver = used > MONTHLY_LEAVES;

  $('stat-remaining').textContent = remaining;
  $('stat-remaining').className = `stat-value ${remaining === 0 ? 'danger' : 'accent'}`;
  $('stat-used').textContent = used;
  $('stat-used').className = `stat-value ${isOver ? 'danger' : ''}`;

  // Leave ring
  updateLeaveRing(remaining, MONTHLY_LEAVES);

  // Balance text
  $('balance-title').textContent = isOver
    ? `⚠️ Leave limit exceeded (${used - MONTHLY_LEAVES} over)`
    : `${remaining} leave${remaining !== 1 ? 's' : ''} remaining`;
  $('balance-sub').textContent = isOver
    ? 'You have taken more leaves than your monthly quota. Additional leaves are recorded.'
    : `You've used ${used} of ${MONTHLY_LEAVES} leaves this month. Resets on the 1st.`;

  // CTA state
  const takeLeavBtn = $('take-leave-btn');
  const onLeaveNote = $('on-leave-note');

  if (isOnLeaveToday) {
    takeLeavBtn.classList.add('hidden');
    onLeaveNote.classList.remove('hidden');
  } else {
    takeLeavBtn.classList.remove('hidden');
    onLeaveNote.classList.add('hidden');
  }

  // History
  renderLeaveHistory(leaveHistory);
}

function updateLeaveRing(remaining, total) {
  const pct = Math.min(1, Math.max(0, remaining / total));
  const circumference = 2 * Math.PI * 26; // r=26
  const offset = circumference * (1 - pct);

  const ring = $('ring-fg');
  if (ring) {
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = offset;
  }
  const ringVal = $('ring-value');
  if (ringVal) ringVal.textContent = remaining;
}

function renderLeaveHistory(history) {
  const list = $('history-list');
  if (!history.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🌿</div>
        <p>No leaves taken this month</p>
      </div>`;
    return;
  }

  // Sort newest first, show last 5
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  list.innerHTML = sorted.map((item, i) => `
    <div class="history-item ${item.pending ? 'pending' : ''}" style="animation-delay:${i * 50}ms">
      <div class="history-dot"></div>
      <span class="history-date">${formatDate(item.date)}</span>
      <span class="history-label">${item.pending ? 'Syncing...' : 'Leave'}</span>
    </div>
  `).join('');
}

// ── Leave submission ───────────────────────────────────────────
function initLeaveModal() {
  const modal   = $('leave-modal');
  const overlay = $('modal-overlay');
  const dateInput = $('leave-date-input');
  const confirmBtn = $('confirm-leave-btn');
  const cancelBtn  = $('cancel-leave-btn');

  // Set default date to today
  function openModal() {
    dateInput.value = todayISO();
    dateInput.min   = (() => {
      // Min: first day of current month
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    })();
    dateInput.max = todayISO(); // Can't submit future leaves
    overlay.classList.add('open');
    setTimeout(() => dateInput.focus(), 300);
  }

  function closeModal() {
    overlay.classList.remove('open');
  }

  $('take-leave-btn').addEventListener('click', openModal);

  cancelBtn.addEventListener('click', closeModal);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  // Keyboard close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
  });

  confirmBtn.addEventListener('click', async () => {
    const date = dateInput.value;
    if (!date) { showToast('Please select a date', 'error'); return; }
    if (isWeekend(date)) {
      showToast('Weekends don\'t consume leave balance', 'info');
      closeModal();
      return;
    }

    // Check for duplicate in history
    const history = state.employeeData?.leaveHistory || [];
    const alreadyTaken = history.some(l => l.date === date);
    if (alreadyTaken) {
      showToast('Leave already recorded for this date', 'info');
      closeModal();
      return;
    }

    await submitLeave(date);
    closeModal();
  });
}

async function submitLeave(date) {
  if (state.isSubmitting) return;
  state.isSubmitting = true;

  const btn = $('confirm-leave-btn');
  btn.classList.add('loading');
  btn.disabled = true;

  const name = state.employeeName;

  try {
    let result;

    if (!navigator.onLine || !API.isConfigured()) {
      // Offline: queue locally and compute optimistic state
      addPendingLeave(name, date);
      result = computeOptimisticResult(date);
      showToast('Leave queued — will sync when online', 'info');

      // Optimistic update using local data
      const data = state.employeeData || {};
      const newHistory = [...(data.leaveHistory || []), { date, type: 'Leave' }];
      const updatedData = {
        ...data,
        leavesUsed: result.leavesUsed,
        leavesRemaining: result.leavesRemaining,
        leaveHistory: newHistory
      };
      saveEmployeeData(updatedData);
      applyEmployeeData(updatedData);
      showSuccessScreen(date, result.leavesUsed, result.leavesRemaining);
    } else {
      result = await API.submitLeave(name, date);

      // Use server-authoritative leaveHistory if returned (preferred),
      // otherwise fall back to optimistic append (avoids client-side duplication)
      const data = state.employeeData || {};
      const serverHistory = result.leaveHistory || null;
      const newHistory = serverHistory
        ? serverHistory  // trust the server
        : [...(data.leaveHistory || []), { date, type: 'Leave' }];

      const updatedData = {
        ...data,
        leavesUsed: result.leavesUsed ?? (data.leavesUsed || 0) + 1,
        leavesRemaining: result.leavesRemaining ?? Math.max(0, (data.leavesRemaining ?? 4) - 1),
        leaveHistory: newHistory,
        status: 'On Leave'
      };
      saveEmployeeData(updatedData);
      applyEmployeeData(updatedData);
      showSuccessScreen(date, updatedData.leavesUsed, updatedData.leavesRemaining);
    }
  } catch (err) {
    showToast(err.message || 'Failed to record leave. Please try again.', 'error');
  } finally {
    state.isSubmitting = false;
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function computeOptimisticResult(date) {
  const data = state.employeeData || {};
  const used = (data.leavesUsed || 0) + 1;
  const remaining = Math.max(0, (data.leavesRemaining ?? MONTHLY_LEAVES) - 1);
  return { leavesUsed: used, leavesRemaining: remaining };
}

// ── Success screen ─────────────────────────────────────────────
function showSuccessScreen(date, leavesUsed, leavesRemaining) {
  $('success-date').textContent    = formatDateLong(date);
  $('success-used').textContent    = leavesUsed;
  $('success-remaining').textContent = leavesRemaining;
  $('success-remaining').className = `detail-val ${leavesRemaining === 0 ? 'amber' : 'green'}`;
  showScreen('screen-success');
}

// ── Init ───────────────────────────────────────────────────────
async function init() {
  // Check if already registered
  const savedName = localStorage.getItem(STORAGE.EMPLOYEE_NAME);

  if (savedName) {
    state.employeeName = savedName;
    showScreen('screen-home');
    applyEmployeeData({ leavesRemaining: MONTHLY_LEAVES, leavesUsed: 0, leaveHistory: [], status: 'Present' });
    await loadEmployeeData(savedName);
  } else {
    showScreen('screen-onboarding');
  }

  // Wire up navigation
  initOnboarding();
  initLeaveModal();
  initLogout();

  // Back button on success screen
  $('back-home-btn').addEventListener('click', () => {
    showScreen('screen-home');
  });

  // Install button
  $('install-btn')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') deferredPrompt = null;
  });

  // Refresh data on pull-down focus
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.employeeName) {
      loadEmployeeData(state.employeeName);
    }
  });

  // Network status
  setupNetworkListeners();

  // Register SW
  registerSW();

  // Sync pending leaves
  await syncPendingLeaves();
}

// ── Logout ─────────────────────────────────────────────────────
function initLogout() {
  const btn = $('logout-btn');
  if (!btn) return;
  
  btn.addEventListener('click', () => {
    const pending = getPendingLeaves();
    if (pending.length > 0) {
      if (!confirm('You have unsynced leaves that will be lost upon logging out. Log out anyway?')) {
        return;
      }
    }
    
    // Clear ALL local state so the next login always fetches fresh from server
    localStorage.removeItem(STORAGE.EMPLOYEE_NAME);
    localStorage.removeItem(STORAGE.EMPLOYEE_DATA);
    localStorage.removeItem(STORAGE.LAST_FETCH);   // force re-fetch on next login
    localStorage.removeItem(STORAGE.PENDING);
    
    state.employeeName = null;
    state.employeeData = null;
    
    // Reset inputs
    $('employee-name-input').value = '';
    
    showScreen('screen-onboarding');
    showToast('Logged out successfully', 'success');
  });
}

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
