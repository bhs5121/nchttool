const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '..');
const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'], '/core.js': ['core.js', 'text/javascript; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
const port = Number(process.env.PORT || 8767);
http.createServer((req, res) => {
  const file = files[new URL(req.url, 'http://localhost').pathname];
  if (!file || req.method !== 'GET') { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(path.join(base, file[0])).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Local preview: http://127.0.0.1:${port}`));
