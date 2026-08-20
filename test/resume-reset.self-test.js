'use strict';
// Tests the language-lock + resume/reset state architecture (no clinical-logic changes).
// Covers: schema lang, disk snapshot/load/clear, currentQuestion reconstruction across
// all stages (EN + FA), HTTP lang-lock on /api/answer, reset endpoint, completed
// report path, and server-restart resume (snapshot reload into a fresh process).
// Uses injected FAKE extractors — no real LLM calls.

const http = require('http');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const extractorPath = require.resolve(path.join(ROOT, 'interviewer/interviewer.js'));
const fs = require('fs');

function setFake(fn) {
  delete require.cache[extractorPath];
  require(extractorPath);
  require.cache[extractorPath].exports = { extractEvidence: fn };
}

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
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); } catch (e) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

const assessment = require(path.join(ROOT, 'model/assessment'));
const engine = require(path.join(ROOT, 'model/engine'));

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
    domains: { domains_impaired: [{ domain: 'Work', example: 'missed deadlines', concrete: true }, { domain: 'Relationships', example: 'forgot anniversary', concrete: true }], settings: [], uncertainty: null },
    settings: { domains_impaired: [], settings: [{ setting: 'work', example: 'office deadlines', concrete: true }, { setting: 'home', example: 'dinner table', concrete: true }], uncertainty: null },
  },
  factors: { sleep: { reported: true }, anxiety: { reported: true } },
};

let failures = 0;
const pass = (label, ok, extra) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${extra ? ' | ' + extra : ''}`); };

// Drive a state through processTurn, snapshot at each meaningful pending, and verify
// that loadSnapshot + currentQuestion reconstruct the exact in-flight question.
async function verifyStageReconstruction(lang) {
  const id = 'rc-' + lang + '-' + Math.random().toString(36).slice(2, 6);
  const state = assessment.createStage2Assessment(id, lang);
  state.screening = 'positive';
  assessment.begin(state);

  // Helper: snapshot now, reload, reconstruct, compare to a live currentQuestion.
  function snap(label, expectCidOrProbe) {
    assessment.snapshot(state);
    const loaded = assessment.loadSnapshot(id);
    pass(`[${lang}] snapshot/load preserves lang`, loaded.lang === lang, `lang=${loaded.lang}`);
    pass(`[${lang}] snapshot/load preserves stage`, loaded.stage === state.stage, `stage=${loaded.stage}`);
    pass(`[${lang}] snapshot/load preserves pending`, JSON.stringify(loaded.pending) === JSON.stringify(state.pending), `pending=${JSON.stringify(loaded.pending)}`);
    const qLive = assessment.currentQuestion(state, state.lang);
    const qLoaded = assessment.currentQuestion(loaded, loaded.lang);
    pass(`[${lang}] currentQuestion matches live (${label})`, qLoaded === qLive, `match=${qLoaded === qLive}`);
    pass(`[${lang}] currentQuestion non-empty (${label})`, typeof qLoaded === 'string' && qLoaded.length > 0, `q=${qLoaded && qLoaded.slice(0, 30)}`);
    assessment.clearSnapshot(id);
  }

  // ADULT_SYMPTOMS, first criterion (mid-criterion, pending = core question 0)
  snap('ADULT begin', 'INATT_01');
  // After answering probe 0 of each stage, pending advances to the next in-flight item.

  let seenTransition = null;
  for (let t = 0; t < 600; t++) {
    const r = await assessment.processTurn(state, FULL_CONFIG.answer || 'Often, for example when I...');
    if (r.transitioned) {
      if (!seenTransition) {
        // Just crossed into CHILDHOOD: pending = {stage:'CHILDHOOD', probe:0}
        snap('CHILDHOOD begin', engine.CHILDHOOD_PROBES[0].id);
        seenTransition = 'CHILDHOOD';
      } else if (seenTransition === 'CHILDHOOD') {
        // Crossed into IMPAIRMENT: pending = {stage:'IMPAIRMENT', probe:0}
        snap('IMPAIRMENT begin', 'domains');
        seenTransition = 'IMPAIRMENT';
      } else if (seenTransition === 'IMPAIRMENT') {
        // Crossed into DIFFERENTIAL: pending = {stage:'DIFFERENTIAL', probe:0}
        snap('DIFFERENTIAL begin', engine.DIFFERENTIAL_FACTORS[0].id);
        seenTransition = 'DIFFERENTIAL';
      }
    }
    if (r.completed) {
      // REPORT
      state.report = engine.evaluate(state);
      assessment.snapshot(state);
      const loaded = assessment.loadSnapshot(id);
      pass(`[${lang}] REPORT: snap/load stage=REPORT`, loaded.stage === 'REPORT', `stage=${loaded.stage}`);
      pass(`[${lang}] REPORT: currentQuestion returns null`, assessment.currentQuestion(loaded, loaded.lang) === null);
      assessment.clearSnapshot(id);
      return;
    }
  }
  pass(`[${lang}] drove to REPORT`, false, 'pipeline did not complete');
  assessment.clearSnapshot(id);
}

(async () => {
  setupFullExtractor(FULL_CONFIG);

  // =====================================================================
  // PART A — model layer
  // =====================================================================

  // A1: language defaults to en and is accepted only for en|fa.
  pass("schema: createStage2Assessment(id,'fa').lang === 'fa'", assessment.createStage2Assessment('A1', 'fa').lang === 'fa');
  pass("schema: createStage2Assessment(id,'en').lang === 'en'", assessment.createStage2Assessment('A1', 'en').lang === 'en');
  pass("schema: createStage2Assessment(id,'xx').lang === 'en' (default)", assessment.createStage2Assessment('A1', 'xx').lang === 'en');
  pass("schema: createStage2Assessment(id).lang === 'en'", assessment.createStage2Assessment('A1').lang === 'en');

  // A2: currentQuestion is null for a never-begun state.
  pass('currentQuestion: null for never-begun state (pending.cid null)', assessment.currentQuestion(assessment.createStage2Assessment('A2', 'en'), 'en') === null);

  // A3: snapshot/load/clear round-trip preserves everything.
  for (const lang of ['en', 'fa']) {
    const state = assessment.createStage2Assessment('A3-' + lang, lang);
    assessment.begin(state);
    assessment.snapshot(state);
    const loaded = assessment.loadSnapshot('A3-' + lang);
    pass(`[${lang}] snapshot/load preserves lang+stage+criterion`, loaded.lang === lang && loaded.stage === 'ADULT_SYMPTOMS' && loaded.pending.cid === state.pending.cid);
    pass(`[${lang}] currentQuestion on loaded equals live`, assessment.currentQuestion(loaded, loaded.lang) === assessment.currentQuestion(state, state.lang));
    pass(`[${lang}] clearSnapshot removes the file`, (assessment.clearSnapshot('A3-' + lang), assessment.loadSnapshot('A3-' + lang)) === null);
  }

  // A4: drive EN + FA through every stage, snapshot/load at each, verify currentQuestion reconstruction.
  await verifyStageReconstruction('en');
  await verifyStageReconstruction('fa');

  // =====================================================================
  // PART B — HTTP layer
  // =====================================================================
  const TEST_PORT = 3111;
  process.env.PORT = String(TEST_PORT);
  delete require.cache[require.resolve(path.join(ROOT, 'server'))];
  const server = require(path.join(ROOT, 'server'));
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));

  try {
    // B1: language locked at creation; FA session serves Persian questions.
    const sessFa = await request(TEST_PORT, 'POST', '/api/session', { lang: 'fa' });
    pass('HTTP: create fa session -> 200 + id + Persian question', sessFa.status === 200 && sessFa.body.id && /[ا-ی]/.test(sessFa.body.question),
      `status=${sessFa.status} id=${!!sessFa.body.id} hasFa=${/[ا-ی]/.test(sessFa.body.question)}`);

    // B2: /api/state returns canonical lang=fa; /api/answer sending lang=en is IGNORED.
    const stFa = await request(TEST_PORT, 'GET', '/api/state/' + sessFa.body.id);
    pass('HTTP: /api/state canonical lang=fa', stFa.body.lang === 'fa' && stFa.body.stage === 'ADULT_SYMPTOMS', `lang=${stFa.body.lang} stage=${stFa.body.stage}`);
    await request(TEST_PORT, 'POST', '/api/answer/' + sessFa.body.id, { answer: 'اغلب این اتفاق می‌افتد', lang: 'en' });
    const stFa2 = await request(TEST_PORT, 'GET', '/api/state/' + sessFa.body.id);
    pass('HTTP: lang stays fa after answer sends lang=en (locked)', stFa2.body.lang === 'fa', `lang=${stFa2.body.lang}`);
    const onDisk = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', sessFa.body.id + '.json'), 'utf8'));
    pass('HTTP: on-disk snapshot lang=fa (canonical, not changed by client)', onDisk.lang === 'fa', `diskLang=${onDisk.lang}`);
    assessment.clearSnapshot(sessFa.body.id);

    // B3: EN session canonical lang=en.
    const sessEn = await request(TEST_PORT, 'POST', '/api/session', { lang: 'en' });
    const stEn = await request(TEST_PORT, 'GET', '/api/state/' + sessEn.body.id);
    pass('HTTP: create en session -> /api/state lang=en + English question', stEn.body.lang === 'en' && /[A-Za-z]/.test(stEn.body.question) && !/[ا-ی]/.test(stEn.body.question),
      `lang=${stEn.body.lang} hasEn=${/[A-Za-z]/.test(stEn.body.question)}`);
    assessment.clearSnapshot(sessEn.body.id);

    // B4: reset endpoint deletes session + snapshot; /api/state -> not found.
    const reset = await request(TEST_PORT, 'POST', '/api/session/reset', { id: sessEn.body.id });
    pass('HTTP: /api/session/reset -> reset:true', reset.body.reset === true && reset.body.id === sessEn.body.id, `reset=${reset.body.reset}`);
    const afterReset = await request(TEST_PORT, 'GET', '/api/state/' + sessEn.body.id);
    pass('HTTP: /api/state after reset -> session not found', afterReset.body.error === 'session not found', `error=${afterReset.body.error}`);

    // B5: no lang arg -> defaults to en.
    const sessDef = await request(TEST_PORT, 'POST', '/api/session', {});
    const stDef = await request(TEST_PORT, 'GET', '/api/state/' + sessDef.body.id);
    pass('HTTP: session created with no lang defaults to en', stDef.body.lang === 'en', `lang=${stDef.body.lang}`);
    assessment.clearSnapshot(sessDef.body.id);

    // B6: completed assessment -> completed=true, /api/report returns report.
    const sessDone = await request(TEST_PORT, 'POST', '/api/session', { lang: 'en' });
    let done = false;
    for (let t = 0; t < 600 && !done; t++) {
      const r = await request(TEST_PORT, 'POST', '/api/answer/' + sessDone.body.id, { answer: 'Often, for example when I...' });
      if (r.body.completed) done = true;
    }
    const std = await request(TEST_PORT, 'GET', '/api/state/' + sessDone.body.id);
    pass('HTTP: completed -> /api/state completed=true, stage=REPORT', std.body.completed === true && std.body.stage === 'REPORT', `completed=${std.body.completed} stage=${std.body.stage}`);
    const rep = await request(TEST_PORT, 'GET', '/api/report/' + sessDone.body.id);
    pass('HTTP: completed -> /api/report returns tiered report (not_a_diagnosis)', !!rep.body.report && rep.body.report.tier !== undefined && rep.body.report.not_a_diagnosis === true,
      `tier=${rep.body.report && rep.body.report.tier}`);
    assessment.clearSnapshot(sessDone.body.id);

    // B7: server-restart resume — snapshot survives a process restart (empty in-memory map).
    const sessR = await request(TEST_PORT, 'POST', '/api/session', { lang: 'fa' });
    await request(TEST_PORT, 'POST', '/api/answer/' + sessR.body.id, { answer: 'اغلب' });
    pass('HTTP: snapshot exists on disk for restart test', assessment.snapshotExists(sessR.body.id));
    const TEST_PORT2 = 3112;
    process.env.PORT = String(TEST_PORT2);
    // Re-require server fresh so it gets a NEW http.Server + empty sessions map (simulating restart).
    const serverPath = require.resolve(path.join(ROOT, 'server'));
    delete require.cache[serverPath];
    const server2 = require(serverPath);
    await new Promise((resolve) => server2.listen(TEST_PORT2, '127.0.0.1', resolve));
    try {
      const reloaded = await request(TEST_PORT2, 'GET', '/api/state/' + sessR.body.id);
      pass('HTTP (restart): /api/state reloads lang=fa + in-flight question from disk', reloaded.body.lang === 'fa' && !!reloaded.body.question && reloaded.body.stage === 'ADULT_SYMPTOMS',
        `lang=${reloaded.body.lang} stage=${reloaded.body.stage} hasQ=${!!reloaded.body.question}`);
    } finally {
      await new Promise((resolve) => server2.close(() => resolve()));
      assessment.clearSnapshot(sessR.body.id);
    }
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
