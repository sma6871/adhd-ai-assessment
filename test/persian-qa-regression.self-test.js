'use strict';

// Focused regression tests for the three Persian interview QA issues:
//   1. "یادم نیست" / "یادم نمیاد" → treated as explicit uncertainty, advances to next criterion
//   2. "هرگز" → normalized to 'Never' → status 'unsupported' (correct clinical mapping)
//   3. "بدون صبرتن" → fixed to "بدون صبر" in HYPERR_06 question
//
// Uses an injected fake extractor so tests are deterministic and offline.

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const extractorPath = require.resolve(path.join(ROOT, 'interviewer/interviewer.js'));
const assert = require('assert');
const locales = require('../model/locales');

// Stub the LLM extractor: returns null core_answer so the deterministic
// classifyFrequency / detectUncertainty path is exercised.
require.cache[extractorPath] = {
  id: extractorPath, filename: extractorPath, loaded: true,
  exports: {
    extractEvidence: async function () {
      return { core_answer: null, example: null, contexts: [], consequence: null, counter_evidence: [], uncertainty: null };
    },
  },
};

const assessment = require('../model/assessment');
const engine = require('../model/engine');

(async () => {
  let failures = 0;
  const pass = (label, ok, extra) => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${extra ? ' | ' + extra : ''}`);
  };

  // --- Issue 1: یادم نیست / یادم نمیاد → uncertain, advances to next criterion ---
  const state1 = assessment.createStage2Assessment('qa1', 'fa');
  state1.screening = 'positive';
  let step1 = assessment.begin(state1);
  pass('Issue 1: begin returns first criterion', step1.criterionId === 'INATT_01', `cid=${step1.criterionId}`);

  // Answer "یادم نیست" — LLM returns null core_answer, classifyFrequency returns null,
  // detectUncertainty returns a note → record marked uncertain, advances to next criterion.
  const res1 = await assessment.processTurn(state1, 'یادم نیست');
  const rec1 = state1.criteria['INATT_01'];
  pass('Issue 1: INATT_01 marked uncertain', rec1 && rec1.status === 'uncertain', `status=${rec1 && rec1.status}`);
  pass('Issue 1: INATT_01 uncertainty note recorded', rec1 && rec1.uncertainty && rec1.uncertainty.length > 0, `unc=${rec1 && rec1.uncertainty}`);
  pass('Issue 1: criterion_done=true', res1.criterion_done === true);
  pass('Issue 1: advanced to next criterion (pending.cid=INATT_02)', state1.pending && state1.pending.cid === 'INATT_02', `pending.cid=${state1.pending && state1.pending.cid}`);
  pass('Issue 1: next question is a core question', !res1.followup, `followup=${res1.followup}`);

  // Answer "یادم نمیاد" on the second criterion — same path.
  const res2 = await assessment.processTurn(state1, 'یادم نمیاد');
  const rec2 = state1.criteria['INATT_02'];
  pass('Issue 1: INATT_02 marked uncertain', rec2 && rec2.status === 'uncertain', `status=${rec2 && rec2.status}`);
  pass('Issue 1: advances to INATT_03', state1.pending && state1.pending.cid === 'INATT_03', `pending.cid=${state1.pending && state1.pending.cid}`);

  // --- Issue 2: هرگز → Never → unsupported ---
  const state2 = assessment.createStage2Assessment('qa2', 'fa');
  state2.screening = 'positive';
  let step2 = assessment.begin(state2);
  const res3 = await assessment.processTurn(state2, 'هرگز');
  const rec3 = state2.criteria['INATT_01'];
  pass('Issue 2: هرگز → core_answer=Never', rec3 && rec3.core_answer === 'Never', `core_answer=${rec3 && rec3.core_answer}`);
  pass('Issue 2: هرگز → status=unsupported', rec3 && rec3.status === 'unsupported', `status=${rec3 && rec3.status}`);
  pass('Issue 2: advances to next criterion (pending.cid=INATT_02)', state2.pending && state2.pending.cid === 'INATT_02', `pending.cid=${state2.pending && state2.pending.cid}`);
  pass('Issue 2: status=unsupported in response', res3.status === 'unsupported', `status=${res3.status}`);

  // --- Issue 3: بدون صبرتن → بدون صبر ---
  const q = locales.criterionQuestion('HYPERR_06', 'fa');
  pass('Issue 3: HYPERR_06 does NOT contain صبرتن', !q.includes('صبرتن'));
  pass('Issue 3: HYPERR_06 contains بدون صبر', q.includes('بدون صبر'));

  // --- Additional normalization robustness ---
  pass('Norm: هرگز. → Never', locales.classifyFrequency('هرگز.') === 'Never');
  pass('Norm: هرگز! → Never', locales.classifyFrequency('هرگز!') === 'Never');
  pass('Norm: هر گز → Never', locales.classifyFrequency('هر گز') === 'Never');
  pass('Norm: classifyYesNo(نه‌ای) → false', locales.classifyYesNo('نه‌ای') === false);
  pass('Norm: detectUncertainty(یادم نیست) in fa', !!locales.detectUncertainty('یادم نیست', 'fa'));
  pass('Norm: detectUncertainty(یادم نمیاد) in fa', !!locales.detectUncertainty('یادم نمیاد', 'fa'));

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
