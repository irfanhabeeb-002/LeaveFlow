# LeaveFlow — System Architecture

> A deep-dive into the technical design, data model, data flow, and component interactions of LeaveFlow.

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Component Map](#2-component-map)
3. [Data Model](#3-data-model)
4. [API Reference (Backend Endpoints)](#4-api-reference-backend-endpoints)
5. [Data Flow Diagrams](#5-data-flow-diagrams)
   - [Employee Login](#51-employee-login-flow)
   - [Submit Leave (Online)](#52-submit-leave-online)
   - [Submit Leave (Offline)](#53-submit-leave-offline--sync)
   - [Admin Dashboard Load](#54-admin-dashboard-load)
6. [Frontend State Management](#6-frontend-state-management)
7. [Caching Strategy](#7-caching-strategy)
8. [PWA & Service Worker](#8-pwa--service-worker)
9. [CI/CD Pipeline](#9-cicd-pipeline)
10. [Security Model](#10-security-model)
11. [Known Limitations](#11-known-limitations)

---

## 1. High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser / PWA)                      │
│                                                                     │
│  ┌───────────────────┐          ┌──────────────────────────────┐   │
│  │   index.html      │          │       admin.html             │   │
│  │  (Employee App)   │          │    (Admin Dashboard)         │   │
│  │                   │          │                              │   │
│  │  app.js           │          │  admin.js                    │   │
│  │  ├─ Auth/Login    │          │  ├─ Overview panel           │   │
│  │  ├─ Leave submit  │          │  ├─ Team Members panel       │   │
│  │  ├─ Balance ring  │          │  ├─ Leave History panel      │   │
│  │  └─ History list  │          │  └─ Attendance panel         │   │
│  └────────┬──────────┘          └──────────────┬───────────────┘   │
│           │                                    │                   │
│           └──────────────┬─────────────────────┘                   │
│                          │  api.js (shared HTTP client)            │
│                          │  • cache: no-store                      │
│                          │  • _t timestamp cache-buster            │
│                          │  • 15s timeout + AbortController        │
└──────────────────────────┼──────────────────────────────────────────┘
                           │  HTTPS GET requests
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│              BACKEND — Google Apps Script Web App                   │
│                                                                     │
│  doGet(e) → switch(action)                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  registerEmployee  │  getEmployeeData  │  submitLeave       │   │
│  │  getAllEmployees    │  getLeaveHistory  │  getAttendance     │   │
│  │  getDashboardData  │  cleanup          │  setup             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                          │                                          │
│              SpreadsheetApp.openById(SPREADSHEET_ID)               │
└──────────────────────────┼──────────────────────────────────────────┘
                           │  Sheets API (internal)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  DATABASE — Google Sheets                           │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │   Employees      │  │  LeaveRecords     │  │   Attendance    │  │
│  │──────────────────│  │──────────────────│  │─────────────────│  │
│  │ Name             │  │ Date (YYYY-MM-DD) │  │ Date            │  │
│  │ LeavesRemaining  │  │ EmployeeName     │  │ EmployeeName    │  │
│  │ LeavesUsed       │  │ LeaveType        │  │ AttendanceStatus│  │
│  │ Status           │  └──────────────────┘  └─────────────────┘  │
│  └──────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Map

### Frontend Files

| File | Role | Key Responsibilities |
|------|------|---------------------|
| `index.html` | Employee PWA shell | Screen containers, modal markup, leave ring SVG |
| `admin.html` | Admin dashboard shell | Sidebar, panels, table containers |
| `js/api.js` | HTTP client | `fetch()` wrapper, cache-busting, timeout, error normalization |
| `js/app.js` | Employee logic | Auth, state, leave submission, offline queue, UI rendering |
| `js/admin.js` | Admin logic | Dashboard data fetch, panel rendering, month navigation |
| `js/config.js` | Runtime config | Injected at build time — exports `window.LEAVEFLOW_API_URL` |
| `css/style.css` | Employee styles | Dark theme, glassmorphism, animations, responsive layout |
| `css/admin.css` | Admin styles | Sidebar, panels, tables, metric cards |
| `sw.js` | Service Worker | Asset caching, offline fallback, update detection |
| `manifest.json` | PWA manifest | App name, icons, display mode, theme color |
| `build.js` | Build script | Reads `.env`, writes `config.js`, stamps new cache version in `sw.js` |
| `serve.js` | Dev server (Node) | Serves static files + MIME types locally on port 3000 |
| `serve.py` | Dev server (Python) | Same as above using Python's `http.server` |

### Backend File

| File | Role |
|------|------|
| `backend/Code.gs` | All server-side logic — reads/writes Google Sheets, handles all API actions |

---

## 3. Data Model

### Table: `Employees`

| Column | Type | Description |
|--------|------|-------------|
| `Name` | String | Full name — primary key (case-insensitive lookup) |
| `LeavesRemaining` | Integer | Mirror value — recomputed dynamically from LeaveRecords |
| `LeavesUsed` | Integer | Mirror value — recomputed dynamically from LeaveRecords |
| `Status` | String | `"Present"` or `"On Leave"` — synced on each API call |

> **Note:** `LeavesRemaining`, `LeavesUsed`, and `Status` in this table are **denormalized mirrors** for spreadsheet visibility only. The backend always recomputes these from `LeaveRecords` as the source of truth — they are never trusted as inputs.

---

### Table: `LeaveRecords`

| Column | Type | Description |
|--------|------|-------------|
| `Date` | String (YYYY-MM-DD) | Stored as plain text via `@STRING@` format to prevent Google Sheets auto-conversion |
| `EmployeeName` | String | Must match a name in the Employees table |
| `LeaveType` | String | Always `"Leave"` currently (extensible for sick/casual/etc.) |

**Deduplication:** Both the backend (`submitLeave`, `getLeaveHistory`, `getEmployeeData`) and the `cleanupDuplicateRows()` function ensure no `(EmployeeName, Date)` pair appears more than once.

---

### Table: `Attendance`

| Column | Type | Description |
|--------|------|-------------|
| `Date` | String (YYYY-MM-DD) | Stored as plain text |
| `EmployeeName` | String | Employee name |
| `AttendanceStatus` | String | `"On Leave"` or `"Present"` |

> **Note:** Attendance records are written/updated automatically by `submitLeave`. The `Present by Default` model means only `On Leave` entries are ever explicitly written — presence is inferred by absence of a leave record.

---

## 4. API Reference (Backend Endpoints)

All requests are HTTPS GET to the Apps Script Web App URL:
```
GET https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec?action={ACTION}&...params
```

| Action | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `registerEmployee` | `name` | `{success, employee}` | Registers employee if not exists; returns existing record if already registered |
| `getEmployeeData` | `name` | `{employee, leaveHistory[]}` | Returns current-month leave history and computed balance; writes back mirror values |
| `submitLeave` | `name`, `date` | `{success, leavesUsed, leavesRemaining, leaveHistory[]}` | Records leave; deduplicates; returns authoritative state |
| `getDashboardData` | `month` (YYYY-MM) | `{employees[], leaves[], attendance[], onLeaveToday, overQuota[], month}` | Full admin dashboard payload |
| `getAllEmployees` | — | `{employees[]}` | All employees with computed current-month balances |
| `getLeaveHistory` | `month`, `employeeName` (optional) | `{leaves[]}` | Filtered, deduplicated leave records for a month |
| `getAttendanceSummary` | `month` | `{attendance[]}` | Working days, present, leave, and % per employee |
| `cleanup` | — | `{success}` | Removes duplicate rows from LeaveRecords and Attendance |
| `setup` | — | `{success}` | Creates sheets with headers if they don't exist |

---

## 5. Data Flow Diagrams

### 5.1 Employee Login Flow

```
User enters name → Submit
        │
        ▼
  Is API configured?
  Is navigator.onLine?
        │
   YES ─┤
        ▼
  API: getEmployeeData(name)
        │
   Employee found? ──NO──► Show error: "Name not found in organization directory"
        │
       YES
        ▼
  Save to localStorage:
    leaveflow_employee_name  = name
    leaveflow_employee_data  = { leavesRemaining, leavesUsed, leaveHistory[], status }
    leaveflow_last_fetch     = Date.now()
        │
        ▼
  applyEmployeeData(data)
    • Compute isOnLeaveToday from leaveHistory (not cached status)
    • Render balance ring, stats, history list
    • Show/hide "Take Leave" button based on isOnLeaveToday
        │
        ▼
  showScreen('screen-home')
```

---

### 5.2 Submit Leave (Online)

```
User clicks "Take Leave" → selects date → "Confirm"
        │
        ▼
  Client-side pre-checks:
    • Is date a weekend? → toast "Weekends don't consume leave" → close
    • Is date already in state.employeeData.leaveHistory? → toast "Already recorded" → close
        │
        ▼
  API.submitLeave(name, date)
        │
        ▼ (inside Code.gs)
  cleanupDuplicateRows()         ← removes any pre-existing dups in the sheet
        │
        ▼
  Scan LeaveRecords for (name, date) pair
        │
   Found? ──YES──► Return { duplicate: true, leaveHistory[] } (no new row)
        │
       NO
        ▼
  lrSheet.appendRow([date, name, 'Leave'])
  updateAttendanceRecord(date, name, 'On Leave')
        │
        ▼
  getEmployeeData(name)          ← recomputes everything from scratch
        │
        ▼
  Return { success, leavesUsed, leavesRemaining, leaveHistory[] }
        │
        ▼ (back in app.js)
  Update state from server-authoritative leaveHistory
    state.employeeData.leaveHistory = result.leaveHistory   ← trusted
    state.employeeData.leavesUsed   = result.leavesUsed
    state.employeeData.leavesRemaining = result.leavesRemaining
    state.employeeData.status = 'On Leave'
        │
        ▼
  saveEmployeeData(updatedData)  ← persist to localStorage
  applyEmployeeData(updatedData) ← re-render UI
  showSuccessScreen(date, used, remaining)
```

---

### 5.3 Submit Leave (Offline → Sync)

```
User submits leave (offline)
        │
        ▼
  addPendingLeave(name, date)
    → pushed to localStorage['leaveflow_pending_leaves']
        │
        ▼
  computeOptimisticResult(date)
    → increments local used/remaining counters
        │
        ▼
  applyEmployeeData(optimistic)  ← UI updates instantly
  showSuccessScreen(...)
  Toast: "Leave queued — will sync when online"

          ···  later, when back online  ···

  window.addEventListener('online', syncPendingLeaves)
        │
        ▼
  For each pending leave:
    API.submitLeave(item.name, item.date)
      → Server handles dedup (won't double-count)
    removePendingLeave(item.id)
        │
        ▼
  loadEmployeeData(name, forceRefresh=true)
    → Fetches fresh state and re-renders UI with authoritative data
```

---

### 5.4 Admin Dashboard Load

```
Admin opens admin.html
        │
        ▼
  init()
    adminState.currentMonth = 'YYYY-MM'
        │
        ▼
  loadDashboard()
        │
        ▼
  Is API configured? Is navigator.onLine?
        │
   YES ─┤
        ▼
  API.getDashboardData(month)     ← _t cache-buster, cache: no-store
        │
        ▼  (inside Code.gs getDashboardData)
  getAllEmployees()
    → scans LeaveRecords → builds Set per employee → deduplicates
    → computes leavesUsed, leavesRemaining, status per employee
    → writes back mirror values to Employees sheet
        │
  getLeaveHistory(month, '')
    → scans LeaveRecords → deduplicates by (empName|date) key
    → sorts newest first
        │
  getAttendanceSummary(month)
    → countWorkingDays(month) — only counts weekdays up to today
    → presentDays = workingDays - leaveDays
    → attendancePct = round(presentDays / workingDays * 100)
        │
  todayLeaves → onLeaveToday count
  overQuota   → employees with leavesUsed > 4
        │
        ▼
  Returns { employees[], leaves[], attendance[], onLeaveToday, overQuota[], month }
        │
        ▼  (back in admin.js)
  adminState.data = result
  renderAll(result)
    ├─ renderOverview  → metric cards, today's leave table
    ├─ renderEmployees → team table with leave bars
    ├─ renderHistory   → filterable leave history table
    └─ renderAttendance → monthly attendance summary table
```

---

## 6. Frontend State Management

LeaveFlow uses a **simple module-level state object** — no React, no Redux.

### Employee App State (`app.js`)

```js
const state = {
  employeeName: null,      // string — set from localStorage on boot
  employeeData: null,      // { leavesRemaining, leavesUsed, leaveHistory[], status }
  isSubmitting: false,     // prevents double-click leave submissions
  selectedDate: null       // date string selected in the leave modal
};
```

**State transitions:**
```
Boot
 └─ localStorage has name? → showScreen(home) → loadEmployeeData()
 └─ No name?               → showScreen(onboarding)

Login
 └─ API.getEmployeeData() OK → state.employeeName, state.employeeData set
                             → saveEmployeeData() → showScreen(home)

Submit Leave
 └─ API.submitLeave() OK    → state.employeeData = server response data
                             → saveEmployeeData() → applyEmployeeData()

Logout
 └─ localStorage cleared → state.employeeName = null, state.employeeData = null
                         → showScreen(onboarding)
```

---

### Admin State (`admin.js`)

```js
const adminState = {
  currentPanel: 'overview',   // active sidebar panel
  currentMonth: 'YYYY-MM',    // month being viewed
  data: null                  // last fetched dashboard payload
};
```

---

## 7. Caching Strategy

LeaveFlow uses a **two-tier cache**:

### Tier 1 — Service Worker Cache (Static Assets)

Managed by `sw.js` using a **Cache First** strategy for static files:

```
Request for CSS/JS/HTML/icons
        │
        ▼
  SW intercepts
        │
  Asset in cache? ──YES──► Serve from cache (instant)
        │
       NO
        ▼
  Fetch from network → cache the response → serve it
```

The cache name (`leaveflow-v{timestamp}`) is stamped at build time by `build.js`. When the timestamp changes, the SW installs a new cache version and deletes the old one — forcing users to get updated assets.

---

### Tier 2 — localStorage (Employee Data)

```
STORAGE keys:
  leaveflow_employee_name   → "Irfan Habeeb"
  leaveflow_employee_data   → JSON blob: { leavesUsed, leavesRemaining, leaveHistory[] }
  leaveflow_last_fetch      → Unix timestamp of last successful API call
  leaveflow_pending_leaves  → JSON array of queued offline leaves
```

**Cache TTL: 5 minutes.** `loadEmployeeData()` logic:
```
loadEmployeeData(name, forceRefresh=false)
    │
    ▼
  cached = loadCachedData()
    │
  Cache fresh (< 5 min) AND !forceRefresh?
    ──YES──► applyEmployeeData(cached.data) and return
    │
    NO
    ▼
  Show stale cache immediately (if available)
    │
    ▼
  Fetch fresh from API
    ├─ Success → save to localStorage, applyEmployeeData(fresh)
    └─ Failure → stay with stale cache (or default data if no cache)
```

**Cache invalidation triggers:**
- Logout → clears all localStorage keys
- Login → overwrites with fresh server data + resets `last_fetch`
- `loadDashboard()` in admin → always fetches live (no cache layer)

---

## 8. PWA & Service Worker

### Manifest (`manifest.json`)

```json
{
  "name": "LeaveFlow",
  "short_name": "LeaveFlow",
  "display": "standalone",
  "start_url": "./",
  "theme_color": "#6366f1",
  "background_color": "#0f0f1a",
  "icons": [192×192, 512×512, maskable-512×512]
}
```

### Service Worker Lifecycle

```
1. INSTALL
   → Pre-caches: index.html, admin.html, all CSS, all JS, manifest, icons

2. ACTIVATE
   → Deletes old cache versions (by checking CACHE_NAME prefix)

3. FETCH intercept
   → Cache First for all same-origin requests
   → Falls back to network for non-cached resources

4. UPDATE DETECTION
   → Browser re-fetches sw.js byte-by-byte on every app load
   → If sw.js content changed (new CACHE_NAME from build stamp):
      → Installs new SW in background
      → Fires 'updatefound' event → app.js shows toast notification
```

---

## 9. CI/CD Pipeline

### GitHub Actions Workflow (`.github/workflows/deploy.yml`)

```
Trigger: push to main branch
          │
          ▼
  Checkout code
          │
          ▼
  Setup Node.js 20
          │
          ▼
  Run: node build.js
    Reads: LEAVEFLOW_API_URL (from GitHub Actions Secret)
    Writes: js/config.js   → window.LEAVEFLOW_API_URL = "https://..."
    Stamps: sw.js          → const CACHE_NAME = 'leaveflow-v{unix_timestamp}'
          │
          ▼
  Upload artifact (all project files)
          │
          ▼
  Deploy to GitHub Pages
          │
          ▼
  Live at: https://irfanhabeeb-002.github.io/LeaveFlow/
```

**PWA auto-update chain:**
```
New sw.js (different CACHE_NAME timestamp)
    → Browser detects byte difference on next app load
    → Installs new SW silently in background
    → On activation: clears old cache, loads new assets
    → app.js toast: "App updated — refresh for latest version"
```

---

## 10. Security Model

### Authentication

LeaveFlow uses **name-based directory authentication** — suitable for trusted internal teams.

```
Employee enters name
    │
    ▼
API: getEmployeeData(name)
    │
  Name in Employees sheet? ──NO──► Error: "not found in organization directory"
    │
   YES
    ▼
  Session created (localStorage) — no tokens, no passwords
```

**Implications:**
- ✅ Zero password management overhead
- ✅ Admin controls who can log in (Employees sheet = access list)
- ⚠️ Anyone who knows a registered name can log in as them — acceptable for small internal teams
- 🔒 For higher security, integrate Firebase Authentication and gate `getEmployeeData` behind an ID token check

---

### API Security

| Risk | Mitigation |
|------|-----------|
| Unauthorized employee registration | `registerEmployee` still works but employees logging in via onboarding now call `getEmployeeData` (not register). Only Admin dashboard calls `registerEmployee`. |
| Data tampering via direct API calls | All writes are gated to the connected Google Sheet — attacker would need to know SPREADSHEET_ID and also have the Web App URL |
| Sensitive data exposure | Only names, dates, and leave counts are stored — no PII beyond names |
| Stale browser caches serving wrong data | All API calls use `cache: 'no-store'` + `_t` timestamp buster |

---

## 11. Known Limitations

| Limitation | Impact | Potential Fix |
|-----------|--------|--------------|
| Name-only authentication | Any team member who knows a colleague's name can log in as them | Add PIN / Firebase Auth |
| Single GAS deployment URL | If the Apps Script deployment is deleted, all clients break | Store URL in multiple env configs; document re-deployment steps |
| Google Sheets as database | ~400ms+ round-trip per request vs real DB | Acceptable for ≤ 50 users; migrate to Firebase/Supabase for scale |
| No role-based access control | Admin panel is accessible to anyone who knows the URL | Add a simple admin PIN or Firebase Auth with custom claims |
| Monthly leave quota is hardcoded at 4 | Changing it requires redeploying the GAS backend | Move to a configurable `Settings` sheet row |
| Timezone is hardcoded to IST | Wrong date comparisons for other timezones | Already in `CONFIG.TIMEZONE` — just update before deploying |
| No audit log | No record of who submitted what when (beyond the sheet rows) | Add a `SubmittedAt` timestamp column to LeaveRecords |

---

*Last updated: June 2026 — LeaveFlow v1.0*
