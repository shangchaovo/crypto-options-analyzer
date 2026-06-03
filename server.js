const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8766;
const DERIBIT_API = 'www.deribit.com';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let pathname = req.url.split('?')[0];
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.join(__dirname, pathname);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=3600',
    });
    res.end(data);
  });
}

function curlFetch(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn('curl', ['-s', '--max-time', '25', url]);
    let stdout = '', stderr = '';
    proc.stdout.on('data', chunk => stdout += chunk);
    proc.stderr.on('data', chunk => stderr += chunk);
    proc.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `curl exited ${code}`));
    });
    proc.on('error', reject);
  });
}

function proxyToDeribit(req, res, endpoint) {
  const query = req.url.split('?')[1] || '';
  const url = `https://${DERIBIT_API}/api/v2/public/${endpoint}${query ? '?' + query : ''}`;

  curlFetch(url).then(data => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  }).catch(err => {
    console.error('Proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });
}

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Proxy routes
  if (req.url.startsWith('/api/deribit/')) {
    const endpoint = req.url.replace('/api/deribit/', '').split('?')[0];
    proxyToDeribit(req, res, endpoint);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Crypto Options Analyzer server running at http://localhost:${PORT}`);
  console.log(`Deribit proxy: http://localhost:${PORT}/api/deribit/{endpoint}`);
});
