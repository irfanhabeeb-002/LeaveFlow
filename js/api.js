/* ============================================================
   LeaveFlow – Google Apps Script API Client
   Handles all communication with the backend
   ============================================================ */

'use strict';

const API = (() => {
  // ── CONFIG ─────────────────────────────────────────────
  // Replace this URL with your deployed Google Apps Script Web App URL
  const BASE_URL = window.LEAVEFLOW_API_URL || '';

  // Keys for localStorage (offline queue)
  const PENDING_KEY = 'leaveflow_pending_leaves';

  // ── HTTP helper ─────────────────────────────────────────
  async function request(action, params = {}) {
    if (!BASE_URL) {
      throw new Error('API_NOT_CONFIGURED');
    }

    const url = new URL(BASE_URL);
    url.searchParams.set('action', action);
    // Cache-busting: prevents browser/CDN from serving stale GAS responses
    url.searchParams.set('_t', Date.now().toString());
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',  // force browser to always make a real network request
        headers: { 'Accept': 'application/json' }
      });

      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') throw new Error('Request timed out');
      throw err;
    }
  }

  // ── Employee APIs ────────────────────────────────────────

  /**
   * Register a new employee
   * @param {string} name
   * @returns {Promise<{success: boolean, employee: object}>}
   */
  async function registerEmployee(name) {
    return request('registerEmployee', { name });
  }

  /**
   * Get employee data (balance, leave history)
   * @param {string} name
   * @returns {Promise<{employee: object, leaveHistory: array}>}
   */
  async function getEmployeeData(name) {
    return request('getEmployeeData', { name });
  }

  /**
   * Submit a leave for an employee
   * @param {string} name
   * @param {string} date - YYYY-MM-DD format
   * @returns {Promise<{success: boolean, leavesUsed: number, leavesRemaining: number}>}
   */
  async function submitLeave(name, date) {
    return request('submitLeave', { name, date });
  }

  // ── Admin APIs ────────────────────────────────────────────

  /**
   * Get full dashboard data
   * @param {string} month - YYYY-MM format
   * @returns {Promise<object>}
   */
  async function getDashboardData(month) {
    return request('getDashboardData', { month });
  }

  /**
   * Get all employees with their current status
   * @returns {Promise<{employees: array}>}
   */
  async function getAllEmployees() {
    return request('getAllEmployees');
  }

  /**
   * Get leave history with optional filters
   * @param {string} month - YYYY-MM format
   * @param {string} employeeName - optional
   * @returns {Promise<{leaves: array}>}
   */
  async function getLeaveHistory(month, employeeName = '') {
    return request('getLeaveHistory', { month, employeeName });
  }

  /**
   * Get attendance summary for a month
   * @param {string} month - YYYY-MM format
   * @returns {Promise<{attendance: array}>}
   */
  async function getAttendanceSummary(month) {
    return request('getAttendanceSummary', { month });
  }

  // ── Offline queue ─────────────────────────────────────────

  function getPendingLeaves() {
    try {
      return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    } catch { return []; }
  }

  function addPendingLeave(name, date) {
    const pending = getPendingLeaves();
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    pending.push({ id, name, date, timestamp: Date.now() });
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    return id;
  }

  function removePendingLeave(id) {
    const pending = getPendingLeaves().filter(p => p.id !== id);
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  }

  async function syncPendingLeaves() {
    const pending = getPendingLeaves();
    if (!pending.length || !BASE_URL) return { synced: 0, failed: 0 };

    let synced = 0, failed = 0;
    for (const item of pending) {
      try {
        await submitLeave(item.name, item.date);
        removePendingLeave(item.id);
        synced++;
      } catch {
        failed++;
      }
    }
    return { synced, failed };
  }

  // ── Check if API is configured ────────────────────────────
  function isConfigured() {
    return Boolean(BASE_URL);
  }

  return {
    registerEmployee,
    getEmployeeData,
    submitLeave,
    getDashboardData,
    getAllEmployees,
    getLeaveHistory,
    getAttendanceSummary,
    addPendingLeave,
    getPendingLeaves,
    removePendingLeave,
    syncPendingLeaves,
    isConfigured
  };
})();

// Expose globally
window.API = API;
