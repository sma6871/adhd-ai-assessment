'use strict';
// Phase 2 end-to-end test: drives the FULL pipeline through the public assessment flow
// (processTurn) — ASRS/Stage2 → Childhood → Impairment → Differential → Report.
// Verifies: no stage skipped/repeated, report only after all stages, Stage 2 does not jump to REPORT.
// Uses injected FAKE extractors — no real LLM calls.

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const extractorPath = require.resolve(path.join(ROOT, 'interviewer/interviewer.js'));

const assessment = require(path.join(ROOT, 'model/assessment'));
const engine = require(path.join(ROOT, 'model/engine'));

function setFake(fn) {
  require.cache[extractorPath].exports = { extractEvidence: fn };
}

// Set up a fake extractor that handles ALL stages (childhood, impairment, differential, Stage 2).
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
    // counter_evidence for SPECIFIC criteria only (not all) to preserve symptomatic pattern.
    // config.counterEvidenceMap: { [criterionId]: [counter_evidence items] }
    const id = criterion.id;
    if (config.extractionError && config.extractionError.includes(id)) throw new Error('simulated error');
    if (config.special && id in config.special) return config.special[id];
    return { core_answer: config.stage2Core, example: 'concrete example for ' + id, contexts: ['work', 'home'], consequence: 'costs focus/deadlines', counter_evidence: (config.counterEvidenceMap && config.counterEvidenceMap[id]) || [], uncertainty: null };
  });
}

async function runFullPipeline(config) {
  delete require.cache[require.resolve(path.join(ROOT, 'model/assessment'))];
  const A = require(path.join(ROOT, 'model/assessment'));
  const state = A.createStage2Assessment('e2e-pipeline');
  state.screening = 'positive'; // ASRS gate
  A.begin(state);
  const transitions = [];
  for (let t = 0; t < 500; t++) {
    const r = await A.processTurn(state, config.answer || 'Often, for example when I...');
    if (r.transitioned) transitions.push(r.stage);
    if (r.completed) break;
  }
  return { state, transitions };
}

(async () => {
  let failures = 0;
  const pass = (label, ok, extra) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${extra ? ' | ' + extra : ''}`); };

  // ========================================================================
  // TEST 1: Full pipeline — stage order, no skips, no repeats
  // ========================================================================
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
    answer: 'Often, for example when I...',
  });

  let { state: s1, transitions: t1 } = await runFullPipeline({});
  // Stage order: ADULT_SYMPTOMS → CHILDHOOD → IMPAIRMENT → DIFFERENTIAL → REPORT
  const stageOrderOk = JSON.stringify(t1) === JSON.stringify(['CHILDHOOD', 'IMPAIRMENT', 'DIFFERENTIAL', 'REPORT']);
  pass('Pipeline: stage order CHILDHOOD→IMPAIRMENT→DIFFERENTIAL→REPORT (no skips/repeats)', stageOrderOk, `transitions=${JSON.stringify(t1)} stage=${s1.stage}`);

  // Report only available after all stages
  const reportOk = s1.stage === 'REPORT' && s1.report !== null && s1.report.not_a_diagnosis === true;
  pass('Pipeline: report generated only after all stages complete', reportOk, `stage=${s1.stage} report=${!!s1.report}`);

  // Key fields populated
  const fieldsOk = s1.onset === 'strong'
    && s1.domains_impaired.length === 2 && s1.settings.length === 2
    && s1.differentials_flagged.length === 2 && s1.duration === 'met'
    && s1.differential && s1.differential.evidence !== null;
  pass('Pipeline: all stage outputs populated', fieldsOk, `onset=${s1.onset} domains=${s1.domains_impaired.length} settings=${s1.settings.length} diffs=${s1.differentials_flagged.length} duration=${s1.duration} evidence=${!!s1.differential.evidence}`);

  // Full report evaluation
  const rep1 = s1.report;
  const evalOk = rep1.dsm5_criteria.A_symptom_count === 'supported'
    && rep1.dsm5_criteria.C_onset === 'supported'
    && rep1.dsm5_criteria.D_settings === 'supported'
    && rep1.dsm5_criteria.E_impairment === 'supported'
    && rep1.dsm5_criteria.F_not_better_explained === 'partially_supported' // flagged but not strong
    && rep1.consistency.consistent === true && rep1.tier === 'Consistent';
  pass('Pipeline: full report evaluation (all DSM-5 criteria supported)', evalOk,
    `A=${rep1.dsm5_criteria.A_symptom_count} C=${rep1.dsm5_criteria.C_onset} D=${rep1.dsm5_criteria.D_settings} E=${rep1.dsm5_criteria.E_impairment} F=${rep1.dsm5_criteria.F_not_better_explained} tier=${rep1.tier}`);

   // ========================================================================
  // TEST 1.5: Protocol tier regression (§9d): symptomatic pattern + onset=insufficient
  // → Partially consistent, NOT Insufficient. Only evidence_against onset triggers Insufficient.
  // ========================================================================
   setupFullExtractor({
     stage2Core: 'Often',
     childhoodMemories: [
       { behavior: 'diagnosed with ADHD at 14, very hyper in high school', age: 14, source: 'memory', concrete: true, against: false, vague: false },
     ],
     impairment: {
       domains: { domains_impaired: [{ domain: 'Work', example: 'missed deadlines', concrete: true }], settings: [], uncertainty: null },
       settings: { domains_impaired: [], settings: [{ setting: 'work', example: 'office', concrete: true }, { setting: 'home', example: 'dinner', concrete: true }], uncertainty: null },
     },
     factors: {},
   });
   let { state: s1b, transitions: t1b } = await runFullPipeline({});
   const rep1b = s1b.report;
   const onsetInsuffNotInsufficient = rep1b.tier === 'Partially consistent'
     && rep1b.consistency.insufficient === false
     && rep1b.consistency.partially_consistent === true
     && s1b.onset === 'insufficient';
   pass('Pipeline: symptomatic + onset=insufficient → Partially consistent (NOT Insufficient)', onsetInsuffNotInsufficient,
     `onset=${s1b.onset} tier=${rep1b.tier} insufficient=${rep1b.consistency.insufficient} partially_consistent=${rep1b.consistency.partially_consistent}`);

   // ========================================================================
   // TEST 2: getReport returns null before REPORT
  // ========================================================================
  setupFullExtractor({
    stage2Core: 'Often',
    childhoodMemories: [],
    impairment: {
      domains: { domains_impaired: [], settings: [], uncertainty: null },
      settings: { domains_impaired: [], settings: [], uncertainty: null },
    },
    factors: {},
  });
  delete require.cache[require.resolve(path.join(ROOT, 'model/assessment'))];
  const A2 = require(path.join(ROOT, 'model/assessment'));
  const s2 = A2.createStage2Assessment('e2e-getreport');
  A2.begin(s2);
  // Run just 5 turns of Stage 2 (not enough for completion)
  for (let i = 0; i < 5; i++) { await A2.processTurn(s2, 'Often'); }
  const reportNull = A2.getReport(s2) === null;
  pass('Pipeline: getReport returns null before all stages complete', reportNull, `stage=${s2.stage}`);

  // ========================================================================
  // TEST 3: Strong differential (symptom_mentions) → F = not_supported → not Consistent
  // ========================================================================
  setupFullExtractor({
    stage2Core: 'Often',
    childhoodMemories: [
      { behavior: 'teacher noted fidgeting', age: 7, source: 'teacher', concrete: true, against: false, vague: false },
    ],
    impairment: {
      domains: { domains_impaired: [{ domain: 'Work', example: 'missed deadlines', concrete: true }], settings: [], uncertainty: null },
      settings: { domains_impaired: [], settings: [{ setting: 'work', example: 'office', concrete: true }, { setting: 'home', example: 'dinner', concrete: true }], uncertainty: null },
    },
    factors: { anxiety: { reported: true, symptom_mentions: ['anxiety makes it hard to focus'] } },
  });

  let { state: s3 } = await runFullPipeline({});
  const rep3 = s3.report;
  const strongDiffOk = rep3.dsm5_criteria.F_not_better_explained === 'not_supported'
    && rep3.consistency.consistent === false
    && rep3.tier === 'Partially consistent'
    && rep3.differential_note && rep3.differential_note.includes('(tied to ADHD-like symptoms)');
  pass('Pipeline: strong differential (symptom_mentions) → F=not_supported, tier=Partially consistent', strongDiffOk,
    `F=${rep3.dsm5_criteria.F_not_better_explained} consistent=${rep3.consistency.consistent} tier=${rep3.tier}`);

  // ========================================================================
  // TEST 4: Contradictions prevent Consistent tier (H7)
  // ========================================================================
  setupFullExtractor({
    stage2Core: 'Often',
    childhoodMemories: [
      { behavior: 'teacher noted attention issues', age: 7, source: 'teacher', concrete: true, against: false, vague: false },
    ],
    impairment: {
      domains: { domains_impaired: [{ domain: 'Work', example: 'missed deadlines', concrete: true }, { domain: 'Relationships', example: 'forgot anniversary', concrete: true }], settings: [], uncertainty: null },
      settings: { domains_impaired: [], settings: [{ setting: 'work', example: 'office', concrete: true }, { setting: 'home', example: 'dinner', concrete: true }], uncertainty: null },
    },
    factors: {},
    counterEvidenceMap: { INATT_09: ['I keep a strict calendar and rarely miss deadlines at work'] },
  });

  let { state: s4 } = await runFullPipeline({});
  const rep4 = s4.report;
  const contraOk = rep4.consistency.consistent === false
    && rep4.consistency.partially_consistent === true
    && rep4.tier === 'Partially consistent'
    && rep4.contradictions.count >= 1
    && rep4.contradiction_note && rep4.contradiction_note.includes('strict calendar');
  pass('Pipeline: contradictions prevent Consistent → Partially consistent', contraOk,
    `consistent=${rep4.consistency.consistent} tier=${rep4.tier} contradictions=${rep4.contradictions.count}`);

  // ========================================================================
  // TEST 5: Mixed childhood evidence → onset=weak (H3), not evidence_against
  // ========================================================================
  setupFullExtractor({
    stage2Core: 'Often',
    childhoodMemories: [
      { behavior: 'was attentive and organized as a child', age: 8, source: 'report_card', concrete: true, against: true, vague: false },
      { behavior: 'frequently lost homework', age: 7, source: 'teacher', concrete: true, against: false, vague: false },
    ],
    impairment: {
      domains: { domains_impaired: [{ domain: 'Work', example: 'missed deadlines', concrete: true }], settings: [], uncertainty: null },
      settings: { domains_impaired: [], settings: [{ setting: 'work', example: 'office', concrete: true }, { setting: 'home', example: 'dinner', concrete: true }], uncertainty: null },
    },
    factors: {},
  });

  let { state: s5 } = await runFullPipeline({});
  const rep5 = s5.report;
  const mixedOk = s5.onset === 'weak'
    && rep5.contradictions.count >= 1  // against memory is a contradiction
    && rep5.contradiction_note && rep5.contradiction_note.includes('was attentive and organized');
  pass('Pipeline: mixed childhood evidence → onset=weak (H3), contradiction recorded', mixedOk,
    `onset=${s5.onset} contradictions=${rep5.contradictions.count}`);

  // ========================================================================
  // TEST 6: Age >= 12 childhood memory excluded (H2)
  // ========================================================================
  setupFullExtractor({
    stage2Core: 'Often',
    childhoodMemories: [
      { behavior: 'diagnosed with ADHD at 14, very hyper in high school', age: 14, source: 'memory', concrete: true, against: false, vague: false },
    ],
    impairment: {
      domains: { domains_impaired: [{ domain: 'Work', example: 'missed deadlines', concrete: true }], settings: [], uncertainty: null },
      settings: { domains_impaired: [], settings: [{ setting: 'work', example: 'office', concrete: true }, { setting: 'home', example: 'dinner', concrete: true }], uncertainty: null },
    },
    factors: {},
  });

  let { state: s6 } = await runFullPipeline({});
  const rep6 = s6.report;
  const ageOk = s6.onset === 'insufficient'  // age=14 excluded, no qualifying childhood evidence
    && s6.childhood.evidence.some(m => m.age === 14 && m.concrete);  // age preserved in evidence
  pass('Pipeline: age >= 12 childhood memory excluded from onset (H2)', ageOk,
    `onset=${s6.onset} evidence=${JSON.stringify(s6.childhood.evidence.map(m => ({ age: m.age, concrete: m.concrete })))}`);

  // ========================================================================
  // TEST 7: Stage 2 does NOT jump to REPORT on completion
  // ========================================================================
  setupFullExtractor({
    stage2Core: 'Often',
    childhoodMemories: [{ behavior: 'hyperactive', age: 7, source: 'memory', concrete: true, against: false, vague: false }],
    impairment: {
      domains: { domains_impaired: [{ domain: 'Work', example: 'x', concrete: true }], settings: [], uncertainty: null },
      settings: { domains_impaired: [], settings: [{ setting: 'work', example: 'x', concrete: true }, { setting: 'home', example: 'y', concrete: true }], uncertainty: null },
    },
    factors: {},
  });

  delete require.cache[require.resolve(path.join(ROOT, 'model/assessment'))];
  const A7 = require(path.join(ROOT, 'model/assessment'));
  const s7 = A7.createStage2Assessment('e2e-no-report');
  A7.begin(s7);
  let stage2Done = false;
  for (let t = 0; t < 300; t++) {
    const r = await A7.processTurn(s7, 'Often, for example...');
    if (r.stage === 'CHILDHOOD' || (r.stage === 'IMPAIRMENT' && !stage2Done)) {
      // Stage 2 just completed and transitioned
      if (r.stage === 'CHILDHOOD') stage2Done = true;
    }
    if (r.stage === 'CHILDHOOD') {
      // Verify: Stage 2 is NOT in REPORT; should be CHILDHOOD
      const notReport = s7.stage === 'CHILDHOOD' && s7.report === null;
      pass('Stage 2 completion → transitions to CHILDHOOD, NOT REPORT', notReport,
        `stage=${s7.stage} report=${s7.report}`);
      break;
    }
    if (r.completed) break;
  }

  // ========================================================================
  // TEST 8: Stage 2 → CHILDHOOD transition response contains the first childhood question/probe
  // ========================================================================
  setupFullExtractor({
    stage2Core: 'Often',
    childhoodMemories: [{ behavior: 'hyperactive', age: 7, source: 'memory', concrete: true, against: false, vague: false }],
    impairment: {
      domains: { domains_impaired: [{ domain: 'Work', example: 'x', concrete: true }], settings: [], uncertainty: null },
      settings: { domains_impaired: [], settings: [{ setting: 'work', example: 'x', concrete: true }, { setting: 'home', example: 'y', concrete: true }], uncertainty: null },
    },
    factors: {},
  });

  delete require.cache[require.resolve(path.join(ROOT, 'model/assessment'))];
  const A8 = require(path.join(ROOT, 'model/assessment'));
  const s8 = A8.createStage2Assessment('e2e-transition-s2c');
  s8.screening = 'positive';
  A8.begin(s8);
  let transitionResp = null;
  for (let t = 0; t < 300; t++) {
    const r = await A8.processTurn(s8, 'Often, for example...');
    if (r.stage === 'CHILDHOOD') { transitionResp = r; break; }
    if (r.completed) break;
  }
  const s2cOk = transitionResp
    && transitionResp.transitioned === true
    && transitionResp.stage === 'CHILDHOOD'
    && typeof transitionResp.question === 'string' && transitionResp.question.length > 0
    && transitionResp.probeId === engine.CHILDHOOD_PROBES[0].id
    && transitionResp.kind === 'childhood'
    && transitionResp.first === true
    && transitionResp.onset === null
    && transitionResp.criterion_done === true
    && typeof transitionResp.criterionId === 'string';
  pass('Transition: Stage 2 → CHILDHOOD includes first childhood question/probe', s2cOk,
    `stage=${transitionResp?.stage} question=${typeof transitionResp?.question} probeId=${transitionResp?.probeId} kind=${transitionResp?.kind} first=${transitionResp?.first} onset=${transitionResp?.onset} criterion_done=${transitionResp?.criterion_done}`);

  // ========================================================================
  // TEST 9: Stage 3 → IMPAIRMENT transition response contains the first impairment question
  // ========================================================================
  let transitionResp34 = null;
  for (let t = 0; t < 500; t++) {
    const r = await A8.processTurn(s8, 'I had trouble sitting still in class, age 7');
    if (r.stage === 'IMPAIRMENT') { transitionResp34 = r; break; }
    if (r.completed) break;
  }
  const c34Ok = transitionResp34
    && transitionResp34.transitioned === true
    && transitionResp34.stage === 'IMPAIRMENT'
    && typeof transitionResp34.question === 'string' && transitionResp34.question.length > 0
    && transitionResp34.probeId === 'domains'
    && transitionResp34.kind === 'impairment'
    && transitionResp34.first === true
    && typeof transitionResp34.onset === 'string';
  pass('Transition: Stage 3 → IMPAIRMENT includes first impairment question', c34Ok,
    `stage=${transitionResp34?.stage} question=${typeof transitionResp34?.question} probeId=${transitionResp34?.probeId} kind=${transitionResp34?.kind} first=${transitionResp34?.first} onset=${transitionResp34?.onset}`);

  // ========================================================================
  // TEST 10: Stage 4 → DIFFERENTIAL transition response contains the first differential question
  // ========================================================================
  let transitionResp45 = null;
  for (let t = 0; t < 500; t++) {
    const r = await A8.processTurn(s8, 'Work performance impaired, relationships strained. At work and at home.');
    if (r.stage === 'DIFFERENTIAL') { transitionResp45 = r; break; }
    if (r.completed) break;
  }
  const c45Ok = transitionResp45
    && transitionResp45.transitioned === true
    && transitionResp45.stage === 'DIFFERENTIAL'
    && typeof transitionResp45.question === 'string' && transitionResp45.question.length > 0
    && transitionResp45.probeId === engine.DIFFERENTIAL_FACTORS[0].id
    && transitionResp45.kind === 'differential'
    && transitionResp45.first === true;
  pass('Transition: Stage 4 → DIFFERENTIAL includes first differential question', c45Ok,
    `stage=${transitionResp45?.stage} question=${typeof transitionResp45?.question} probeId=${transitionResp45?.probeId} kind=${transitionResp45?.kind} first=${transitionResp45?.first}`);

  // ========================================================================
  // TEST 11: Every transition response (all 4) has the required fields
  // ========================================================================
  setupFullExtractor({
    stage2Core: 'Often',
    childhoodMemories: [{ behavior: 'hyperactive', age: 7, source: 'memory', concrete: true, against: false, vague: false }],
    impairment: {
      domains: { domains_impaired: [{ domain: 'Work', example: 'missed deadlines', concrete: true }, { domain: 'Relationships', example: 'forgot anniversary', concrete: true }], settings: [], uncertainty: null },
      settings: { domains_impaired: [], settings: [{ setting: 'work', example: 'office', concrete: true }, { setting: 'home', example: 'dinner', concrete: true }], uncertainty: null },
    },
    factors: { anxiety: { reported: false } },
    answer: 'Often, for example when I...',
  });

  const { state: s11, transitions: t11 } = await runFullPipeline({});
  const allTransOk = t11.length === 4
    && typeof s11.report.summary === 'string' && s11.report.summary.length > 0
    && typeof s11.report.recommendation === 'string'
    && typeof s11.report.childhood_onset.rating === 'string';
  pass('Transition: all 4 transitions captured, report has summary', allTransOk,
    `transitions=${JSON.stringify(t11)} summary_len=${s11.report.summary?.length}`);

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
