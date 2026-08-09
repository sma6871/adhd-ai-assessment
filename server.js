'use strict';

// Minimal API + static server for the ADHD Structured Assessment Companion.
// Stage 1 (V1 ASRS screener) is served as the existing static index.html.
// Stage 2 (Adult ADHD Symptoms interview) is driven by this API + stage2.html.
// Sessions are held in memory and snapshotted to data/<id>.json (one JSON doc per assessment).

const http = require('http');
const fs = require('fs');
const path = require('path');
const assessment = require('./model/assessment');
const { getProgress } = assessment;

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const sessions = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (!buf.length) return resolve({});
      const type = req.headers['content-type'] || '';
      if (type.includes('application/json')) {
        try { resolve(JSON.parse(buf.toString())); } catch (e) { reject(e); }
      } else {
        try { resolve(JSON.parse(buf.toString())); } catch (e) { resolve({}); }
      }
    });
    req.on('error', reject);
  });
}

function snapshot(state) {
  try {
    fs.writeFileSync(path.join(DATA_DIR, `${state.id}.json`), JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('snapshot failed:', e.message);
  }
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  // --- API routes ---
  if (p === '/api/session' && (req.method === 'POST' || req.method === 'GET')) {
    const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const state = assessment.createStage2Assessment(id);
    sessions.set(id, state);
    snapshot(state);
    const init = assessment.begin(state);
    return sendJson(res, 200, { id, ...init });
  }

  const mAnswer = p.match(/^\/api\/answer\/([A-Za-z0-9_-]+)$/);
  if (mAnswer && req.method === 'POST') {
    const id = mAnswer[1];
    const state = sessions.get(id);
    if (!state) return sendJson(res, 404, { error: 'session not found' });
    const body = await readBody(req).catch(e => ({ _error: e.message }));
    const answer = body.answer || '';
    const result = await assessment.processTurn(state, answer);
    snapshot(state);
    return sendJson(res, 200, result);
  }

  const mState = p.match(/^\/api\/state\/([A-Za-z0-9_-]+)$/);
  if (mState && req.method === 'GET') {
    const id = mState[1];
    const state = sessions.get(id);
    if (!state) return sendJson(res, 404, { error: 'session not found' });
    return sendJson(res, 200, { id, progress: getProgress(state), stage: state.stage, pending: state.pending });
  }

  const mReport = p.match(/^\/api\/report\/([A-Za-z0-9_-]+)$/);
  if (mReport && req.method === 'GET') {
    const id = mReport[1];
    const state = sessions.get(id);
    if (!state) return sendJson(res, 404, { error: 'session not found' });
    return sendJson(res, 200, { id, report: assessment.getReport(state) });
  }

  // --- Static routes ---
  if (p === '/' || p === '/index.html') {
    return serveStatic(res, path.join(__dirname, 'index.html'));
  }
  if (p === '/stage2') {
    return serveStatic(res, path.join(__dirname, 'stage2.html'));
  }
  if (p === '/stage2.html') {
    return serveStatic(res, path.join(__dirname, 'stage2.html'));
  }

  // Deny sensitive paths
  if (p.includes('/.git/') || p === '/.git' || p.endsWith('.zip')) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

const signal = process.listeners('SIGINT').length === 0 ? () => {} : null;
process.on('SIGINT', () => { console.log('\nShutting down.'); process.exit(0); });

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`ADHD Assessment server listening on http://localhost:${PORT}`);
    console.log('  Stage 1 (V1 ASRS): http://localhost:' + PORT + '/');
    console.log('  Stage 2 (interview): http://localhost:' + PORT + '/stage2');
    if (!process.env.GROQ_API_KEY) {
      console.warn('  WARN: GROQ_API_KEY not set — Stage 2 extraction will fail until set.');
    }
  });
} else {
  module.exports = server;
}
module.exports._assessment = assessment;
module.exports._MIME = MIME;
module.exports._serveStatic = serveStatic;
module.exports._sendJson = sendJson;
