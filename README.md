<div align="center">

<img src="icons/icon-192.png" alt="LeaveFlow Logo" width="96" height="96"/>

# LeaveFlow

**Mobile-first PWA leave tracker for small teams**

[![Deploy to GitHub Pages](https://github.com/irfanhabeeb-002/LeaveFlow/actions/workflows/deploy.yml/badge.svg)](https://github.com/irfanhabeeb-002/LeaveFlow/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/irfanhabeeb-002/LeaveFlow/pulls)

[🌐 Live Demo](https://irfanhabeeb-002.github.io/LeaveFlow/) · [🔧 Admin Panel](https://irfanhabeeb-002.github.io/LeaveFlow/admin.html) · [📐 Architecture](ARCHITECTURE.md)

</div>

---

## What is LeaveFlow?

LeaveFlow is a **zero-friction, installable PWA** for tracking employee leaves across a small team. It runs entirely on **Google Sheets as a database** with a **Google Apps Script** serverless backend — no monthly server costs, no complex infrastructure.

The core idea is **"Present by Default"**: employees are assumed present every working day. They only open the app when they want to record a leave. Admins get a real-time dashboard with attendance summaries, leave history, and team status — all updated live from the same Google Sheet.

---

## ✨ Features

### Employee App (`/`)
| Feature | Description |
|---|---|
| 🔐 Directory verification | Only admin-registered employees can log in — no self-signup |
| 📅 One-tap leave recording | Select a date, confirm — done in under 3 seconds |
| 📊 Live balance ring | Visual circular indicator showing leaves remaining vs used |
| 🗓 Monthly quota tracking | 4 leaves/month, auto-resets on the 1st via scheduled trigger |
| 📶 Offline support | Leaves queued locally and synced automatically when back online |
| ✅ Duplicate prevention | Client + server both block submitting leave for the same date twice |
| 📱 Installable PWA | Add to home screen on Android/iOS — works like a native app |
| 🔄 Auto-update | Service worker detects new versions and notifies users silently |
| 🚪 Session logout | Clears all local state; fresh server fetch on next login |

### Admin Dashboard (`/admin.html`)
| Feature | Description |
|---|---|
| 👥 Team Members panel | All employees with leave usage bars and remaining balance |
| 📋 Leave History | Full filterable log of all leaves by employee and month |
| 📅 Attendance Summary | Working days, present count, leave count, and % per employee |
| 🔔 Over-quota alerts | Highlights employees who have exceeded their monthly quota |
| 🗃 Month navigation | Browse previous months to audit history |
| ➕ Add Member | Register new employees directly from the dashboard |
| 🔁 Refresh button | Force-pulls latest data from the Google Sheet live |

---

## 🏗 Architecture Overview

> See the full detailed breakdown → **[ARCHITECTURE.md](ARCHITECTURE.md)**

```
Browser (PWA)
│
├── index.html  →  Employee App (app.js)
│                   └─ reads/writes via api.js
├── admin.html  →  Admin Dashboard (admin.js)
│                   └─ reads via api.js
│
└── api.js  ──────────────────────────────────────────────────►  Google Apps Script Web App
                      (HTTPS GET requests, cache: no-store)          │
                                                                      └─►  Google Sheet
                                                                             ├── Employees
                                                                             ├── LeaveRecords
                                                                             └── Attendance
```

---

## 📁 Project Structure

```
LeaveFlow/
├── index.html              # Employee PWA entry point
├── admin.html              # Admin Dashboard
├── manifest.json           # PWA manifest (name, icons, theme)
├── sw.js                   # Service Worker (offline caching + auto-update)
├── build.js                # CI build script — injects API URL into config.js
├── serve.js                # Local dev server (Node.js, zero dependencies)
├── serve.py                # Local dev server (Python 3, zero dependencies)
├── package.json            # npm scripts
├── requirements.txt        # Python environment documentation
├── .env                    # Local secrets — gitignored
├── .env.example            # Template for .env
├── .gitignore
│
├── backend/
│   └── Code.gs             # Google Apps Script — all server-side logic
│
├── css/
│   ├── style.css           # Employee app styles (glassmorphism, dark mode)
│   └── admin.css           # Admin dashboard styles
│
├── js/
│   ├── config.js           # Auto-generated at build time — holds API URL
│   ├── api.js              # HTTP client for Apps Script backend
│   ├── app.js              # Employee app logic & state
│   └── admin.js            # Admin dashboard logic & rendering
│
├── icons/                  # PWA icons (192×192, 512×512, maskable)
│
└── .github/
    └── workflows/
        └── deploy.yml      # GitHub Actions CI/CD → GitHub Pages
```

---

## 🚀 Setup & Deployment

### Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a blank spreadsheet.
2. Name it **LeaveFlow** (optional, for clarity).
3. Copy the **Spreadsheet ID** from the URL bar:
   ```
   https://docs.google.com/spreadsheets/d/▶SPREADSHEET_ID◀/edit
   ```

---

### Step 2 — Deploy the Apps Script Backend

1. In your Google Sheet: **Extensions → Apps Script**
2. Delete the default code. Paste the full contents of [`backend/Code.gs`](backend/Code.gs).
3. Set your Spreadsheet ID at the top:
   ```js
   SPREADSHEET_ID: 'PASTE_YOUR_SPREADSHEET_ID_HERE',
   ```
4. Run one-time setup functions:
   - Select **`setupSheets`** from the dropdown → click ▶ Run  
     *(Creates the Employees, LeaveRecords, and Attendance sheets with proper formats)*
   - Select **`createMonthlyResetTrigger`** → click ▶ Run  
     *(Schedules auto-reset of leave balances on the 1st of every month)*
5. Deploy as a Web App:
   - **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** → grant permissions → **copy the Web App URL**

> ⚠️ Every time you update `Code.gs`, click **Deploy → Manage deployments → ✏ Edit → New version → Deploy** to apply changes.

---

### Step 3 — Add Team Members

Before employees can log in, they must be registered by the admin:

- Open the **Admin Dashboard** (`/admin.html`)
- Click **➕ Add Member** in the Team Members panel
- Enter the employee's full name and save

Alternatively, manually add their name to the **Employees** sheet in Google Sheets.

---

### Step 4 — Run Locally

Clone the repo and create your `.env`:

```bash
git clone https://github.com/irfanhabeeb-002/LeaveFlow.git
cd LeaveFlow
cp .env.example .env
```

Edit `.env`:
```env
LEAVEFLOW_API_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

Then start the dev server:

```bash
# Node.js (recommended — no npm install needed)
npm start

# OR Python 3
python3 serve.py
```

Open [http://localhost:3000](http://localhost:3000)

The local server automatically reads `.env`, generates `js/config.js` with the API URL injected, and serves the app.

---

## 🌐 Production Deployment

LeaveFlow must be served over **HTTPS** for the Service Worker (offline mode, PWA install) to work.

### Option A — GitHub Pages (Recommended, Automated)

1. Push your repo to GitHub.
2. Go to **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `LEAVEFLOW_API_URL`
   - Value: your GAS Web App URL
3. Go to **Settings → Pages → Source → GitHub Actions**
4. Push to `main` — the CI/CD pipeline deploys automatically.

Every push triggers the workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) which:
- Injects `LEAVEFLOW_API_URL` into `js/config.js`
- Stamps a new cache version in `sw.js` (forces PWA update for users)
- Publishes to GitHub Pages

---

### Option B — Netlify / Vercel / Cloudflare Pages

1. Connect your GitHub repo to the platform.
2. Set build settings:
   - **Build command:** `npm run build`
   - **Publish directory:** `.` (root)
3. Add environment variable:
   - Key: `LEAVEFLOW_API_URL`  
   - Value: your GAS Web App URL
4. Deploy — every future push auto-deploys and the PWA updates silently for users.

---

## 🔄 PWA Auto-Update Flow

When you push code changes:

```
git push main
    │
    ▼
GitHub Actions runs build.js
    │  ├─ Writes js/config.js  (API URL)
    │  └─ Stamps new CACHE_NAME in sw.js  (e.g. leaveflow-v1717852800)
    │
    ▼
GitHub Pages publishes updated files
    │
    ▼
User opens installed PWA
    │  Browser compares sw.js byte-by-byte — detects new CACHE_NAME
    │  Installs new service worker in background
    │
    ▼
Toast appears: "App updated — refresh for latest version"
```

---

## 🛡 Security Notes

- **No self-registration:** Employees can only log in if their name exists in the `Employees` sheet. Unknown names are rejected.
- **Admin-only writes:** Only the Admin panel can add new employees (`registerEmployee` action).
- **No passwords:** Authentication is name-based — suitable for trusted internal teams. For sensitive environments, layer Firebase Auth on top.
- **CORS & GAS:** The Apps Script endpoint is public (`Anyone` access) but all write operations are scoped to the connected Google Sheet owned by your account.
- **Local data:** Employee sessions and leave history are cached in `localStorage`. Logging out fully clears this cache.

---

## 🧑‍💻 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (ES2020+) |
| Styling | Custom CSS — glassmorphism, CSS variables, dark mode |
| PWA | Web App Manifest + Service Worker |
| Backend | Google Apps Script (serverless, free tier) |
| Database | Google Sheets (3 tables: Employees, LeaveRecords, Attendance) |
| Hosting | GitHub Pages (static) |
| CI/CD | GitHub Actions |
| Dev server | Node.js / Python 3 (zero dependencies) |

---

## 📄 License

MIT © [Irfan Habeeb](https://github.com/irfanhabeeb-002)
