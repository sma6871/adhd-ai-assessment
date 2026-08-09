'use strict';
// M6 self-test: flagDifferentialEvidence + §9b-F strongly-vs-partial + §9f summary/notes fields.
// Uses injected FAKE extractors — no real LLM calls. Does not touch M1–M5 logic.

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const extractorPath = require.resolve(path.join(ROOT, 'interviewer/interviewer.js'));

const assessment = require(path.join(ROOT, 'model/assessment'));
const engine = require(path.join(ROOT, 'model/engine'));
const { CRITERIA } = assessment;

function setFakeFn(fn) {
  require.cache[extractorPath].exports = { extractEvidence: fn };
}

// Build a state with planted Stage 2/3/4/5 evidence for evaluate() tests.
function buildFullState(opts) {
  const state = assessment.createStage2Assessment('m6');
  state.stage = 'REPORT';

  // Stage 2: plant criteria with given statuses.
  const { inattSupported = 5, hyperSupported = 0, coreAnswer = 'Often', coreOverride = null } = opts.stage2 || {};
  const counterEvidence = opts.counterEvidence || null;
  let i = 0;
  for (const c of CRITERIA) {
    const isAtt = c.id.startsWith('INATT_');
    const isHyper = c.id.startsWith('HYPERR_');
    let status = 'uncertain';
    let core_answer = 'Never';
    if (isAtt && i < inattSupported) { status = 'supported'; core_answer = coreAnswer; }
    if (isHyper && i - inattSupported < hyperSupported) { status = 'supported'; core_answer = coreAnswer; }
    i++;
    const rec = { criterion: c.id, status, confidence: 'strong', core_answer, example: 'ex', contexts: ['work'], consequence: 'y', counter_evidence: [], uncertainty: null, tries: 1, followups: 0, source: 'interview' };
    if (counterEvidence && c.id === (counterEvidence.criterion || 'INATT_09')) {
      rec.counter_evidence = counterEvidence.items || [];
    }
    if (coreOverride && c.id === coreOverride.criterion) {
      rec.core_answer = coreOverride.value;
    }
    state.criteria[c.id] = rec;
  }

  // Stage 3: onset
  state.onset = opts.onset || 'strong';
  // Stage 4: settings + domains
  state.settings = opts.settings || ['work', 'home'];
  state.domains_impaired = opts.domains || ['Work'];
  // Duration
  state.duration = opts.duration || 'met';
  // Stage 5: differential factors (with symptom_mentions for strong alternatives)
  const factors = (opts.factors || []).map(f => ({
    factor: f.factor,
    reported: !!f.reported,
    uncertainty: f.uncertainty || null,
    symptom_mentions: Array.isArray(f.symptom_mentions) ? f.symptom_mentions : [],
  }));
  state.differential = { factors, probesAsked: factors.length, done: true, evidence: null };
  if (opts.finalizeStage5 !== false) {
    state.differential.evidence = engine.flagDifferentialEvidence(state);
    state.differentials_flagged = state.differential.evidence.flagged;
  }
  return state;
}

(async () => {
  let failures = 0;
  const pass = (label, ok, extra) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${extra ? ' -> ' + extra : ''}`); };

  // ========================================================================
  // PART 1: flagDifferentialEvidence unit tests (pure function)
  // ========================================================================

  // 1. reported + symptom_mentions -> flagged + strong + could_explain=true
  let st = buildFullState({ stage2: { inattSupported: 5 }, factors: [{ factor: 'anxiety', reported: true, symptom_mentions: ['anxiety makes it hard to focus'] }] });
  let ev = engine.flagDifferentialEvidence(st);
  let ok = ev.flagged.includes('Anxiety') && ev.strong.includes('Anxiety')
    && ev.considerations.some(x => x.factor === 'Anxiety' && x.could_explain_for_symptoms === true);
  pass('flagDifferentialEvidence: reported + symptom_mentions -> strong', ok, JSON.stringify(ev));

  // 2. reported + NO symptom_mentions -> flagged but NOT strong, could_explain=false
  st = buildFullState({ stage2: { inattSupported: 5 }, factors: [{ factor: 'sleep', reported: true, symptom_mentions: [] }] });
  ev = engine.flagDifferentialEvidence(st);
  ok = ev.flagged.includes('Sleep problems') && !ev.strong.includes('Sleep problems')
    && ev.considerations.some(x => x.factor === 'Sleep problems' && x.could_explain_for_symptoms === false);
  pass('flagDifferentialEvidence: reported, no symptom_mentions -> not strong', ok, JSON.stringify(ev));

  // 3. not reported -> not in considerations at all
  st = buildFullState({ stage2: { inattSupported: 5 }, factors: [{ factor: 'depression', reported: false, symptom_mentions: [] }] });
  ev = engine.flagDifferentialEvidence(st);
  ok = ev.flagged.length === 0 && ev.strong.length === 0 && ev.considerations.length === 0;
  pass('flagDifferentialEvidence: not reported -> not considered', ok, JSON.stringify(ev));

  // 4. reported but NO Stage 2 symptom endorsed -> not flagged (flagDifferentials gate)
  st = buildFullState({ stage2: { inattSupported: 0, hyperSupported: 0 }, factors: [{ factor: 'anxiety', reported: true, symptom_mentions: ['hard to focus'] }] });
  ev = engine.flagDifferentialEvidence(st);
  ok = ev.flagged.length === 0 && ev.strong.length === 0;
  pass('flagDifferentialEvidence: reported but no Stage2 symptom -> not flagged', ok, JSON.stringify(ev));

  // 5. multiple factors, mixed -> correct strong list (deterministic order)
  st = buildFullState({ stage2: { inattSupported: 5 }, factors: [
    { factor: 'sleep', reported: true, symptom_mentions: ['sleep issues ruin my focus'] },
    { factor: 'anxiety', reported: true, symptom_mentions: [] },
    { factor: 'depression', reported: false, symptom_mentions: ['depression affects energy'] },
    { factor: 'medical', reported: true, symptom_mentions: ['thyroid med affects attention'] },
  ]});
  ev = engine.flagDifferentialEvidence(st);
  ok = JSON.stringify(ev.flagged) === JSON.stringify(['Sleep problems', 'Anxiety', 'Medical / physical'])
    && JSON.stringify(ev.strong) === JSON.stringify(['Sleep problems', 'Medical / physical']);
  pass('flagDifferentialEvidence: mixed factors -> correct strong list', ok, JSON.stringify(ev));

  // ========================================================================
  // PART 2: §9b-F strongly-vs-partial (the stronglyExplanatory branch)
  // ========================================================================

  // 6. strong alternative (symptom_mentions) -> F = not_supported
  st = buildFullState({
    stage2: { inattSupported: 5, core_answer: 'Often' },
    onset: 'strong', settings: ['work', 'home'], domains: ['Work', 'Relationships'], duration: 'met',
    factors: [{ factor: 'anxiety', reported: true, symptom_mentions: ['anxiety makes it hard to focus'] }],
  });
  let rep = engine.evaluate(st);
  ok = rep.dsm5_criteria.F_not_better_explained === 'not_supported';
  pass('evaluate: strong alternative -> F = not_supported', ok, `F=${rep.dsm5_criteria.F_not_better_explained}`);

  // 7. strong alternative -> consistency.consistent = false, tier = 'Partially consistent'
  ok = rep.consistency.consistent === false && rep.consistency.insufficient === false
    && rep.tier === 'Partially consistent';
  pass('evaluate: strong alternative -> not consistent, tier=Partially consistent', ok, `consistent=${rep.consistency.consistent} tier=${rep.tier}`);

  // 8. no strong, but flagged differentials -> F = partially_supported (existing M5 behavior)
  st = buildFullState({
    stage2: { inattSupported: 5, core_answer: 'Often' },
    onset: 'strong', settings: ['work', 'home'], domains: ['Work', 'Relationships'], duration: 'met',
    factors: [{ factor: 'sleep', reported: true, symptom_mentions: [] }, { factor: 'anxiety', reported: true, symptom_mentions: [] }],
  });
  rep = engine.evaluate(st);
  ok = rep.dsm5_criteria.F_not_better_explained === 'partially_supported' && rep.consistency.consistent === true;
  pass('evaluate: flagged only (no strong) -> F = partially_supported, still consistent', ok, `F=${rep.dsm5_criteria.F_not_better_explained} consistent=${rep.consistency.consistent}`);

  // 9. no differentials at all -> F = supported, consistent
  st = buildFullState({
    stage2: { inattSupported: 5, core_answer: 'Often' },
    onset: 'strong', settings: ['work', 'home'], domains: ['Work'], duration: 'met',
    factors: [],
  });
  rep = engine.evaluate(st);
  ok = rep.dsm5_criteria.F_not_better_explained === 'supported' && rep.consistency.consistent === true;
  pass('evaluate: no differentials -> F = supported, consistent', ok, `F=${rep.dsm5_criteria.F_not_better_explained}`);

  // ========================================================================
  // PART 3: §9f summary, differential_note, contradiction_note
  // ========================================================================

  // 10. differential_note surfaces strong factors
  st = buildFullState({
    stage2: { inattSupported: 5, core_answer: 'Often' },
    onset: 'strong', settings: ['work', 'home'], domains: ['Work', 'Relationships'], duration: 'met',
    factors: [{ factor: 'sleep', reported: true, symptom_mentions: ['sleep issues ruin my focus'] }],
  });
  rep = engine.evaluate(st);
  ok = rep.differential_note && rep.differential_note.includes('Sleep problems')
    && rep.differential_note.includes('(tied to ADHD-like symptoms)');
  pass('evaluate: differential_note surfaces strong factor', ok, JSON.stringify(rep.differential_note));

  // 11. differential_note with non-strong factor (no "(tied to..." marker)
  st = buildFullState({
    stage2: { inattSupported: 5, core_answer: 'Often' },
    onset: 'strong', settings: ['work', 'home'], domains: ['Work'], duration: 'met',
    factors: [{ factor: 'sleep', reported: true, symptom_mentions: [] }],
  });
  rep = engine.evaluate(st);
  ok = rep.differential_note && rep.differential_note.includes('Sleep problems')
    && !rep.differential_note.includes('(tied to ADHD-like symptoms)');
  pass('evaluate: differential_note (non-strong) -> no symptom marker', ok, JSON.stringify(rep.differential_note));

  // 12. contradiction_note from per-criterion counter_evidence
  st = buildFullState({
    stage2: { inattSupported: 5, core_answer: 'Often' },
    onset: 'strong', settings: ['work', 'home'], domains: ['Work'], duration: 'met',
    factors: [],
    counterEvidence: { criterion: 'INATT_09', items: ['I use a strict calendar and reminder system'] },
  });
  rep = engine.evaluate(st);
  ok = rep.contradiction_note && rep.contradiction_note.includes('I use a strict calendar')
    && rep.contradictions.count === 1 && rep.contradictions.list[0].includes('INATT_09');
  pass('evaluate: contradiction_note from counter_evidence', ok, JSON.stringify(rep.contradiction_note));

  // 13. contradiction_note from onset evidence_against
  st = buildFullState({
    stage2: { inattSupported: 5, core_answer: 'Often' },
    onset: 'evidence_against', settings: ['work', 'home'], domains: ['Work'], duration: 'met',
    factors: [],
  });
  rep = engine.evaluate(st);
  ok = rep.contradiction_note && rep.contradiction_note.includes('Childhood evidence suggests')
    && rep.contradictions.count === 1 && rep.contradictions.list[0].includes('Childhood evidence');
  pass('evaluate: contradiction_note from onset evidence_against', ok, JSON.stringify(rep.contradiction_note));

  // 14. no contradictions -> contradiction_note = null
  st = buildFullState({
    stage2: { inattSupported: 5, core_answer: 'Often' },
    onset: 'strong', settings: ['work', 'home'], domains: ['Work'], duration: 'met',
    factors: [],
  });
  rep = engine.evaluate(st);
  ok = rep.contradiction_note === null && rep.contradictions.count === 0;
  pass('evaluate: no contradictions -> contradiction_note = null', ok, `note=${rep.contradiction_note} count=${rep.contradictions.count}`);

  // 15. summary field composition (tier text + notes + disclaimer)
  st = buildFullState({
    stage2: { inattSupported: 7, core_answer: 'Often' },
    onset: 'strong', settings: ['work', 'home'], domains: ['Work', 'Relationships'], duration: 'met',
    factors: [{ factor: 'sleep', reported: true, symptom_mentions: ['sleep issues ruin my focus'] }],
    counterEvidence: { criterion: 'INATT_09', items: ['keeps a strict calendar'] },
  });
  rep = engine.evaluate(st);
  const hasTier = rep.summary.includes(rep.recommendation);
  const hasNote = rep.summary.includes('Sleep problems');
  const hasContradiction = rep.summary.includes('keeps a strict calendar');
  const hasDisclaimer = rep.summary.includes('not a medical diagnosis');
  ok = hasTier && hasNote && hasContradiction && hasDisclaimer;
  pass('evaluate: summary contains tier text + diff_note + contradiction_note + disclaimer', ok, JSON.stringify(rep.summary));

  // 16. summary with no notes (just tier text + disclaimer)
  st = buildFullState({
    stage2: { inattSupported: 5 }, onset: 'strong', settings: ['work', 'home'], domains: ['Work'], duration: 'met',
    factors: [],
  });
  rep = engine.evaluate(st);
  ok = rep.summary.includes(rep.recommendation) && rep.summary.includes('not a medical diagnosis')
    && !rep.summary.includes('Alternative explanations') && !rep.summary.includes('does not cleanly explain');
  pass('evaluate: summary (no notes) -> tier text + disclaimer only', ok, JSON.stringify(rep.summary));

  // ========================================================================
  // PART 4: multiple_settings + per_criterion dsm/domain
  // ========================================================================

  // 17. multiple_settings true when >=2 settings
  st = buildFullState({ stage2: { inattSupported: 5 }, onset: 'strong', settings: ['work', 'home'], domains: ['Work'], duration: 'met' });
  rep = engine.evaluate(st);
  ok = rep.settings.multiple_settings === true;
  pass('evaluate: multiple_settings true (>=2 settings)', ok, `multiple=${rep.settings.multiple_settings}`);

  // 18. multiple_settings false when <2 settings
  st = buildFullState({ stage2: { inattSupported: 5 }, onset: 'strong', settings: ['work'], domains: ['Work'], duration: 'met' });
  rep = engine.evaluate(st);
  ok = rep.settings.multiple_settings === false;
  pass('evaluate: multiple_settings false (<2 settings)', ok, `multiple=${rep.settings.multiple_settings}`);

  // 19. per_criterion includes dsm + domain
  st = buildFullState({ stage2: { inattSupported: 5 } });
  rep = engine.evaluate(st);
  const inattRec = rep.per_criterion.find(p => p.criterion === 'INATT_01');
  const hyperRec = rep.per_criterion.find(p => p.criterion === 'HYPERR_01');
  ok = inattRec.dsm === 1 && inattRec.domain === 'inattentive'
    && hyperRec.dsm === 1 && hyperRec.domain === 'hyperactive_impulsive';
  pass('evaluate: per_criterion dsm + domain', ok, `INATT_01.dsm=${inattRec.dsm} domain=${inattRec.domain} | HYPERR_01.dsm=${hyperRec.dsm} domain=${hyperRec.domain}`);

  // ========================================================================
  // PART 5: Stage 5 integration — flagDifferentialEvidence wired into finalizeDifferential
  // ========================================================================

  // 20. full Stage 5 loop stores differential.evidence with strong list
  setFakeFn(async function ({ probe }) {
    if (probe.id === 'anxiety') return { reported: true, symptom_mentions: ['anxiety makes it hard to focus'], uncertainty: null };
    if (probe.id === 'sleep') return { reported: true, symptom_mentions: [], uncertainty: null };
    return { reported: false, symptom_mentions: [], uncertainty: null };
  });
  delete require.cache[require.resolve(path.join(ROOT, 'model/assessment'))];
  const A2 = require(path.join(ROOT, 'model/assessment'));
  const st5 = A2.createStage2Assessment('stg5');
  for (const c of A2.CRITERIA) st5.criteria[c.id] = { criterion: c.id, status: 'supported', confidence: 'strong', core_answer: 'Often', example: 'x', contexts: ['work'], consequence: 'y', counter_evidence: [], uncertainty: null, tries: 1, followups: 0, source: 'interview' };
  st5.duration = engine.deriveDuration(st5);
  A2.beginStage5(st5);
  let res5;
  for (let i = 0; i < 30; i++) { res5 = await A2.processStage5Turn(st5, 'user says yes'); if (res5.completed) break; }
  const ev5 = st5.differential.evidence;
  ok = res5.completed && ev5 !== null && ev5.flagged.includes('Anxiety') && ev5.strong.includes('Anxiety')
    && ev5.flagged.includes('Sleep problems') && !ev5.strong.includes('Sleep problems')
    && st5.differentials_flagged.includes('Anxiety') && st5.differentials_flagged.includes('Sleep problems');
  pass('Stage 5 integration: flagDifferentialEvidence wired, strong list populated', ok, JSON.stringify(ev5));

  // 21. evaluate() after full Stage 5 finalization uses pre-computed evidence -> F = not_supported
  const rep5 = engine.evaluate(st5);
  ok = rep5.dsm5_criteria.F_not_better_explained === 'not_supported'
    && rep5.differential_note && rep5.differential_note.includes('Anxiety') && rep5.differential_note.includes('(tied to ADHD-like symptoms)');
  pass('evaluate after Stage5: strong -> F = not_supported + differential_note', ok, `F=${rep5.dsm5_criteria.F_not_better_explained} note=${JSON.stringify(rep5.differential_note)}`);

  // ========================================================================
  // PART 6: H7 — Contradiction handling (§9d: >=1 contradiction prevents Consistent tier)
  // ========================================================================

  // 22. contradiction prevents "Consistent" tier -> moves to "Partially consistent"
  st = buildFullState({
    stage2: { inattSupported: 7 }, onset: 'strong', settings: ['work', 'home'],
    domains: ['Work', 'Relationships'], duration: 'met', factors: [],
    counterEvidence: { criterion: 'INATT_09', items: ['I keep a strict calendar and rarely forget things'] },
  });
  rep = engine.evaluate(st);
  ok = rep.consistency.consistent === false && rep.consistency.partially_consistent === true
    && rep.tier === 'Partially consistent' && rep.contradictions.count === 1;
  pass('H7: contradiction prevents Consistent -> Partially consistent', ok, `consistent=${rep.consistency.consistent} tier=${rep.tier} contradictions=${rep.contradictions.count}`);

  // 23. no contradictions -> Consistent tier (all other criteria met)
  st = buildFullState({
    stage2: { inattSupported: 7 }, onset: 'strong', settings: ['work', 'home'],
    domains: ['Work', 'Relationships'], duration: 'met', factors: [],
  });
  rep = engine.evaluate(st);
  ok = rep.consistency.consistent === true && rep.tier === 'Consistent' && rep.contradictions.count === 0;
  pass('H7: no contradictions -> Consistent tier', ok, `consistent=${rep.consistency.consistent} tier=${rep.tier}`);

  // 24. onset evidence_against is also a contradiction (prevents Consistent)
  st = buildFullState({
    stage2: { inattSupported: 7 }, onset: 'evidence_against', settings: ['work', 'home'],
    domains: ['Work', 'Relationships'], duration: 'met', factors: [],
  });
  rep = engine.evaluate(st);
  // onset evidence_against -> insufficient tier (also a contradiction)
  ok = rep.consistency.insufficient === true && rep.contradictions.count >= 1;
  pass('H7: onset evidence_against -> contradiction counted + Insufficient tier', ok, `onset=${st.onset} contradictions=${rep.contradictions.count} tier=${rep.tier}`);

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
