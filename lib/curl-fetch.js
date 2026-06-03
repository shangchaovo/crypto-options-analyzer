const { spawn } = require('child_process');

/**
 * Fetch a URL via curl subprocess.
 * Relies on curl being available and reading system proxy config (e.g. Surge/Clash).
 */
function curlFetch(url, maxTimeSec = 25) {
  return new Promise((resolve, reject) => {
    const proc = spawn('curl', ['-s', '--max-time', String(maxTimeSec), url]);
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
