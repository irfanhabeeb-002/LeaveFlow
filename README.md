<div align="center">

<img src="icons/icon-192.png" alt="LeaveFlow Logo" width="96" height="96" />

# LeaveFlow — Official PWA

**A production-grade Progressive Web App for zero-friction team leave tracking.**

[![Deploy to GitHub Pages](https://github.com/irfanhabeeb-002/LeaveFlow/actions/workflows/deploy.yml/badge.svg)](https://github.com/irfanhabeeb-002/LeaveFlow/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Google Apps Script](https://img.shields.io/badge/Backend-Apps_Script-4285F4?logo=google)](https://developers.google.com/apps-script)
[![Google Sheets](https://img.shields.io/badge/Database-Sheets-34A853?logo=googlesheets)](https://google.com/sheets)
[![Live](https://img.shields.io/badge/Live-LeaveFlow-1C7C54)](https://irfanhabeeb-002.github.io/LeaveFlow/)

</div>

---

## Overview

LeaveFlow is a **zero-friction, installable PWA** designed for tracking employee leaves across small teams. It operates on a **"Present by Default"** philosophy — employees are assumed present every working day and only open the app to record an absence. 

It runs entirely on **Google Sheets as a database** with a **Google Apps Script** serverless backend. This means zero monthly server costs, no complex infrastructure, and data that is always accessible and exportable.

**Target Users:**
- **Employees** seeking a fast, 3-second leave recording process directly from their home screen.
- **Administrators** managing attendance, tracking monthly quotas, and viewing real-time team status through a protected dashboard.

---

## Features

### 📱 Employee App
- **Directory Verification** — Only admin-registered employees can log in. No self-signup allowed.
- **One-Tap Leave Recording** — Select a date, confirm, and the leave is recorded instantly.
- **Live Balance Ring** — A premium, dynamic circular progress indicator showing leaves remaining versus used.
- **Monthly Quota Tracking** — Tracks 4 leaves/month, automatically resetting on the 1st of every month via an Apps Script scheduled trigger.
- **Offline Support** — Leaves are queued locally in `localStorage` and synced automatically when the device reconnects to the internet.
- **Duplicate Prevention** — Both client and server strictly block submitting a leave for the same date twice.
- **Session Logout** — One-tap logout clears all local state, requiring a fresh server fetch on the next login.

### 🛠️ Admin Dashboard
- **Team Members Panel** — View all employees with visual leave usage bars and exact remaining balances. Mobile-optimized card layout.
- **Leave History** — Full filterable log of all leaves by employee and month.
- **Attendance Summary** — Automatically computed working days, present count, leave count, and attendance percentage per employee.
- **Over-Quota Alerts** — Distinct alerts highlighting employees who have exceeded their monthly quota.
- **Month Navigation** — Browse historical data month-by-month to audit past records.
- **Member Management** — Add new employees directly from the dashboard, granting them immediate login access.
- **Real-time Refresh** — Force-pull the latest data from Google Sheets instantly without reloading the page.

### ⚡ Performance & Caching
- **Two-Tier Architecture** — Fast client-side rendering with asynchronous server validation.
- **Service Worker Caching** — Aggressive caching of static assets (HTML, CSS, JS, Icons) for instant load times.
- **Stale-While-Revalidate** — HTML documents are served instantly from cache while fresh copies are fetched in the background to prevent blank screens.
- **Data Caching** — Employee state is cached in `localStorage` with a 5-minute TTL to reduce network round-trips.

### 📲 PWA Capabilities
- **Installable** — Add to home screen on iOS and Android for a native app experience.
- **Standalone Mode** — Runs without browser chrome (URL bar, navigation buttons) for full immersion.
- **App Icons** — Includes standard and maskable variants (192px, 512px) for perfect OS integration.
- **Auto-Update System** — CI/CD injects a build timestamp into the service worker, forcing clients to seamlessly update caches when new code is deployed.

---

## App Structure

```
LeaveFlow App
├── 🏠 Employee App (index.html)
│   ├── Login / Onboarding Screen
│   ├── Home Dashboard
│   │   ├── Greeting & Live Date
│   │   ├── Live Balance Ring
│   │   ├── Quick "Take Leave" Action
│   │   └── Recent Leaves List
│   └── Success & Offline Sync Toasts
│
└── 🛠️ Admin Dashboard (admin.html)
    ├── Mobile Bottom Navigation & Desktop Sidebar
    ├── 📊 Overview
    │   ├── Over-quota Alerts
    │   ├── Metric Cards (Total, On Leave Today, Avg Balance)
    │   └── Employees on Leave Today (Table)
    ├── 👥 Team Members
    │   └── Employee specific usages & balances (Responsive Cards)
    ├── 📋 Leave History
    │   └── Filterable chronological log of all leaves
    └── 📅 Attendance
        └── Monthly summary with percentage calculations
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend Framework | Vanilla HTML, CSS, JavaScript (ES2020+) |
| Styling | Custom CSS — Glassmorphism, CSS variables, dark mode |
| PWA | Web App Manifest + Service Worker |
| Backend | Google Apps Script (Serverless, free tier) |
| Database | Google Sheets (Employees, LeaveRecords, Attendance) |
| Hosting | GitHub Pages (Static) |
| CI/CD | GitHub Actions |
| Dev Environment | Node.js / Python 3 (Zero dependencies) |

---

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────┐
│                      Client (PWA)                       │
│  index.html (Employee)         admin.html (Admin)       │
│  app.js                        admin.js                 │
├─────────────────────────────────────────────────────────┤
│                    Network Layer                        │
│  api.js (HTTPS GET, cache-busting, timeout handling)    │
├─────────────────────────────────────────────────────────┤
│                     Backend API                         │
│  Google Apps Script (Code.gs)                           │
│  Handles dedup, computations, and sheet operations      │
├──────────────────────────┬──────────────────────────────┤
│     Data Storage         │          Triggers            │
│  Google Sheets           │   Monthly Quota Reset        │
└──────────────────────────┴──────────────────────────────┘
```

**Data Flow:**
1. **Login:** Employee enters name → API verifies against `Employees` sheet → Session created in `localStorage`.
2. **Submit Leave:** Employee selects date → API receives request → Validates duplicate → Appends to `LeaveRecords` → Updates `Attendance` → Recomputes balances → Updates `Employees` sheet.
3. **Offline Mode:** Leave is queued in `localStorage` → `sync` event or `online` listener triggers background submission when connection is restored.
4. **Admin Dashboard:** Admin loads dashboard → API queries all sheets → Server computes dynamic monthly aggregations → JSON payload returned to client.

---

## Database Schema (Google Sheets)

### `Employees` (Directory & Mirrors)
- **Name:** String (Primary Key)
- **LeavesRemaining:** Integer (Dynamic mirror, recomputed by backend)
- **LeavesUsed:** Integer (Dynamic mirror, recomputed by backend)
- **Status:** String ("Present" or "On Leave")

### `LeaveRecords` (Source of Truth)
- **Date:** String (YYYY-MM-DD, stored as text)
- **EmployeeName:** String (Foreign Key to Employees)
- **LeaveType:** String (Currently "Leave")

### `Attendance` (Monthly Summaries)
- **Date:** String (YYYY-MM-DD)
- **EmployeeName:** String
- **AttendanceStatus:** String ("Present" or "On Leave")

---

## Security

- **No Self-Registration:** Employees can only log in if the Admin has added their exact name to the `Employees` sheet.
- **Write Validation:** The backend automatically deduplicates `(EmployeeName, Date)` pairs to prevent double-charging quotas.
- **No Passwords:** Authentication is name-based directory lookup. This is designed for small, high-trust internal teams.
- **Stateless Backend:** Google Apps Script serves as a stateless API gateway; all authorization is based on the provided parameters mapped to the Sheets data.

---

## Setup & Development

### Prerequisites
- Node.js (for local dev server and build scripts)
- A Google Account (to host the Sheets database and Apps Script backend)

### Step 1 — Database Setup
1. Go to [sheets.google.com](https://sheets.google.com) and create a blank spreadsheet named **LeaveFlow**.
2. Copy the **Spreadsheet ID** from the URL bar (`https://docs.google.com/spreadsheets/d/▶SPREADSHEET_ID◀/edit`).

### Step 2 — Backend Deployment
1. In your Google Sheet, navigate to **Extensions → Apps Script**.
2. Delete the default code and paste the full contents of `backend/Code.gs`.
3. Set your Spreadsheet ID at the top: `SPREADSHEET_ID: 'YOUR_ID_HERE'`.
4. Select `setupSheets` from the function dropdown and click **Run** (creates the required tables).
5. Select `createMonthlyResetTrigger` and click **Run** (schedules the 1st-of-month quota reset).
6. Click **Deploy → New deployment → Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Copy the generated **Web App URL**. *(Note: Always deploy a "New version" when updating Code.gs)*.

### Step 3 — Local Development
```bash
git clone https://github.com/irfanhabeeb-002/LeaveFlow.git
cd LeaveFlow
cp .env.example .env
```
Edit `.env` and add your Web App URL:
```env
LEAVEFLOW_API_URL=https://script.google.com/macros/s/.../exec
```
Start the zero-dependency dev server:
```bash
npm start
```
Open `http://localhost:3000`. The server automatically injects your API URL into `js/config.js`.

---

## CI/CD Pipeline

GitHub Actions automatically handles production builds and cache invalidation on every push to `main`.

```text
Push to main
    │
    ▼
✅ Checkout code
    │
    ▼
📦 Setup Node.js 20
    │
    ▼
🏗 Run build.js
    ├─ Injects LEAVEFLOW_API_URL from GitHub Secrets
    └─ Stamps sw.js with new CACHE_VERSION timestamp
    │
    ▼
📤 Upload build artifact
    │
    ▼
🚀 Deploy to GitHub Pages
```

---

## PWA Configuration

| Property | Value |
|---|---|
| Name | LeaveFlow |
| Display Mode | `standalone` |
| Theme Color | `#6366f1` (Indigo) |
| Background Color | `#0a0a0f` |
| Orientation | `portrait-primary` |
| Start URL | `./index.html` |
| Icon Sizes | 72px to 512px (Regular & Maskable) |

### Cache Invalidation Strategy
The `build.js` script dynamically rewrites the `CACHE_VERSION` constant in `sw.js` with a Unix timestamp. When a device detects a byte-level change in `sw.js`, it automatically installs the new service worker, clears all old caches via a prefix filter (`leaveflow-*`), and takes immediate control using `clients.claim()`.

---

## Future Roadmap

1. **Role-Based Access Control (RBAC):** Integrate Firebase Auth or a simple PIN system to securely lock down the Admin dashboard.
2. **Push Notifications:** Web Push API integration to notify admins of leave requests and remind users of quota resets.
3. **Custom Leave Types:** Expand "Leave" to support Sick, Casual, and Unpaid categories.
4. **Export to CSV/PDF:** Generate downloadable monthly reports directly from the Admin dashboard.
5. **Localization:** Multi-language support for diverse teams.

---

## Project Structure

```text
LeaveFlow/
├── index.html              # Employee PWA entry point
├── admin.html              # Admin Dashboard
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker (offline, cache invalidation)
├── build.js                # CI build script
├── serve.js                # Local dev server (Node.js)
├── .env                    # Local secrets (API URL)
│
├── backend/
│   └── Code.gs             # Google Apps Script logic
│
├── css/
│   ├── style.css           # Employee app styles
│   └── admin.css           # Admin dashboard styles
│
├── js/
│   ├── api.js              # Network client
│   ├── app.js              # Employee logic
│   └── admin.js            # Admin logic
│
├── icons/                  # PWA standard and maskable icons
└── .github/workflows/      # GitHub Actions CI/CD configuration
```

---

## License

MIT © [Irfan Habeeb](https://github.com/irfanhabeeb-002)

<div align="center">
Built for zero-friction team management.
</div>
