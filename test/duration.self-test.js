'use strict';
// Duration/persistence self-test (M3-followon): derive the DSM-5 ≥6-month duration
// status from Stage 2 core answers per CLINICAL_ADHD_PROTOCOL.md §9a-B / §9b-B.
// Evidence source is explicitly "Stage 2 core answers (§2)" — the core question is framed
// over the past ~6 months, so a positive frequency endorsement confirms persistence.
// Uses an injected FAKE extractor where integration is exercised; pure unit checks otherwise.

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const extractorPath = require.resolve(path.join(ROOT, 'interviewer/interviewer.js'));
require.cache[extractorPath] = { id: extractorPath, filename: extractorPath, loaded: true, exports: { extractEvidence: async function () { return { memories: [] }; } } };
const assessment = require(path.join(ROOT, 'model/assessment'));
const engine = require(path.join(ROOT, 'model/engine'));

// Build a state whose Stage 2 criteria have the given core_answer pattern.
function stateWith(cores) {
  const state = assessment.createStage2Assessment('dur');
  let i = 0;
  for (const c of assessment.CRITERIA) {
    const ca = cores[i++];
    state.criteria[c.id] = {
      criterion: c.id, status: 'supported', confidence: 'strong',
      core_answer: ca, example: 'x', contexts: ['work', 'home'], consequence: 'y',
      counter_evidence: [], uncertainty: null, tries: 1, followups: 0, source: 'interview',
    };
  }
  return state;
}

const POS = ['Often', 'Very Often', 'Sometimes'];
const NEG = ['Never', 'Rarely'];

(async () => {
  let failures = 0;

  // --- Pure unit checks of deriveDuration (engine reads only core_answer) ---
  const unit = [
    ['all Often -> met', stateWith(assessment.CRITERIA.map(() => 'Often')), 'met'],
    ['all Never -> not_met', stateWith(assessment.CRITERIA.map(() => 'Never')), 'not_met'],
    ['all Rarely -> not_met', stateWith(assessment.CRITERIA.map(() => 'Rarely')), 'not_met'],
    ['mixed Sometimes/Often + some Never -> met', stateWith(assessment.CRITERIA.map((_, k) => k % 2 ? 'Often' : 'Never')), 'met'],
    ['one Often, rest Never -> met', (() => { const a = stateWith(assessment.CRITERIA.map(() => 'Never')); a.criteria['INATT_01'].core_answer = 'Often'; return a; })(), 'met'],
    ['no core answers (all null) -> uncertain', stateWith(assessment.CRITERIA.map(() => null)), 'uncertain'],
  ];
  for (const [label, st, exp] of unit) {
    const got = engine.deriveDuration(st);
    const ok = got === exp;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}: deriveDuration ${label} -> ${got} (expected ${exp})`);
  }

  // --- Non-inference sanity: deriveDuration ignores status/confidence; it only reads core_answer.
  // Same core answers -> same duration regardless of per-criterion supported/unsupported.
  const sSupp = stateWith(assessment.CRITERIA.map((_, k) => k < 2 ? 'Often' : 'Never'));
  sSupp.criteria['INATT_01'].status = 'supported';
  sSupp.criteria['INATT_02'].status = 'unsupported'; // still endorsed Often -> met
  const sOnly = stateWith(assessment.CRITERIA.map((_, k) => k < 2 ? 'Often' : 'Never'));
  sOnly.criteria['INATT_01'].status = 'unsupported';
  sOnly.criteria['INATT_02'].status = 'unsupported';
  const nonInf = engine.deriveDuration(sSupp) === engine.deriveDuration(sOnly) && engine.deriveDuration(sOnly) === 'met';
  if (!nonInf) failures++;
  console.log(`${nonInf ? 'PASS' : 'FAIL'}: non-inference deriveDuration reads core_answer only (not status) -> ${engine.deriveDuration(sSupp)} / ${engine.deriveDuration(sOnly)}`);

  // --- Integration: Stage 2 completion sets state.duration = deriveDuration(state). ---
  // All-endorsed Often -> 'met'; the full Stage 2 self-test already covers this path.
  function setFakeCore(ca) {
    require.cache[extractorPath].exports = {
      extractEvidence: async function ({ criterion }) {
        const id = criterion.id;
        if (id === 'HYPERR_05') throw new Error('simulated parse error');
        if (id === 'INATT_09') return { core_answer: 'Never', example: 'never forget', contexts: ['home'], consequence: null, counter_evidence: [], uncertainty: null };
        if (id === 'INATT_04') return { core_answer: 'Sometimes', example: 'sometimes leaves draft', contexts: ['work'], consequence: 'reminder', counter_evidence: [], uncertainty: null };
        return { core_answer: ca, example: 'ex ' + id, contexts: ['work', 'home'], consequence: 'cost', counter_evidence: [], uncertainty: null };
      },
    };
  }

  // Helper to drain a Stage 2 assessment to completion with the injected core_answer.
  async function drain(ca) {
    setFakeCore(ca);
    delete require.cache[require.resolve(path.join(ROOT, 'model/assessment'))];
    const a3 = require(path.join(ROOT, 'model/assessment'));
    const state = a3.createStage2Assessment('int');
    a3.begin(state);
    for (let t = 0; t < 200; t++) {
      const res = await a3.processTurn(state, 'Often, for example when...');
      if (res.completed) break;
    }
    return state.duration;
  }

   const intMet = await drain('Often');
   const okIntMet = intMet === 'met';
   if (!okIntMet) failures++;
   console.log(`${okIntMet ? 'PASS' : 'FAIL'}: integration Stage2 mixed-extract -> duration=${intMet} (expected met)`);

   async function drainExplicit(allCore) {
     require.cache[extractorPath].exports = {
       extractEvidence: async function ({ criterion }) {
         const id = criterion.id;
         if (id === 'HYPERR_05') throw new Error('err');
         return { core_answer: allCore, example: 'x', contexts: ['work', 'home'], consequence: 'y', counter_evidence: [], uncertainty: null };
       },
     };
     delete require.cache[require.resolve(path.join(ROOT, 'model/assessment'))];
     const a3 = require(path.join(ROOT, 'model/assessment'));
     const state = a3.createStage2Assessment('int2');
     a3.begin(state);
     for (let t = 0; t < 200; t++) {
       const res = await a3.processTurn(state, 'Often, for example...');
       if (res.completed) break;
     }
     return state.duration;
   }
   const intAllNever = await drainExplicit('Never');
   const intAllSometimes = await drainExplicit('Sometimes');
   const okNotMet = intAllNever === 'not_met';
   const okAllMet = intAllSometimes === 'met';
   if (!okNotMet) failures++;
   if (!okAllMet) failures++;
   console.log(`${okNotMet ? 'PASS' : 'FAIL'}: integration all-Never -> duration=${intAllNever} (expected not_met)`);
   console.log(`${okAllMet ? 'PASS' : 'FAIL'}: integration all-Sometimes -> duration=${intAllSometimes} (expected met)`);

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
