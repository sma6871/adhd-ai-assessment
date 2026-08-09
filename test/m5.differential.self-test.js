'use strict';
// M5 self-test: Focused differential check (Stage 5) per CLINICAL_ADHD_PROTOCOL.md §7.
// Flagging-only: factor flagged iff user reports it AND an ADHD-like symptom was endorsed in Stage 2.
// Uses an injected FAKE extractor — no real LLM. Does not touch M2/M3/M4 logic.

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const extractorPath = require.resolve(path.join(ROOT, 'interviewer/interviewer.js'));
require.cache[extractorPath] = { id: extractorPath, filename: extractorPath, loaded: true, exports: { extractEvidence: async function () { return { reported: false, uncertainty: null, symptom_mentions: [] }; } } };
const assessment = require(path.join(ROOT, 'model/assessment'));
const engine = require(path.join(ROOT, 'model/engine'));

function setFakeFn(fn) {
  require.cache[extractorPath].exports = { extractEvidence: fn };
}

// State with given Stage 2 core_answer list (18) + optional pre-set differential factors.
function stateWith(cores, factors) {
  const state = assessment.createStage2Assessment('m5');
  let i = 0;
  for (const c of assessment.CRITERIA) {
    state.criteria[c.id] = {
      criterion: c.id, status: 'supported', confidence: 'strong',
      core_answer: cores[i++], example: 'x', contexts: ['work', 'home'], consequence: 'y',
      counter_evidence: [], uncertainty: null, tries: 1, followups: 0, source: 'interview',
    };
  }
  state.differential = { factors: factors || [], probesAsked: 0, done: true };
  return state;
}

(async () => {
  let failures = 0;

  // --- Pure unit checks of flagDifferentials (reads Stage 5 factors + Stage 2 core endorsements only) ---
  const allPos = assessment.CRITERIA.map(() => 'Often');
  const allNeg = assessment.CRITERIA.map(() => 'Never');

  const unit = [
    ['reported + symptom endorsed -> flagged', allPos, [{ factor: 'sleep', reported: true }], ['Sleep problems']],
    ['reported but NO symptom endorsed (all Never) -> not flagged', allNeg, [{ factor: 'sleep', reported: true }], []],
    ['not reported + symptom endorsed -> not flagged', allPos, [{ factor: 'sleep', reported: false }], []],
    ['multiple reported -> multiple flags (deterministic order)', allPos, [{ factor: 'anxiety', reported: true }, { factor: 'depression', reported: true }, { factor: 'medical', reported: false }], ['Anxiety', 'Depression']],
    ['reported but user uncertain -> not flagged', allPos, [{ factor: 'bipolar', reported: false, uncertainty: "I'm not sure" }], []],
    ['extraction-error factor (no record) -> not flagged', allPos, [{ factor: 'substance', reported: false }], []],
  ];
  for (const [label, cores, factors, exp] of unit) {
    const st = stateWith(cores, factors);
    const got = engine.flagDifferentials(st);
    const ok = JSON.stringify(got) === JSON.stringify(exp);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}: flagDifferentials "${label}" -> ${JSON.stringify(got)} (expected ${JSON.stringify(exp)})`);
  }

  // --- Non-inference: flagDifferentials ignores onset/settings (M3/M4 outputs) ---
  const f = [{ factor: 'sleep', reported: true }, { factor: 'anxiety', reported: true }];
  const sOn = stateWith(allPos, f); sOn.onset = 'strong'; sOn.settings = ['work', 'home']; sOn.domains_impaired = ['Work'];
  const sOff = stateWith(allPos, f); sOff.onset = null; sOff.settings = []; sOff.domains_impaired = [];
  const ni = JSON.stringify(engine.flagDifferentials(sOn)) === JSON.stringify(engine.flagDifferentials(sOff));
  const niOk = ni && JSON.stringify(engine.flagDifferentials(sOn)) === '["Sleep problems","Anxiety"]';
  if (!niOk) failures++;
  console.log(`${niOk ? 'PASS' : 'FAIL'}: non-inference — flags identical with onset/settings present vs absent -> ${JSON.stringify(engine.flagDifferentials(sOn))}`);

  // --- Integration: full Stage 5 loop into LOCKED state.differentials_flagged[] ---
  async function runStage5(factorReports) {
    setFakeFn(async function ({ probe }) {
      const rep = factorReports[probe.id] != null ? factorReports[probe.id] : { reported: false };
      return { reported: !!rep.reported, uncertainty: rep.uncertainty || null, symptom_mentions: rep.symptom_mentions || [] };
    });
    delete require.cache[require.resolve(path.join(ROOT, 'model/assessment'))];
    const a3 = require(path.join(ROOT, 'model/assessment'));
    const state = a3.createStage2Assessment('int5');
    // plant Stage 2 positives (symptoms endorsed)
    for (const c of a3.CRITERIA) state.criteria[c.id] = { criterion: c.id, status: 'supported', confidence: 'strong', core_answer: 'Often', example: 'x', contexts: ['work', 'home'], consequence: 'y', counter_evidence: [], uncertainty: null, tries: 1, followups: 0, source: 'interview' };
    delete state.duration; state.duration = engine.deriveDuration(state);
    a3.beginStage5(state);
    let res;
    for (let i = 0; i < 30; i++) {
      res = await a3.processStage5Turn(state, 'user says yes/no about this factor');
      if (res.completed) break;
    }
    return { state, res };
  }

  // positive: 3 factors reported, symptoms endorsed -> 3 flags
  const pos = await runStage5({ anxiety: { reported: true }, sleep: { reported: true }, depression: { reported: true } });
  const posOk = pos.res.completed && pos.state.differentials_flagged.length === 3
    && pos.state.differential.done === true
    && pos.state.differentials_flagged.includes('Anxiety') && pos.state.differentials_flagged.includes('Sleep problems') && pos.state.differentials_flagged.includes('Depression');
  if (!posOk) failures++;
  console.log(`${posOk ? 'PASS' : 'FAIL'}: integration positive -> flagged=${pos.state.differentials_flagged} done=${pos.state.differential.done} completed=${pos.res.completed}`);

  // negative: no factors reported -> 0 flags
  const neg = await runStage5({});
  const negOk = neg.state.differentials_flagged.length === 0 && neg.state.differential.done;
  if (!negOk) failures++;
  console.log(`${negOk ? 'PASS' : 'FAIL'}: integration no factors reported -> flagged=${JSON.stringify(neg.state.differentials_flagged)} (expected [])`);

  // uncertainty: reported=false on all (user says "not sure") -> 0 flags, still completes
  const unc = await runStage5({ anxiety: { reported: false, uncertainty: 'not sure' } });
  const uncOk = unc.state.differentials_flagged.length === 0 && unc.state.differential.done && unc.res.completed;
  if (!uncOk) failures++;
  console.log(`${uncOk ? 'PASS' : 'FAIL'}: integration uncertainty -> flagged=${unc.state.differentials_flagged} done=${unc.state.differential.done}`);

  // extraction-error resilience: throw on every probe -> all reported=false, completes, 0 flags
  setFakeFn(async function () { throw new Error('groq parse error'); });
  delete require.cache[require.resolve(path.join(ROOT, 'model/assessment'))];
  const a3e = require(path.join(ROOT, 'model/assessment'));
  const stateE = a3e.createStage2Assessment('err5');
  for (const c of a3e.CRITERIA) stateE.criteria[c.id] = { criterion: c.id, status: 'supported', confidence: 'strong', core_answer: 'Often', example: 'x', contexts: ['work', 'home'], consequence: 'y', counter_evidence: [], uncertainty: null, tries: 1, followups: 0, source: 'interview' };
  a3e.beginStage5(stateE);
  let resE;
  for (let i = 0; i < 30; i++) { resE = await a3e.processStage5Turn(stateE, 'answer'); if (resE.completed) break; }
  const eOk = resE.completed && stateE.differentials_flagged.length === 0 && stateE.differential.probesAsked === engine.DIFFERENTIAL_FACTORS.length;
  if (!eOk) failures++;
  console.log(`${eOk ? 'PASS' : 'FAIL'}: integration extraction-error -> flagged=${stateE.differentials_flagged.length} probesAsked=${stateE.differential.probesAsked} completed=${resE.completed}`);

  // --- Full regression: Stage 2 -> 3 -> 4 -> 5 pipeline, then §9 evaluation uses §5/§6/§7 outputs. ---
  async function fullPipeline(stage2Core, childhoodMemories, impairmentEvidence, factorReports) {
    require.cache[extractorPath].exports = {
      extractEvidence: async function ({ stage, probe, criterion }) {
        if (stage === 'childhood') return { memories: childhoodMemories, uncertainty: null };
        if (stage === 'impairment') {
          if (probe.id === 'domains') return impairmentEvidence.domains;
          if (probe.id === 'settings') return impairmentEvidence.settings;
          return { domains_impaired: [], settings: [], uncertainty: null };
        }
        if (stage === 'differential') {
          const r = factorReports[probe.id] != null ? factorReports[probe.id] : { reported: false };
          return { reported: !!r.reported, uncertainty: r.uncertainty || null, symptom_mentions: r.symptom_mentions || [] };
        }
        const id = criterion.id;
        if (id === 'HYPERR_05') throw new Error('err');
        if (id === 'INATT_09') return { core_answer: 'Never', example: 'never', contexts: ['home'], consequence: null, counter_evidence: [], uncertainty: null };
        if (id === 'INATT_04') return { core_answer: 'Sometimes', example: 'sometimes', contexts: ['work'], consequence: 'reminder', counter_evidence: [], uncertainty: null };
        return { core_answer: stage2Core, example: 'ex', contexts: ['work', 'home'], consequence: 'cost', counter_evidence: [], uncertainty: null };
      },
    };
    delete require.cache[require.resolve(path.join(ROOT, 'model/assessment'))];
    const A = require(path.join(ROOT, 'model/assessment'));
    const s = A.createStage2Assessment('fullm5');
    A.begin(s);
    // Unified processTurn drives the full pipeline: Stage2 -> 3 -> 4 -> 5 -> Report.
    for (let t = 0; t < 500; t++) { const r = await A.processTurn(s, 'Often, for example...'); if (r.completed) break; }
    return s;
  }

  const full = await fullPipeline(
    'Often',
    [
      { behavior: 'could not sit still, teacher noted', age: 7, source: 'teacher', concrete: true, against: false, vague: false },
      { behavior: 'frequently lost homework', age: 8, source: 'memory', concrete: true, against: false, vague: false },
    ],
    {
      domains: { domains_impaired: [{ domain: 'Work', example: 'missed deadlines in office', concrete: true }, { domain: 'Relationships', example: 'forgot partner anniversary', concrete: true }], settings: [], uncertainty: null },
      settings: { domains_impaired: [], settings: [{ setting: 'work', example: 'office deadlines', concrete: true }, { setting: 'home', example: 'dinner table', concrete: true }], uncertainty: null },
    },
    { sleep: { reported: true }, anxiety: { reported: true }, depression: { reported: false } }
  );
  const eng = require(path.join(ROOT, 'model/engine'));
  const rep = eng.evaluate(full);
  const okFull = full.stage === 'REPORT' && full.report !== null
    && full.differentials_flagged.length === 2
    && full.domains_impaired.length === 2 && full.settings.length === 2
    && rep.dsm5_criteria.D_settings === 'supported' && rep.dsm5_criteria.E_impairment === 'supported'
    && rep.dsm5_criteria.F_not_better_explained === 'partially_supported'  // >=1 differential flagged -> partially (§9b-F)
    && rep.consistency.consistent === true;  // F is partially_supported (not 'not_supported'), so still consistent per §9d
  if (!okFull) failures++;
  console.log(`${okFull ? 'PASS' : 'FAIL'}: full pipeline 2->3->4->5->Report (unified processTurn) -> stage=${full.stage} onset=${full.onset} settings=${JSON.stringify(full.settings)} domains=${JSON.stringify(full.domains_impaired)} differentials=${JSON.stringify(full.differentials_flagged)} D=${rep.dsm5_criteria.D_settings} E=${rep.dsm5_criteria.E_impairment} F=${rep.dsm5_criteria.F_not_better_explained} consistent=${rep.consistency.consistent}`);

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
