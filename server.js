// Zero-dependency static server for local development: `node server.js`
// (ES modules don't load from file://, so the game needs to be served.)

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT) || 5173;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

// The gun editor saves guns into assets/guns/ (one JSON each + index.json).
const gunDir = path.join(root, 'assets', 'guns');
function gunIndex() {
  try { return JSON.parse(fs.readFileSync(path.join(gunDir, 'index.json'), 'utf8')); } catch { return []; }
}
function writeIndex(keys) {
  fs.writeFileSync(path.join(gunDir, 'index.json'), JSON.stringify([...new Set(keys)].sort(), null, 2));
}
function gunApi(req, res, key) {
  const reply = (code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (!/^[a-z0-9_-]{1,40}$/.test(key)) return reply(400, { error: 'bad key' });
  fs.mkdirSync(gunDir, { recursive: true });
  const file = path.join(gunDir, key + '.json');
  if (req.method === 'DELETE') {
    try { fs.unlinkSync(file); } catch {}
    writeIndex(gunIndex().filter((k) => k !== key));
    return reply(200, { ok: true });
  }
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  let body = '';
  req.on('data', (d) => {
    body += d;
    if (body.length > 2e6) req.destroy();
  });
  req.on('end', () => {
    try {
      const gun = JSON.parse(body);
      if (gun.key !== key || !gun.art?.parts) return reply(400, { error: 'bad gun' });
      fs.writeFileSync(file, JSON.stringify(gun, null, 1));
      writeIndex([...gunIndex(), key]);
      reply(200, { ok: true });
    } catch (e) {
      reply(400, { error: String(e.message) });
    }
  });
}

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (p.startsWith('/api/guns/')) return gunApi(req, res, p.slice('/api/guns/'.length));
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}).listen(port, () => console.log(`ProjectZ running at http://localhost:${port}`));
