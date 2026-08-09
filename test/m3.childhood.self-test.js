'use strict';
// M3 focused self-test: Stage 3 (childhood-onset) per CLINICAL_ADHD_PROTOCOL.md §5.
// Validates rateOnset for strong/moderate/weak/insufficient/evidence_against and
// proves the engine NEVER infers childhood onset from adult symptom records (non-inference).
// Uses an injected FAKE extractor — no real LLM calls.

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const extractorPath = require.resolve(path.join(ROOT, 'interviewer/interviewer.js'));
// Load the REAL interviewer to grab normalizeChildhoodMemory before mocking (H2 fix).
const { normalizeChildhoodMemory } = require(extractorPath);
// Inject a default fake BEFORE requiring modules, so the real interviewer.js is never loaded
// (mirrors test/stage2.self-test.js). Overwritten per-case via setFake.
require.cache[extractorPath] = { id: extractorPath, filename: extractorPath, loaded: true, exports: { extractEvidence: async function () { return { memories: [] }; } } };
const assessment = require(path.join(ROOT, 'model/assessment'));
const engine = require(path.join(ROOT, 'model/engine'));

function setFake(fake) {
  require.cache[extractorPath] = { id: extractorPath, filename: extractorPath, loaded: true, exports: fake };
  delete require.cache[require.resolve(path.join(ROOT, 'model/assessment'))];
}

function makeState() {
  const state = assessment.createStage2Assessment('m3');
  // Pretend Stage 2 is done with STRONG adult evidence across all 18 criteria.
  // If onset rating still equals the childhood-only result, non-inference holds.
  for (const c of assessment.CRITERIA) {
    state.criteria[c.id] = {
      criterion: c.id, status: 'supported', confidence: 'strong',
      core_answer: 'Often', example: 'x', contexts: ['work', 'home'], consequence: 'y',
      counter_evidence: [], uncertainty: null, tries: 1, followups: 0, source: 'interview',
    };
  }
  return state;
}

async function runCase(memories) {
  setFake({ extractEvidence: async function () { return { memories }; } });
  const a3 = require(path.join(ROOT, 'model/assessment'));
  const state = makeState();
  a3.beginStage3(state);
  let res;
  for (let i = 0; i < engine.CHILDHOOD_PROBES.length + 2; i++) {
    res = await a3.processStage3Turn(state, 'user answer about childhood');
    if (res.completed) break;
  }
  if (!res || !res.completed) throw new Error('childhood stage did not complete');
  return res;
}

const cases = {
  strong: [
    { behavior: 'teacher noted I could not sit still and blurted out answers', age: 7, source: 'teacher', concrete: true, against: false, vague: false },
  ],
  moderate: [
    { behavior: 'frequently lost my math homework and forgot to bring it home', age: 8, source: 'memory', concrete: true, against: false, vague: false },
    { behavior: 'desk was always messy; I lost pencils and erasers constantly', age: 7, source: 'memory', concrete: true, against: false, vague: false },
  ],
  weak: [
    { behavior: 'I was always fidgety and couldn\'t sit still', age: 6, source: 'memory', concrete: true, against: false, vague: false },
  ],
  insufficient: [],
  evidence_against: [
    { behavior: 'I was an attentive, organized child; teachers praised my focus', age: 8, source: 'report_card', concrete: true, against: true, vague: false },
  ],
};

(async () => {
  let failures = 0;
  const expect = { strong: 'strong', moderate: 'moderate', weak: 'weak', insufficient: 'insufficient', evidence_against: 'evidence_against' };
  for (const [name, mems] of Object.entries(cases)) {
    const res = await runCase(mems);
    const ok = res.onset === expect[name];
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} -> onset=${res.onset} (expected ${expect[name]}) | memories=${res.evidence.length}`);
  }

  // Non-inference: insufficient childhood evidence must rate 'insufficient' even though
  // makeState() planted 18 fully-supported adult symptom records. rateOnset reads only childhood.
  const r = await runCase(cases.insufficient);
  const ni = r.onset === 'insufficient';
  if (!ni) failures++;
  console.log(`${ni ? 'PASS' : 'FAIL'}: non-inference — onset=${r.onset} (expect insufficient, despite 18 supported adult records)`);

  // Pure unit checks of rateOnset (no state).
  const unit = [
    ['no evidence', [], 'insufficient'],
    ['vague only', [{ behavior: 'always hyper', age: null, source: 'memory', concrete: false, vague: true }], 'weak'],
    ['1 concrete, no external', [{ behavior: 'lost toys', age: 5, source: 'memory', concrete: true }], 'weak'],
    ['2 concrete, no external', [{ behavior: 'a', age: 5, source: 'memory', concrete: true }, { behavior: 'b', age: 6, source: 'memory', concrete: true }], 'moderate'],
    ['1 concrete + external', [{ behavior: 'blurted out', age: 7, source: 'teacher', concrete: true }], 'strong'],
    ['against + supporting concrete -> weak (mixed evidence, H3)', [{ behavior: 'organized child', age: 8, source: 'report_card', concrete: true, against: true }, { behavior: 'blurted out', age: 7, source: 'teacher', concrete: true }], 'weak'],
    ['age>=12 excluded -> insufficient', [{ behavior: 'hyper in high school', age: 14, source: 'memory', concrete: true }], 'insufficient'],
  ];
  for (const [label, ev, exp] of unit) {
    const got = engine.rateOnset(ev);
    const ok = got === exp;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}: rateOnset "${label}" -> ${got} (expected ${exp})`);
  }

  // --- H2: age boundary through the REAL normalization path ---
  // The extractor's normalizeChildhoodMemory (loaded at top before mocking) must preserve
  // age >= 12 as a number so rateOnset can exclude it (not nullify it to null).

  // H2a: normalizeChildhoodMemory preserves age >= 12 as a number (not null)
  const normAge14 = normalizeChildhoodMemory({ behavior: 'hyper in high school', age: 14, source: 'memory', concrete: true, against: false, vague: false });
  const h2a = normAge14.age === 14;
  if (!h2a) failures++;
  console.log(`${h2a ? 'PASS' : 'FAIL'}: normalizeChildhoodMemory: age=14 preserved (not nullified to null) -> age=${normAge14.age}`);

  // H2b: normalizeChildhoodMemory nulls non-numeric age (NaN, undefined, string)
  const normNaN = normalizeChildhoodMemory({ behavior: 'x', age: 'not a number', concrete: true });
  const normUndef = normalizeChildhoodMemory({ behavior: 'x', age: undefined, concrete: true });
  const normInf = normalizeChildhoodMemory({ behavior: 'x', age: Infinity, concrete: true });
  const h2b = normNaN.age === null && normUndef.age === null && normInf.age === null;
  if (!h2b) failures++;
  console.log(`${h2b ? 'PASS' : 'FAIL'}: normalizeChildhoodMemory: non-numeric/invalid age -> null -> NaN:${normNaN.age} undefined:${normUndef.age} Infinity:${normInf.age}`);

  // H2c: rateOnset via normalizeChildhoodMemory excludes age >= 12 -> insufficient
  const normalized14 = normalizeChildhoodMemory({ behavior: 'high school behavior', age: 14, source: 'memory', concrete: true, against: false, vague: false });
  const h2c = engine.rateOnset([normalized14]) === 'insufficient';
  if (!h2c) failures++;
  console.log(`${h2c ? 'PASS' : 'FAIL'}: rateOnset via normalizeChildhoodMemory: age=14 excluded -> insufficient`);

  // H2d: normalizeChildhoodMemory preserves age < 12 -> rateOnset can rate it
  const normalized6 = normalizeChildhoodMemory({ behavior: 'blurted out', age: 6, source: 'teacher', concrete: true, against: false, vague: false });
  const h2d = engine.rateOnset([normalized6]) === 'strong';
  if (!h2d) failures++;
  console.log(`${h2d ? 'PASS' : 'FAIL'}: rateOnset via normalizeChildhoodMemory: age=6 preserved -> strong`);

  // --- H3 additional edge cases for mixed evidence ---
  const mixedUnit = [
    ['against only (no supporting concrete) -> evidence_against', [{ behavior: 'attentive child', age: 8, source: 'report_card', concrete: true, against: true, vague: false }], 'evidence_against'],
    ['multiple against + multiple supporting -> weak', [{ behavior: 'organized', age: 8, source: 'report_card', concrete: true, against: true }, { behavior: 'blurted out', age: 7, source: 'teacher', concrete: true }, { behavior: 'lost homework', age: 9, source: 'memory', concrete: true }], 'weak'],
    ['against vague + supporting concrete -> weak', [{ behavior: 'always organized', age: 5, source: 'memory', concrete: false, against: true, vague: true }, { behavior: 'blurted out', age: 7, source: 'teacher', concrete: true }], 'weak'],
  ];
  for (const [label, ev, exp] of mixedUnit) {
    const got = engine.rateOnset(ev);
    const ok = got === exp;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}: rateOnset "${label}" -> ${got} (expected ${exp})`);
  }

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
