const { spawn } = require('child_process');
const net = require('net');

const LOCAL_PROXY = 'http://127.0.0.1:1082';
let localProxyPromise = null;

function detectProxy() {
  if (process.env.DERIBIT_PROXY === 'direct') return Promise.resolve(null);
  if (process.env.DERIBIT_PROXY) return Promise.resolve(process.env.DERIBIT_PROXY);
  if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) {
    return Promise.resolve(null);
  }
  if (localProxyPromise) return localProxyPromise;

  localProxyPromise = new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 1082 });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(null);
    }, 300);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(LOCAL_PROXY);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
  return localProxyPromise;
}

/**
 * Fetch a URL via curl subprocess.
 * Relies on curl being available and reading system proxy config (e.g. Surge/Clash).
 */
async function curlFetch(url, maxTimeSec = 25) {
  const proxy = await detectProxy();
  return new Promise((resolve, reject) => {
    const args = [
      '-fsS',
      '--compressed',
      '--retry', '2',
      '--retry-all-errors',
      '--retry-delay', '1',
      '--max-time', String(maxTimeSec),
    ];
    if (proxy) args.push('--proxy', proxy);
    args.push(url);

    const proc = spawn('curl', args);
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

module.exports = { curlFetch };
