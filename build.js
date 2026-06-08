/**
 * LeaveFlow CI/CD Production Build Script
 * ============================================================
 * Reads LEAVEFLOW_API_URL from environment variables and
 * generates js/config.js. Also updates sw.js with a build
 * timestamp to force user devices to update the PWA cache.
 */

const fs = require('fs');
const path = require('path');

const ENV_API_URL = process.env.LEAVEFLOW_API_URL;
const CONFIG_FILE = path.join(__dirname, 'js', 'config.js');
const SW_FILE = path.join(__dirname, 'sw.js');

// 1. Generate js/config.js
let apiUrl = ENV_API_URL || '';
if (!apiUrl && fs.existsSync(path.join(__dirname, '.env'))) {
  // Fallback to local .env file if available
  const lines = fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const parts = trimmed.split('=');
      if (parts[0].trim() === 'LEAVEFLOW_API_URL') {
        apiUrl = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        break;
      }
    }
  }
}

const dir = path.dirname(CONFIG_FILE);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

fs.writeFileSync(CONFIG_FILE, `window.LEAVEFLOW_API_URL = "${apiUrl}";\n`);
console.log(`[BUILD] Generated js/config.js with API URL: ${apiUrl ? '(configured)' : '(empty)'}`);

// 2. Inject build timestamp into sw.js to trigger client browser PWA updates
if (fs.existsSync(SW_FILE)) {
  let content = fs.readFileSync(SW_FILE, 'utf8');
  const timestamp = Date.now();
  // Replace the CACHE_NAME value dynamically
  content = content.replace(/const CACHE_NAME = ['"][^'"]+['"];/, `const CACHE_NAME = 'leaveflow-v${timestamp}';`);
  fs.writeFileSync(SW_FILE, content);
  console.log(`[BUILD] Updated sw.js cache version to: leaveflow-v${timestamp}`);
} else {
  console.warn('[BUILD] sw.js not found, skipping version injection.');
}
