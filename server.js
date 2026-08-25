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

// Restore a session from the in-memory map, or rehydrate it from its disk snapshot.
// Makes /api/state, /api/answer, /api/report and resume survive a server restart.
function getOrLoadSession(id) {
  let state = sessions.get(id);
  if (!state) {
    state = assessment.loadSnapshot(id);
    if (state) sessions.set(id, state);
  }
  return state || null;
}

// Single canonical persistence path (replaces the old server-local snapshot()).
function persist(state) { assessment.snapshot(state); }

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
  // Stage 1 (ASRS screener) hands off to Stage 2 here with the LOCKED language.
  if (p === '/api/session' && (req.method === 'POST' || req.method === 'GET')) {
    const body = await readBody(req).catch(() => ({}));
    const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    // Language is set ONCE, at creation. createStage2Assessment locks it to en|fa; anything
    // else defaults to 'en'. There is no later path to change it server-side (locked after Stage 1).
    const state = assessment.createStage2Assessment(id, body.lang);
    sessions.set(id, state);
    const init = assessment.begin(state);   // mutates state.pending (first criterion)
    persist(state);                          // snapshot AFTER begin() so resume sees the in-flight question
    return sendJson(res, 200, { id, ...init });
  }

  // Reset: destructive. Deletes the in-memory session + on-disk snapshot.
  const mReset = p.match(/^\/api\/session\/reset$/);
  if (mReset && req.method === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    const id = body.id || url.searchParams.get('id');
    if (!id) return sendJson(res, 400, { error: 'missing id' });
    sessions.delete(id);
    assessment.clearSnapshot(id);
    return sendJson(res, 200, { reset: true, id });
  }

  const mAnswer = p.match(/^\/api\/answer\/([A-Za-z0-9_-]+)$/);
  if (mAnswer && req.method === 'POST') {
    const id = mAnswer[1];
    const state = getOrLoadSession(id);
    if (!state) return sendJson(res, 404, { error: 'session not found' });
    const body = await readBody(req).catch(e => ({ _error: e.message }));
    const answer = body.answer || '';
    // NOTE: state.lang is LOCKED at creation (Stage 1 onboarding). Any lang
    // field sent here is intentionally ignored — no competing language sources.
    const result = await assessment.processTurn(state, answer);
    persist(state);
    return sendJson(res, 200, result);
  }

  // Resume state for an existing session id. Language comes ONLY from the server
  // (state.lang), never from the client. Returns the reconstructed in-flight
  // question so the UI can restore exactly where it left off.
  const mState = p.match(/^\/api\/state\/([A-Za-z0-9_-]+)$/);
  if (mState && req.method === 'GET') {
    const id = mState[1];
    const state = getOrLoadSession(id);
    if (!state) return sendJson(res, 200, { id, error: 'session not found' });
    const question = (state.stage !== 'REPORT' && state.stage !== 'SCREENING')
      ? assessment.currentQuestion(state, state.lang)
      : null;
    return sendJson(res, 200, {
      id,
      lang: state.lang,
      screening: state.screening,
      stage: state.stage,
      pending: state.pending,
      completed: state.stage === 'REPORT',
      progress: getProgress(state),
      question: question || null,
      pendingKind: (state.pending && state.pending.kind) || null,
      pendingCid: (state.pending && state.pending.cid) || null,
    });
  }

  const mReport = p.match(/^\/api\/report\/([A-Za-z0-9_-]+)$/);
  if (mReport && req.method === 'GET') {
    const id = mReport[1];
    const state = getOrLoadSession(id);
    if (!state) return sendJson(res, 200, { id, error: 'session not found' });
    return sendJson(res, 200, { id, report: assessment.getReport(state) });
  }

  // Export session as a portable, versioned JSON blob (Save & continue later).
  const mExport = p.match(/^\/api\/export\/([A-Za-z0-9_-]+)$/);
  if (mExport && req.method === 'GET') {
    const id = mExport[1];
    const state = getOrLoadSession(id);
    if (!state) return sendJson(res, 200, { id, error: 'session not found' });
    const blob = assessment.exportSession(state);
    return sendJson(res, 200, blob);
  }

    // Import a previously exported session blob.
  // If a session with the same id already exists, the caller must explicitly confirm
  // overwrite via ?force=1 (the UI prompts before sending this).
  const mImport = p.match(/^\/api\/import$/);
  if (mImport && req.method === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    const force = url.searchParams.get('force') === '1';
    const result = assessment.importSession(body);
    if (result.error) {
      return sendJson(res, 400, { error: result.error });
    }
    const state = result.state;
    const existing = sessions.get(state.id);
    if (existing && !force) {
      return sendJson(res, 409, { error: 'session_exists', id: state.id });
    }
    sessions.set(state.id, state);
    persist(state);
    return sendJson(res, 200, { id: state.id, lang: state.lang, stage: state.stage, imported: true });
  }

  // Human-readable assessment export (plain text, suitable for printing/sharing).
  // Produces a Markdown-like text document from the full session state + report.
  // Does NOT expose: session IDs, localhost URLs, API keys, internal prompts, debug info.
  const mHumanExport = p.match(/^\/api\/export-human\/([A-Za-z0-9_-]+)$/);
  if (mHumanExport && req.method === 'GET') {
    const id = mHumanExport[1];
    const state = getOrLoadSession(id);
    if (!state) return sendJson(res, 200, { id, error: 'session not found' });
    const report = assessment.getReport(state);
    const text = assessment.exportHumanReadable(state, report);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="adhd-assessment-export.txt"',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(text);
    return;
  }

  // --- Health check (for Docker HEALTHCHECK / load balancer probes) ---
  if (p === '/health') {
    return sendJson(res, 200, { status: 'ok', uptime: process.uptime() });
  }

  // --- Static routes ---
  if (p === '/' || p === '/index.html') {
    return serveStatic(res, path.join(__dirname, 'index.html'));
  }
  if (p === '/stage2' || p === '/stage2.html') {
    return serveStatic(res, path.join(__dirname, 'stage2.html'));
  }
  if (p === '/design-tokens.css') {
    return serveStatic(res, path.join(__dirname, 'design-tokens.css'));
  }
  if (p === '/stage2-language.js') {
    return serveStatic(res, path.join(__dirname, 'stage2-language.js'));
  }
  if (p === '/favicon.ico') {
    const ico = '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%23006a61"/><path d="M8 8h16v2H8zM8 12h16v2H8zM8 16h10v2H8zM8 20h16v2H8zM8 24h10v2H8z" fill="%23ffffff"/></svg>';
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end(ico);
    return;
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
process.on('SIGINT', () => { console.log('\nShutting down (SIGINT).'); server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { console.log('\nShutting down (SIGTERM).'); server.close(() => process.exit(0)); });

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
