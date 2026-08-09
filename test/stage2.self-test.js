'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const extractorPath = require.resolve(path.join(ROOT, 'interviewer/interviewer.js'));

const fake = {
  extractEvidence: async function ({ criterion }) {
    const id = criterion.id;
    if (id === 'HYPERR_09') {
      return { core_answer: 'Often', example: null, contexts: [], consequence: null, counter_evidence: [], uncertainty: 'I cannot think of a specific time.' };
    }
    if (id === 'HYPERR_05') {
      throw new Error('simulated groq parse error');
    }
    if (id === 'INATT_09') {
      return { core_answer: 'Never', example: 'I never forget things', contexts: ['home'], consequence: null, counter_evidence: ['I keep a strict calendar'], uncertainty: null };
    }
    if (id === 'INATT_04') {
      return { core_answer: 'Sometimes', example: 'Sometimes I leave a draft unfinished but usually finish', contexts: ['work'], consequence: 'occasionally a reminder', counter_evidence: [], uncertainty: null };
    }
    return { core_answer: 'Often', example: 'Concrete example for ' + id, contexts: ['work', 'home'], consequence: 'Costs me focus/deadlines.', counter_evidence: [], uncertainty: null };
  },
};

require.cache[extractorPath] = { id: extractorPath, filename: extractorPath, loaded: true, exports: fake };

const assessment = require(path.join(ROOT, 'model/assessment'));
const engine = require(path.join(ROOT, 'model/engine'));

(async () => {
  let failures = 0;
  const pass = (label, ok, extra) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${extra ? ' | ' + extra : ''}`); };

  const state = assessment.createStage2Assessment('e2e-0');
  state.screening = 'positive';
  let step = assessment.begin(state);
  pass('begin returns first criterion question', typeof step.question === 'string' && step.question.length > 0 && step.criterionId === 'INATT_01', `criterionId=${step.criterionId}`);

  let turns = 0;
  const cap = 400;
  while (turns < cap) {
    turns++;
    const ans = turns % 2 === 0 ? 'Often, for example when...' : 'Yeah that happens to me too, here: ...';
    const res = await assessment.processTurn(state, ans);
    if (res.stage === 'CHILDHOOD') break;
  }

  const prog = assessment.getProgress(state);
  pass('Stage 2 transitions to CHILDHOOD (not REPORT)', prog.stage === 'CHILDHOOD', `stage=${prog.stage}`);

  const counts = { supported: 0, partially_supported: 0, unsupported: 0, uncertain: 0 };
  for (const c of assessment.CRITERIA) {
    const s = state.criteria[c.id] && state.criteria[c.id].status;
    if (s) counts[s] = (counts[s] || 0) + 1;
  }
  const countsOk = counts.supported >= 9 && counts.unsupported === 1 && counts.partially_supported === 1;
  pass('Stage 2 status counts: supported >= 9, unsupported 1 (INATT_09/Never), partially 1 (INATT_04/Sometimes)', countsOk, `counts=${JSON.stringify(counts)}`);

  pass('HYPERR_05 (extraction error) -> uncertain', state.criteria['HYPERR_05'].status === 'uncertain', `status=${state.criteria['HYPERR_05'].status}`);
  pass('HYPERR_09 (no example) -> uncertain', state.criteria['HYPERR_09'].status === 'uncertain', `status=${state.criteria['HYPERR_09'].status}`);
  pass('INATT_09 (Never) -> unsupported', state.criteria['INATT_09'].status === 'unsupported', `status=${state.criteria['INATT_09'].status}`);
  pass('INATT_04 (Sometimes, thin) -> partially_supported', state.criteria['INATT_04'].status === 'partially_supported', `status=${state.criteria['INATT_04'].status}`);

  pass('Stage 2 complete -> state.stage === CHILDHOOD', state.stage === 'CHILDHOOD', `stage=${state.stage}`);

  const reportNull = assessment.getReport(state) === null;
  pass('getReport returns null before REPORT stage', reportNull, `report=${assessment.getReport(state)}`);

  const rep = engine.evaluate(state);
  pass('evaluate: tier is Insufficient or Partially consistent (onset=insufficient, not evidence_against)', rep.tier === 'Insufficient' || rep.tier === 'Partially consistent', `tier=${rep.tier} onset=${state.onset || '(not yet set)'}`);
  pass('evaluate: tier is Partially consistent when symptomatic + onset=insufficient', rep.tier === 'Partially consistent', `tier=${rep.tier} consistent=${rep.consistency.consistent} insufficient=${rep.consistency.insufficient}`);
  pass('evaluate: adult_symptoms pattern present', rep.adult_symptoms.pattern !== 'below_threshold', `pattern=${rep.adult_symptoms.pattern}`);
  pass('evaluate: stage2_only note present (Stages 3-5 not done)', !!rep.stage2_only, `stage2_only=${!!rep.stage2_only}`);
  pass('evaluate: disclaimer present', typeof rep.disclaimer === 'string' && rep.disclaimer.length > 0, `disclaimer_len=${rep.disclaimer?.length}`);
  pass('evaluate: not_a_diagnosis flag set', rep.not_a_diagnosis === true);
  pass('evaluate: per_criterion has 18 entries', Array.isArray(rep.per_criterion) && rep.per_criterion.length === 18, `length=${rep.per_criterion?.length}`);

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
