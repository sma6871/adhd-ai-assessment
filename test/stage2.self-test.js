'use strict';
// End-to-end self-test of Stage 2 with a FAKE (injected) extractor.
// Validates: supported/partially/unsupported/uncertain paths + extraction-error resilience,
//              deterministic advancement, and the §9 evaluation. NO real LLM calls.

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const extractorPath = require.resolve(path.join(ROOT, 'interviewer/interviewer.js'));

const fake = {
  extractEvidence: async function ({ criterion }) {
    const id = criterion.id;
    if (id === 'HYPERR_09') {
      // never gives a concrete example -> follow-up cap -> uncertain
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
    // default: fully evidenced, 2 settings -> supported
    return { core_answer: 'Often', example: 'Concrete example for ' + id, contexts: ['work', 'home'], consequence: 'Costs me focus/deadlines.', counter_evidence: [], uncertainty: null };
  },
};

require.cache[extractorPath] = { id: extractorPath, filename: extractorPath, loaded: true, exports: fake };

const assessment = require(path.join(ROOT, 'model/assessment'));
const { CRITERIA } = assessment;

(async () => {
  const state = assessment.createStage2Assessment('e2e-0');
  let step = assessment.begin(state);
  let turns = 0;
  const cap = 400;
  // Drive Stage 2 only — stop when it transitions to CHILDHOOD (per Phase 2 flow, Stage 2
  // completion transitions to CHILDHOOD, NOT REPORT).
  while (turns < cap) {
    turns++;
    const ans = turns % 2 === 0 ? 'Often, for example when...' : 'Yeah that happens to me too, here: ...';
    const res = await assessment.processTurn(state, ans);
    if (res.stage === 'CHILDHOOD') break;
  }

  const prog = assessment.getProgress(state);
  console.log('turns:', turns, 'stage:', prog.stage, 'completed:', prog.completed, '/', prog.total);

  const counts = { supported: 0, partially_supported: 0, unsupported: 0, uncertain: 0 };
  for (const c of CRITERIA) {
    const s = state.criteria[c.id] && state.criteria[c.id].status;
    if (s) counts[s] = (counts[s] || 0) + 1;
  }
  console.log('status counts:', counts);
  console.log('HYPERR_05 (extraction error) ->', state.criteria['HYPERR_05'].status, '| followups:', state.criteria['HYPERR_05'].followups);
  console.log('HYPERR_09 (no example) ->', state.criteria['HYPERR_09'].status);
  console.log('INATT_09 (Never) ->', state.criteria['INATT_09'].status);
  console.log('INATT_04 (Sometimes, thin) ->', state.criteria['INATT_04'].status);

  // Stage 2 complete -> transitioned to CHILDHOOD (not REPORT, per Phase 2 flow).
  console.log('stage after Stage 2:', state.stage);
  // getReport returns null before REPORT stage; evaluate directly for stage2_only check.
  const { evaluate } = require(path.join(ROOT, 'model/engine'));
  const rep = evaluate(state);
  console.log('TIER:', rep.tier);
  console.log('pattern:', rep.adult_symptoms.pattern,
    '| inatt_sup:', rep.adult_symptoms.inattentive_supported,
    '| hyper_sup:', rep.adult_symptoms.hyperactive_supported);
  console.log('DSM5 C_onset:', rep.dsm5_criteria.C_onset,
    '| D_settings:', rep.dsm5_criteria.D_settings,
    '| E_impairment:', rep.dsm5_criteria.E_impairment,
    '| F_not_better:', rep.dsm5_criteria.F_not_better_explained);
  console.log('stage2_only note present:', !!rep.stage2_only);
  console.log('disclaimer:', rep.disclaimer);
  // Verify Phase 2: NOT in REPORT stage, so getReport returns null.
  console.log('getReport returns null (pre-REPORT):', assessment.getReport(state) === null);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
