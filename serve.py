#!/usr/bin/env python3
"""
LeaveFlow Development Server (Python)
============================================================
Reads configuration from .env, generates js/config.js,
and starts a static file server on http://localhost:3000.
"""

import os
import http.server
import socketserver

PORT = 3000
ENV_FILE = ".env"
CONFIG_FILE = "js/config.js"

def generate_config():
    api_url = ""
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    if key.strip() == "LEAVEFLOW_API_URL":
                        # Strip any wrapping quotes
                        api_url = value.strip().strip("'").strip('"')
                        break
    
    # Ensure directories exist
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    
    # Write client side config
    with open(CONFIG_FILE, "w") as f:
        f.write(f'window.LEAVEFLOW_API_URL = "{api_url}";\n')
    print(f"Generated {CONFIG_FILE} using LEAVEFLOW_API_URL from .env")

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable cache for local development testing
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        super().end_headers()

if __name__ == "__main__":
    generate_config()
    handler = Handler
    
    # Enable reuse of local port
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"Serving LeaveFlow locally at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
