#!/usr/bin/env node
/**
 * LeaveFlow Development Server (Node.js)
 * ============================================================
 * Reads configuration from .env, generates js/config.js,
 * and starts a static file server on http://localhost:3000.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = 3000;
const ENV_FILE = path.join(__dirname, '.env');
const CONFIG_FILE = path.join(__dirname, 'js', 'config.js');

function generateConfig() {
  let apiUrl = '';
  if (fs.existsSync(ENV_FILE)) {
    const lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
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
  console.log(`Generated js/config.js using LEAVEFLOW_API_URL from .env`);
}

// Generate config immediately
generateConfig();

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0]; // strip query strings
  let filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  const ext = path.extname(filePath).toLowerCase();
  
  // Prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404;
        res.end('Not Found');
      } else {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    } else {
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'text/plain',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Serving LeaveFlow locally at http://localhost:${PORT}`);
});
