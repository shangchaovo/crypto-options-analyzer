const http = require('http');
const fs = require('fs');
const path = require('path');
const { curlFetch } = require('./lib/curl-fetch');

const DEFAULT_PORT = Number(process.env.PORT || 8766);
const HOST = process.env.HOST || '127.0.0.1';
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
      'Cache-Control': ['.html', '.css', '.js', '.json'].includes(ext) ? 'no-cache' : 'max-age=3600',
    });
    res.end(data);
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

let activePort = DEFAULT_PORT;

server.on('listening', () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : activePort;
  console.log(`Crypto Options Analyzer server running at http://localhost:${port}`);
  console.log(`Deribit proxy: http://localhost:${port}/api/deribit/{endpoint}`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE' && !process.env.PORT && activePort === DEFAULT_PORT) {
    activePort = DEFAULT_PORT + 1;
    console.warn(`Port ${DEFAULT_PORT} is in use, trying ${activePort}...`);
    server.listen(activePort, HOST);
    return;
  }
  throw err;
});

server.listen(activePort, HOST);
