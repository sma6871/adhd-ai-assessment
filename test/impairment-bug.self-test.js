'use strict';
// Regression test for the impairment-extraction normalization bug
// (interviewer/interviewer.js: extractImpairmentEvidence).
//
// Bug: `.filter()` was bound to the object literal inside `.map()` instead of
// the array, so any non-empty domains_impaired/settings response threw
// "filter is not a function" in production.
//
// This test loads the REAL extractor module, mocks globalThis.fetch, and verifies
// that the normalized output is produced correctly (not null, properly filtered).

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const interviewerPath = require.resolve(path.join(ROOT, 'interviewer/interviewer.js'));

process.env.GROQ_API_KEY = 'test-key-for-unit-test';
delete require.cache[interviewerPath];
const interviewer = require(interviewerPath);

const engine = require(path.join(ROOT, 'model/engine'));

const IM_TEST_PROBE = { id: 'domains', prompt: engine.formatImpairmentQuestion() };

function mockFetch(responseBody) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(responseBody),
      json: async () => responseBody,
      clone: () => ({ text: async () => JSON.stringify(responseBody) }),
    };
  };
  return () => { globalThis.fetch = originalFetch; };
}

(async () => {
  let failures = 0;
  const pass = (label, ok, extra) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${extra ? ' | ' + extra : ''}`); };

  // --- TEST 1: Non-empty domains_impaired + settings → no throw, proper normalization ---
  const raw1 = {
    domains_impaired: [
      { domain: 'Work', example: 'missed deadlines', concrete: true },
      { domain: 'Relationships', example: 'forgot anniversary', concrete: true },
      { domain: '', example: 'no domain', concrete: true },
      { domain: 'Organization', example: '', concrete: true },
    ],
    settings: [
      { setting: 'work', example: 'office deadlines', concrete: true },
      { setting: 'home', example: 'dinner table', concrete: true },
      { setting: '', example: 'no setting', concrete: true },
    ],
    uncertainty: null,
  };
  const restore1 = mockFetch({
    id: 'chatcmsg-1', object: 'chat.completion', model: 'llama-3.1-8b-instant',
    choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(raw1) } }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  });

  let result1, error1;
  try {
    result1 = await interviewer.extractEvidence({
      stage: 'impairment', probe: IM_TEST_PROBE,
      priorEvidence: { examples: [], settings: [] },
      transcript: [], userAnswer: 'test',
    });
  } catch (e) {
    error1 = e.message;
  }
  restore1();

  const noThrow1 = error1 === undefined;
  pass('impairment: non-empty domains/settings response does not throw', noThrow1, error1 ? `error=${error1}` : '');

  if (noThrow1) {
    const domOk = Array.isArray(result1.domains_impaired) && result1.domains_impaired.length === 2
      && result1.domains_impaired[0].domain === 'Work'
      && result1.domains_impaired[1].domain === 'Relationships'
      && result1.domains_impaired.every(d => d.concrete === true);
    pass('impairment: domains_impaired filtered to 2 valid entries', domOk, `domains=${JSON.stringify(result1.domains_impaired)}`);

    const setOk = Array.isArray(result1.settings) && result1.settings.length === 2
      && result1.settings[0].setting === 'work'
      && result1.settings[1].setting === 'home';
    pass('impairment: settings filtered to 2 valid entries', setOk, `settings=${JSON.stringify(result1.settings)}`);

    const uncOk = result1.uncertainty === null;
    pass('impairment: uncertainty preserved as null', uncOk, `uncertainty=${result1.uncertainty}`);
  } else {
    pass('impairment: domains_impaired filtered to 2 valid entries', false, 'result was null due to throw');
    pass('impairment: settings filtered to 2 valid entries', false, 'result was null due to throw');
    pass('impairment: uncertainty preserved as null', false, 'result was null due to throw');
  }

  // --- TEST 2: Empty arrays → no throw, empty result ---
  const raw2 = { domains_impaired: [], settings: [], uncertainty: null };
  const restore2 = mockFetch({
    id: 'chatcmsg-2', object: 'chat.completion', model: 'llama-3.1-8b-instant',
    choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(raw2) } }],
    usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
  });

  let result2, error2;
  try {
    result2 = await interviewer.extractEvidence({
      stage: 'impairment', probe: { id: 'settings', prompt: engine.formatSettingsQuestion() },
      priorEvidence: { examples: [], settings: [] },
      transcript: [], userAnswer: 'no problems',
    });
  } catch (e) {
    error2 = e.message;
  }
  restore2();

  pass('impairment: empty domains/settings response does not throw', error2 === undefined, error2 ? `error=${error2}` : '');
  if (error2 === undefined) {
    pass('impairment: empty response → empty arrays', result2.domains_impaired.length === 0 && result2.settings.length === 0, `domains=${result2.domains_impaired.length} settings=${result2.settings.length}`);
  } else {
    pass('impairment: empty response → empty arrays', false, 'threw');
  }

  // --- TEST 3: Non-concrete items filtered out (concrete flag derived from example) ---
  const raw3 = {
    domains_impaired: [
      { domain: 'Work', example: 'specific missed deadline last Tuesday', concrete: true },
      { domain: 'Finance', example: '', concrete: false },
    ],
    settings: [],
    uncertainty: null,
  };
  const restore3 = mockFetch({
    id: 'chatcmmsg-3', object: 'chat.completion', model: 'llama-3.1-8b-instant',
    choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(raw3) } }],
    usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
  });

  let result3;
  try {
    result3 = await interviewer.extractEvidence({
      stage: 'impairment', probe: IM_TEST_PROBE,
      priorEvidence: { examples: [], settings: [] },
      transcript: [], userAnswer: 'test',
    });
  } catch (e) {}
  restore3();

  pass('impairment: non-concrete domain filtered (only domain with example survives)', result3 && result3.domains_impaired.length === 1 && result3.domains_impaired[0].domain === 'Work',
    `domains=${result3 && JSON.stringify(result3.domains_impaired)}`);

  // --- TEST 4: Production defect no longer triggers (no "filter is not a function") ---
  const wasFixed = error1 === undefined && error2 === undefined;
  pass('REGRESSION: "filter is not a function" defect resolved in extractImpairmentEvidence', wasFixed,
    `errors=${[error1, error2].filter(Boolean).join('; ')}`);

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
