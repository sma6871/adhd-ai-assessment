'use strict';
const http = require('http');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const extractorPath = require.resolve(path.join(ROOT, 'interviewer/interviewer.js'));

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
    const id = criterion.id;
    const base = config.special && id in config.special ? config.special[id] : {};
    return { core_answer: config.stage2Core || 'Often', example: base.example || 'concrete example for ' + id, contexts: base.contexts || ['work'], consequence: base.consequence || 'costs focus', counter_evidence: base.counter_evidence || [], uncertainty: null };
  });
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

(async () => {
  let failures = 0;
  const pass = (label, ok, extra) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${extra ? ' | ' + extra : ''}`); };

  setupFullExtractor({
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
  });

  delete require.cache[require.resolve(path.join(ROOT, 'model/assessment'))];
  delete require.cache[require.resolve(path.join(ROOT, 'server'))];

  const TEST_PORT = 3099;
  process.env.PORT = String(TEST_PORT);
  const server = require(path.join(ROOT, 'server'));

  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));

  try {
    // Create a session
    const sess = await request(TEST_PORT, 'POST', '/api/session');
    pass('HTTP: /api/session returns 200 with id + first question', sess.status === 200 && sess.body.id && typeof sess.body.question === 'string', `status=${sess.status} id=${sess.body.id}`);

    const sessionId = sess.body.id;
    const answer = 'Often, for example when I have to focus for long periods.';

    let firstTransition = null;
    let secondTransition = null;
    let thirdTransition = null;
    let reportResp = null;

    for (let t = 0; t < 500; t++) {
      const res = await request(TEST_PORT, 'POST', `/api/answer/${sessionId}`, { answer });
      if (res.body.transitioned) {
        if (res.body.stage === 'CHILDHOOD' && !firstTransition) firstTransition = res.body;
        else if (res.body.stage === 'IMPAIRMENT' && !secondTransition) secondTransition = res.body;
        else if (res.body.stage === 'DIFFERENTIAL' && !thirdTransition) thirdTransition = res.body;
      }
      if (res.body.completed && res.body.report) { reportResp = res.body; break; }
    }

    // Stage 2 → CHILDHOOD transition: must have question + probe fields
    const s2cOk = firstTransition
      && firstTransition.transitioned === true
      && firstTransition.stage === 'CHILDHOOD'
      && typeof firstTransition.question === 'string' && firstTransition.question.length > 0
      && firstTransition.probeId !== undefined
      && firstTransition.kind === 'childhood'
      && firstTransition.first === true
      && firstTransition.onset === null
      && firstTransition.criterion_done === true;
    pass('HTTP: Stage 2 → CHILDHOOD transition has question + probe + kind + first', s2cOk,
      `stage=${firstTransition?.stage} hasQ=${typeof firstTransition?.question} kind=${firstTransition?.kind} first=${firstTransition?.first} onset=${firstTransition?.onset} criterion_done=${firstTransition?.criterion_done}`);

    // Stage 3 → IMPAIRMENT transition
    const c34Ok = secondTransition
      && secondTransition.transitioned === true
      && secondTransition.stage === 'IMPAIRMENT'
      && typeof secondTransition.question === 'string' && secondTransition.question.length > 0
      && secondTransition.probeId === 'domains'
      && secondTransition.kind === 'impairment'
      && secondTransition.first === true;
    pass('HTTP: Stage 3 → IMPAIRMENT transition has impairment question + probeId', c34Ok,
      `stage=${secondTransition?.stage} hasQ=${typeof secondTransition?.question} probeId=${secondTransition?.probeId} kind=${secondTransition?.kind} first=${secondTransition?.first}`);

    // Stage 4 → DIFFERENTIAL transition
    const c45Ok = thirdTransition
      && thirdTransition.transitioned === true
      && thirdTransition.stage === 'DIFFERENTIAL'
      && typeof thirdTransition.question === 'string' && thirdTransition.question.length > 0
      && thirdTransition.probeId !== undefined
      && thirdTransition.kind === 'differential'
      && thirdTransition.first === true;
    pass('HTTP: Stage 4 → DIFFERENTIAL transition has differential question + probeId', c45Ok,
      `stage=${thirdTransition?.stage} hasQ=${typeof thirdTransition?.question} probeId=${thirdTransition?.probeId} kind=${thirdTransition?.kind} first=${thirdTransition?.first}`);

    // Final report: must have summary, differential_note, contradiction_note
    const reportOk = reportResp
      && reportResp.completed === true
      && reportResp.stage === 'REPORT'
      && typeof reportResp.report.summary === 'string' && reportResp.report.summary.length > 0
      && typeof reportResp.report.differential_note !== 'undefined'
      && typeof reportResp.report.contradiction_note !== 'undefined'
      && reportResp.report.dsm5_criteria !== undefined
      && reportResp.report.tier !== undefined;
    pass('HTTP: Final REPORT has summary, differential_note, contradiction_note, dsm5_criteria, tier', reportOk,
      `stage=${reportResp?.stage} completed=${reportResp?.completed} hasSummary=${typeof reportResp?.report?.summary} hasDiffNote=${typeof reportResp?.report?.differential_note} hasContraNote=${typeof reportResp?.report?.contradiction_note} tier=${reportResp?.report?.tier}`);

    // getReport endpoint returns the report
    const getReport = await request(TEST_PORT, 'GET', `/api/report/${sessionId}`);
    pass('HTTP: /api/report/:id returns 200 with report', getReport.status === 200 && getReport.body.report !== null && getReport.body.report.tier !== undefined,
      `status=${getReport.status} hasReport=${!!getReport.body.report}`);

    // getReport before REPORT stage returns null
    const sess2 = await request(TEST_PORT, 'POST', '/api/session');
    const earlyReport = await request(TEST_PORT, 'GET', `/api/report/${sess2.body.id}`);
    pass('HTTP: /api/report returns null before all stages complete', earlyReport.body.report === null, `status=${earlyReport.status} report=${earlyReport.body.report}`);

  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
