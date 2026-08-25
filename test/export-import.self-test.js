'use strict';
// Tests session export/import (machine-readable) + human-readable export.
// Covers: export/import round-trip, resume at exact point, malformed rejection,
// EN/FA, report content checks, no-leak checks.
// Uses injected FAKE extractors — no real LLM calls.

const http = require('http');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const extractorPath = require.resolve(path.join(ROOT, 'interviewer/interviewer.js'));

const assessment = require(path.join(ROOT, 'model/assessment'));
const engine = require(path.join(ROOT, 'model/engine'));

function setFake(fn) {
  delete require.cache[extractorPath];
  require(extractorPath);
  require.cache[extractorPath].exports = { extractEvidence: fn };
}

function setupFullExtractor(config) {
  setFake(async function (args) {
    const { stage, probe, criterion } = args;
    if (stage === 'childhood') return { memories: config.childhoodMemories || [], uncertainty: null };
    if (stage === 'impairment') {
      if (probe.id === 'domains') return config.impairment.domains;
      if (probe.id === 'settings') return config.impairment.settings;
      return { domains_impaired: [], settings: [], uncertainty: null };
    }
    if (stage === 'differential') {
      const r = config.factors[probe.id] || { reported: false };
      return { reported: !!r.reported, uncertainty: r.uncertainty || null, symptom_mentions: r.symptom_mentions || [] };
    }
    return { core_answer: config.stage2Core || 'Often', example: 'concrete example for ' + criterion.id, contexts: ['work', 'home'], consequence: 'costs focus/deadlines', counter_evidence: [], uncertainty: null };
  });
}

const FULL_CONFIG = {
  stage2Core: 'Often',
  childhoodMemories: [
    { behavior: 'teacher noted I could not sit still', age: 7, source: 'teacher', concrete: true, against: false, vague: false },
    { behavior: 'frequently lost homework', age: 8, source: 'memory', concrete: true, against: false, vague: false },
  ],
  impairment: {
    domains: { domains_impaired: [{ domain: 'Work', example: 'missed deadlines', concrete: true }], settings: [], uncertainty: null },
    settings: { domains_impaired: [], settings: [{ setting: 'work', example: 'office deadlines', concrete: true }, { setting: 'home', example: 'dinner table', concrete: true }], uncertainty: null },
  },
  factors: { sleep: { reported: true }, anxiety: { reported: true } },
};

function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1', port, method, path: urlPath,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } : {},
    };
    const req = http.request(opts, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(raw), rawText: raw }); } catch (e) { resolve({ status: res.statusCode, body: raw, rawText: raw }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

let failures = 0;
const pass = (label, ok, extra) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${extra ? ' | ' + extra : ''}`);
};

async function driveToCompletion(port, id) {
  for (let t = 0; t < 800; t++) {
    const r = await request(port, 'POST', '/api/answer/' + id, { answer: 'Often, for example when I...' });
    if (r.body.completed) return r.body;
  }
  return null;
}

(async () => {
  setupFullExtractor(FULL_CONFIG);

  // =====================================================================
  // PART A — model layer: export/import functions
  // =====================================================================

  // A1: exportSession produces a versioned blob with the session data.
  const stateA = assessment.createStage2Assessment('export-A1', 'en');
  stateA.screening = 'positive';
  assessment.begin(stateA);
  const blobA = assessment.exportSession(stateA);
  pass('exportSession: has version field', blobA.version === assessment.EXPORT_FORMAT_VERSION, `version=${blobA.version}`);
  pass('exportSession: has exported_at', typeof blobA.exported_at === 'string' && blobA.exported_at.length > 0);
  pass('exportSession: session contains id', blobA.session.id === 'export-A1');
  pass('exportSession: session contains lang', blobA.session.lang === 'en');
  pass('exportSession: session contains stage', blobA.session.stage === 'ADULT_SYMPTOMS');
  pass('exportSession: session contains pending', blobA.session.pending !== null);
  // No secrets in export
  const blobStr = JSON.stringify(blobA);
  pass('exportSession: no API keys leaked', !blobStr.includes('api_key') && !blobStr.includes('apiKey') && !blobStr.includes('sk-'));
  pass('exportSession: no localhost URLs leaked', !blobStr.includes('localhost') && !blobStr.includes('127.0.0.1'));
  pass('exportSession: no internal prompts leaked', !blobStr.includes('You are a helpful') && !blobStr.includes('extractEvidence'));

  // A2: importSession round-trip preserves all state.
  const importedA = assessment.importSession(blobA);
  pass('importSession: success on valid blob', !importedA.error, `error=${importedA.error}`);
  pass('importSession: preserves id', importedA.state.id === 'export-A1');
  pass('importSession: preserves lang', importedA.state.lang === 'en');
  pass('importSession: preserves stage', importedA.state.stage === 'ADULT_SYMPTOMS');
  pass('importSession: preserves pending', JSON.stringify(importedA.state.pending) === JSON.stringify(stateA.pending));
  pass('importSession: preserves screening', importedA.state.screening === 'positive');

  // A3: importSession rejects malformed input.
  const bad1 = assessment.importSession(null);
  pass('importSession: rejects null', bad1.error === 'invalid_format', `error=${bad1.error}`);
  const bad2 = assessment.importSession({});
  pass('importSession: rejects missing version', bad2.error === 'version_mismatch', `error=${bad2.error}`);
  const bad3 = assessment.importSession({ version: 999, session: { lang: 'en', id: 'x' } });
  pass('importSession: rejects unknown version', bad3.error === 'version_mismatch', `error=${bad3.error}`);
  const bad4 = assessment.importSession({ version: 1, session: { lang: 'de', id: 'x' } });
  pass('importSession: rejects unsupported lang', bad4.error === 'lang_not_supported', `error=${bad4.error}`);
  const bad5 = assessment.importSession({ version: 1, session: { lang: 'en', id: null } });
  pass('importSession: rejects null id', bad5.error === 'invalid_format', `error=${bad5.error}`);
  const bad6 = assessment.importSession({ version: 1, session: null });
  pass('importSession: rejects null session', bad6.error === 'invalid_format', `error=${bad6.error}`);

  // A4: importSession at exact resume point — reconstruct currentQuestion.
  const stateA4 = assessment.createStage2Assessment('export-A4', 'fa');
  stateA4.screening = 'positive';
  assessment.begin(stateA4);
  // Drive a few turns to get to a non-trivial point
  for (let t = 0; t < 10; t++) {
    await assessment.processTurn(stateA4, 'اغلب، به عنوان مثال وقتی که...');
  }
  const blobA4 = assessment.exportSession(stateA4);
  const importedA4 = assessment.importSession(blobA4);
  pass('importSession: lang=fa preserved', importedA4.state.lang === 'fa');
  const qLive = assessment.currentQuestion(stateA4, stateA4.lang);
  const qImported = assessment.currentQuestion(importedA4.state, importedA4.state.lang);
  pass('importSession: currentQuestion matches live at resume point', qImported === qLive, `match=${qImported === qLive}`);
  pass('importSession: currentQuestion non-empty at resume point', typeof qImported === 'string' && qImported.length > 0);

  // A5: human-readable export includes questions, answers, report, no secrets.
  for (const lang of ['en', 'fa']) {
    const state = assessment.createStage2Assessment('export-A5-' + lang, lang);
    state.screening = 'positive';
    assessment.begin(state);
    let done = false;
    for (let t = 0; t < 800 && !done; t++) {
      const r = await assessment.processTurn(state, lang === 'en' ? 'Often, for example when I...' : 'اغلب، به عنوان مثال وقتی که...');
      if (r.completed) done = true;
    }
    const report = assessment.getReport(state);
    const text = assessment.exportHumanReadable(state, report);
    pass(`[${lang}] human-readable: non-empty`, text.length > 200);
    pass(`[${lang}] human-readable: includes disclaimer`, text.includes('not a medical diagnosis') || text.includes('تشخیص نمی‌دهد') || text.includes('تشخیص پزشکی نیست'));
    pass(`[${lang}] human-readable: includes language`, text.includes(lang === 'fa' ? 'فارسی' : 'English'));
    pass(`[${lang}] human-readable: includes DSM-5 header`, text.includes('DSM-5'));
    pass(`[${lang}] human-readable: includes stages`, text.includes('Stage 1') || text.includes('مرحله'));
    pass(`[${lang}] human-readable: no session id leaked`, !text.includes('export-A5-' + lang));
    pass(`[${lang}] human-readable: no localhost`, !text.includes('localhost') && !text.includes('127.0.0.1'));
    pass(`[${lang}] human-readable: no api_key`, !text.includes('api_key') && !text.includes('apiKey') && !text.includes('sk-'));
    // Cleanup
    assessment.clearSnapshot('export-A5-' + lang);
  }

  // =====================================================================
  // PART B — HTTP layer: export/import endpoints
  // =====================================================================
  const TEST_PORT = 3113;
  process.env.PORT = String(TEST_PORT);
  delete require.cache[require.resolve(path.join(ROOT, 'server'))];
  const server = require(path.join(ROOT, 'server'));
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));

  try {
    // B1: create a session, drive it partway, export, import into a new session, verify resume.
    const sess = await request(TEST_PORT, 'POST', '/api/session', { lang: 'en' });
    pass('HTTP B1: session created', sess.status === 200 && sess.body.id, `status=${sess.status}`);
    const sid = sess.body.id;

    // Drive a few turns
    for (let t = 0; t < 5; t++) {
      await request(TEST_PORT, 'POST', '/api/answer/' + sid, { answer: 'Often, for example when I...' });
    }

    // Export the session
    const exp = await request(TEST_PORT, 'GET', '/api/export/' + sid);
    pass('HTTP B1: /api/export returns 200', exp.status === 200, `status=${exp.status}`);
    pass('HTTP B1: export has version', exp.body.version === assessment.EXPORT_FORMAT_VERSION, `version=${exp.body.version}`);
    pass('HTTP B1: export has session', !!exp.body.session, `hasSession=${!!exp.body.session}`);
    pass('HTTP B1: export session lang=en', exp.body.session.lang === 'en');
    pass('HTTP B1: export has pending', !!exp.body.session.pending);

    // --- Import confirmation-first flow ---
    // B1a: Import into a NEW session id — should work without force (no conflict).
    const importedId = 'imp-' + Math.random().toString(36).slice(2, 8);
    const impBlob = JSON.parse(JSON.stringify(exp.body.session));
    impBlob.id = importedId;
    const impWrapped = { version: assessment.EXPORT_FORMAT_VERSION, exported_at: new Date().toISOString(), session: impBlob };
    const impNoForce = await request(TEST_PORT, 'POST', '/api/import', impWrapped);
    pass('HTTP B1a: /api/import without force on new id -> 200', impNoForce.status === 200, `status=${impNoForce.status}`);
    pass('HTTP B1a: import restored id (no force)', impNoForce.body.id === importedId);
    pass('HTTP B1a: import restored lang (no force)', impNoForce.body.lang === 'en');
    pass('HTTP B1a: import restored stage (no force)', impNoForce.body.stage === exp.body.session.stage);

    // B1b: Import with CONFLICTING id (same as original session) without force -> should get 409.
    const conflictBlob = { version: assessment.EXPORT_FORMAT_VERSION, exported_at: new Date().toISOString(), session: JSON.parse(JSON.stringify(exp.body.session)) };
    const impConflict = await request(TEST_PORT, 'POST', '/api/import', conflictBlob);
    pass('HTTP B1b: /api/import without force on existing id -> 409', impConflict.status === 409, `status=${impConflict.status}`);
    pass('HTTP B1b: 409 error = session_exists', impConflict.body.error === 'session_exists', `error=${impConflict.body.error}`);

    // B1c: With force=1 -> should succeed and replace the existing session.
    const impForce = await request(TEST_PORT, 'POST', '/api/import?force=1', conflictBlob);
    pass('HTTP B1c: /api/import with force=1 on existing id -> 200', impForce.status === 200, `status=${impForce.status}`);
    pass('HTTP B1c: import with force restored id', impForce.body.id === exp.body.session.id);
    pass('HTTP B1c: import with force restored lang', impForce.body.lang === 'en');
    pass('HTTP B1c: import with force restored stage', impForce.body.stage === exp.body.session.stage);

    // B1d: Verify the existing session was overwritten (pending should match the imported blob).
    const stAfter = await request(TEST_PORT, 'GET', '/api/state/' + sid);
    pass('HTTP B1d: existing session pending matches imported blob', JSON.stringify(stAfter.body.pending) === JSON.stringify(conflictBlob.session.pending), `match=${JSON.stringify(stAfter.body.pending) === JSON.stringify(conflictBlob.session.pending)}`);

    // Cleanup
    assessment.clearSnapshot(sid);
    assessment.clearSnapshot(importedId);

    // Verify the imported session has the same pending (resume point)
    const stImp = await request(TEST_PORT, 'GET', '/api/state/' + importedId);
    pass('HTTP B1: imported state pending matches export', JSON.stringify(stImp.body.pending) === JSON.stringify(exp.body.session.pending), `pending=${JSON.stringify(stImp.body.pending).slice(0, 50)}`);
    pass('HTTP B1: imported state has question', !!stImp.body.question, `hasQ=${!!stImp.body.question}`);

    // B2: import rejects malformed blob.
    const badImport = await request(TEST_PORT, 'POST', '/api/import?force=1', { version: 1, session: { lang: 'de', id: 'x' } });
    pass('HTTP B2: import rejects unsupported lang', badImport.status === 400 && badImport.body.error === 'lang_not_supported', `status=${badImport.status} error=${badImport.body.error}`);

    const badImport2 = await request(TEST_PORT, 'POST', '/api/import?force=1', { version: 99, session: { lang: 'en', id: 'x' } });
    pass('HTTP B2: import rejects unknown version', badImport2.status === 400 && badImport2.body.error === 'version_mismatch', `status=${badImport2.status} error=${badImport2.body.error}`);

    const badImport3 = await request(TEST_PORT, 'POST', '/api/import?force=1', null);
    pass('HTTP B2: import rejects null body', badImport3.status === 400, `status=${badImport3.status}`);

    // B3: human-readable export endpoint.
    const humanExp = await request(TEST_PORT, 'GET', '/api/export-human/' + sid, null);
    const text = humanExp.rawText || '';
    // Need to fetch the text body — the request helper parses JSON, so use a raw fetch.
    pass('HTTP B3: /api/export-human returns 200', humanExp.status === 200, `status=${humanExp.status}`);

    // Re-fetch as text (since request() tries JSON parse).
    const rawRes = await new Promise((resolve, reject) => {
      const opts = { hostname: '127.0.0.1', port: TEST_PORT, method: 'GET', path: '/api/export-human/' + sid };
      const rq = http.request(opts, (res) => {
        let chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString()));
      });
      rq.on('error', reject);
      rq.end();
    });
    pass('HTTP B3: human-readable has disclaimer', rawRes.includes('not a medical diagnosis') || rawRes.includes('تشخیص پزشکی نیست'));
    pass('HTTP B3: human-readable has DSM-5', rawRes.includes('DSM-5'));
    pass('HTTP B3: human-readable no session id leaked', !rawRes.includes('imp-') && !rawRes.includes('rc-'));

     // B4: 404 on unknown session for all export endpoints.
    const exp404 = await request(TEST_PORT, 'GET', '/api/export/nonexistent');
    pass('HTTP B4: /api/export on unknown id -> error', exp404.body.error === 'session not found', `error=${exp404.body.error}`);

    // B5: FA session export/import confirmation-first flow (EN + FA).
    const sessFa = await request(TEST_PORT, 'POST', '/api/session', { lang: 'fa' });
    pass('HTTP B5: FA session created', sessFa.status === 200 && sessFa.body.id, `status=${sessFa.status}`);
    const expFa = await request(TEST_PORT, 'GET', '/api/export/' + sessFa.body.id);
    pass('HTTP B5: FA export has lang=fa', expFa.body.session.lang === 'fa', `lang=${expFa.body.session.lang}`);

    // Conflict import without force -> 409
    const conflictFa = { version: expFa.body.version, exported_at: expFa.body.exported_at, session: JSON.parse(JSON.stringify(expFa.body.session)) };
    const impConflictFa = await request(TEST_PORT, 'POST', '/api/import', conflictFa);
    pass('HTTP B5: FA /api/import without force on existing id -> 409', impConflictFa.status === 409, `status=${impConflictFa.status}`);

    // Force import -> 200, lang preserved as fa
    const impForceFa = await request(TEST_PORT, 'POST', '/api/import?force=1', conflictFa);
    pass('HTTP B5: FA /api/import with force -> 200', impForceFa.status === 200, `status=${impForceFa.status}`);
    pass('HTTP B5: FA import preserves lang=fa', impForceFa.body.lang === 'fa', `lang=${impForceFa.body.lang}`);
    assessment.clearSnapshot(sessFa.body.id);

    // Cleanup
    assessment.clearSnapshot(sid);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
