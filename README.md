# LeaveFlow — PWA Leave Tracker

**LeaveFlow** is a production-quality, mobile-first Progressive Web App (PWA) designed for effortless team leave tracking. Built specifically for organizations, it operates on a **"Present by Default"** model: employees are automatically marked present every working day and only interact with the app to record leaves.

---

## 🍃 Core Product Philosophy
* **Present by Default:** No daily clock-in or clock-out. If no leave is recorded for a weekday, the employee is present.
* **Effortless Recording:** Leaves are recorded in one click, instantly updating balance states.
* **Smart Bounds:** Weekends are automatically excluded from leave calculations and do not consume balance.
* **Strict Quota:** Each employee receives 4 leaves per month (unusable balance resets at the start of each month).
* **Directory Verification:** Employees cannot auto-register. Users can only log in if they are pre-registered by the administrator.

---

## 📁 Project Structure

```
attendance-tracker/
├── index.html           # Employee app PWA entry point
├── admin.html           # Admin Dashboard panel
├── manifest.json        # PWA configuration
├── sw.js                # PWA Service Worker (offline caching)
├── serve.py             # Zero-dependency Python server script
├── serve.js             # Zero-dependency Node.js server script
├── package.json         # Node project configuration
├── requirements.txt     # Python requirements documentation
├── .env                 # Local configuration secrets (gitignored)
├── .env.example         # Environment template
├── .gitignore           # Git ignore list
├── backend/
│   └── Code.gs          # Google Apps Script backend source code
├── css/
│   ├── style.css        # Employee app styling (Premium Glassmorphism)
│   └── admin.css        # Admin Dashboard styling
└── js/
    ├── api.js           # API request client
    ├── app.js           # Employee app logic
    ├── admin.js         # Admin Dashboard logic
    └── config.js        # Auto-generated runtime config (gitignored)
```

---

## 🚀 Setup & Installation

Follow these steps to deploy and run LeaveFlow:

### Step 1 — Create the Database (Google Sheet)
1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet named **"LeaveFlow"**.
2. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID_IS_HERE]/edit
   ```

### Step 2 — Deploy the Apps Script Backend
1. In your Google Sheet, select **Extensions** → **Apps Script**.
2. Clear any default code and paste the entire contents of [backend/Code.gs](backend/Code.gs).
3. Update `CONFIG.SPREADSHEET_ID` at the top of the file:
   ```javascript
   SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE', // Paste your copied ID here
   ```
4. Run the setup sequence:
   * Select `setupSheets` from the function list and click **Run** ▶ (This initializes the tables and text formats).
   * Select `createMonthlyResetTrigger` and click **Run** ▶ (This schedules automatic balance refreshes on the 1st of every month).
5. Deploy as a Web App:
   * Click **Deploy** → **New deployment**.
   * Select type: **Web app**.
   * Execute as: **Me** (your Google account).
   * Who has access: **Anyone**.
   * Click **Deploy**, approve permissions, and **copy the Web App URL**.

### Step 3 — Configure Environment Variables
1. Create a `.env` file in the project root (you can copy `.env.example`):
   ```bash
   cp .env.example .env
   ```
2. Paste your Web App URL into `.env`:
   ```env
   LEAVEFLOW_API_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
   ```

---

## 💻 Running Locally

You can serve the application locally using either **Node.js** or **Python 3**. Both scripts read your `.env` file, automatically generate `js/config.js` for the frontend, and boot up on port `3000`.

### Option A — Node.js (Recommended)
No `npm install` needed! Runs on built-in native modules:
```bash
npm start
```
Or run directly:
```bash
node serve.js
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Option B — Python 3
No pip installations needed! Uses Python's standard library:
```bash
python3 serve.py
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🛡 Security & Administration

### Adding Team Members
* **Admin-Only directory:** Employees cannot create accounts on the onboarding screen. They will be rejected unless they exist in the roster.
* **Adding Members:** The administrator must register team members first. This can be done by clicking **➕ Add Member** in the *Team Members* panel of the Admin Dashboard (`/admin.html`) or by appending their name directly to the `Employees` sheet in Google Sheets.

### Employee Authentication & Sessions
* On their first visit (online), employees enter their name. The app verifies their identity against the Google Sheets directory.
* Once logged in, their profile is cached in browser memory, enabling full offline operation.
* Employees can click the **Log Out** (`🚪`) button in the header to end their session. The app will warn them if they have unsynced offline leave records before clearing local memory.

### Offline & Queue Support
* If an employee records a leave while offline, the system safely caches it in a local database queue.
* The leave displays instantly on the home screen marked with a **"Syncing..."** label and a dashed style.
* The app automatically attempts to sync the queued records in the background when the connection is restored.

---

## 🌐 Production Deployment & CI/CD

LeaveFlow can be deployed to any static host. Because it is a PWA, **it must be served over HTTPS** for service worker caching and offline capabilities to function.

### PWA Automatic Background Updates (How it works)
When you push code updates:
1. Your CI/CD build script (`npm run build`) runs.
2. It generates `js/config.js` and injects a new unique timestamp into the `CACHE_NAME` constant at the top of `sw.js`.
3. When users open their installed PWA, the browser checks `sw.js` and detects a byte-difference (due to the new timestamp).
4. The browser installs the new version of the app in the background.
5. The employee view displays a clean notification: *"App updated — refresh for latest version"*, ensuring they always have the latest fixes.

---

### Option A — GitHub Pages (CI/CD Automated)
We have configured a fully automated CI/CD pipeline using **GitHub Actions**:
1. Push your code to your GitHub repository.
2. In your repository on GitHub, go to **Settings** → **Secrets and variables** → **Actions**.
3. Create a **New repository secret**:
   * Name: `LEAVEFLOW_API_URL`
   * Value: `https://script.google.com/macros/s/YOUR_API_ID/exec`
4. Go to **Settings** → **Pages** → **Build and deployment**:
   * Under *Source*, select **GitHub Actions**.
5. Push any change to the `main` branch. The action in [.github/workflows/deploy.yml](.github/workflows/deploy.yml) will trigger, run the build command to inject your secret, and publish the app!

---

### Option B — Netlify, Vercel, or Cloudflare Pages
You can easily link your repository to Netlify, Vercel, or Cloudflare Pages:
1. Create a new site from your Git repository.
2. Configure the **Build Settings**:
   * **Build command:** `npm run build`
   * **Publish directory:** `.` (or root directory)
3. Add the **Environment Variable** in the hosting dashboard:
   * **Key:** `LEAVEFLOW_API_URL`
   * **Value:** `https://script.google.com/macros/s/YOUR_API_ID/exec`
4. Deploy the site. Every future git push will trigger a rebuild and automatically update the PWA for all users!

