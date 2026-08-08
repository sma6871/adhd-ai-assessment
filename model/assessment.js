'use strict';

// ASSESSMENT ORCHESTRATOR (Stage 2 turn-loop).
// Wires the deterministic engine to the LLM evidence extractor.
// The engine ASKS all questions (deterministic) and ADJUDICATES completion/status.
// The LLM (extractor) ONLY extracts structured evidence from the user's answers.

const { CRITERIA } = require('./criteria');
const { newAssessment, blankEvidenceRecord } = require('./schema');
const engine = require('./engine');
const { extractEvidence } = require('../interviewer/interviewer');

const MAX_TRANSCRIPT = 20;

function createStage2Assessment(id) {
  const state = newAssessment(id);
  state.stage = 'ADULT_SYMPTOMS';
  state.criterion_index = 0;
    state.duration = null;      // derived from Stage 2 core answers at completion (§9a-B), not hardcoded
    state.transcript = [];
  state.transcript = [];
  state.pending = { cid: null, kind: 'core', followups: 0 };
  return state;
}

function getRecord(state, cid) {
  if (!state.criteria[cid]) state.criteria[cid] = blankEvidenceRecord(cid);
  return state.criteria[cid];
}

function appendTranscript(state, role, text) {
  state.transcript.push({ role, text });
  if (state.transcript.length > MAX_TRANSCRIPT) state.transcript = state.transcript.slice(-MAX_TRANSCRIPT);
}

// Begin Stage 2: present the first criterion's deterministic core question.
function begin(state) {
  const criterion = engine.currentCriterion(state);
  if (!criterion) {
    state.stage = 'REPORT';
    state.duration = engine.deriveDuration(state);
    state.report = engine.evaluate(state);
    return { completed: true, report: state.report };
  }
  state.pending = { cid: criterion.id, kind: 'core', followups: 0 };
  return {
    question: engine.formatCoreQuestion(criterion),
    criterionId: criterion.id,
    kind: 'core',
    first: true,
  };
}

// Advance after a criterion is completed (or marked uncertain). Returns the next question or the report.
function nextOrDone(state, opts = {}) {
  if (engine.hasMoreCriteria(state)) {
    const next = engine.currentCriterion(state);
    state.pending = { cid: next.id, kind: 'core', followups: 0 };
    return {
      question: engine.formatCoreQuestion(next),
      criterionId: next.id,
      kind: 'core',
      advanced: true,
      ...opts,
    };
  }
  state.stage = 'REPORT';
  state.duration = engine.deriveDuration(state);
  state.report = engine.evaluate(state);
  // completed:true must win over any opts.completed:false passed by processTurn.
  return { ...opts, completed: true, report: state.report };
}

// Process a user answer within the current criterion.
async function processTurn(state, userAnswer) {
  const { cid, kind: kindPrev } = state.pending || { cid: null, kind: 'core' };
  if (!cid) return begin(state);

  const idx = CRITERIA.findIndex(c => c.id === cid);
  const criterion = CRITERIA[idx];
  const record = getRecord(state, cid);
  record.tries = (record.tries || 0) + 1;            // every user-turn counts toward the safety cap

  // Count a follow-up turn BEFORE extraction: a follow-up was asked last turn and
  // is now being answered, regardless of whether extraction succeeds. This keeps
  // the bounded follow-up cap (§3) authoritative even if the extractor is flaky.
  let extracted = { core_answer: null, example: null, contexts: [], consequence: null, counter_evidence: [], uncertainty: null };
  let extractionError = null;
  try {
    extracted = await extractEvidence({
      criterion,
      priorEvidence: engine.stripEvidence(record),
      transcript: state.transcript,
      userAnswer,
    });
  } catch (e) {
    extractionError = e.message;
  }

  if (kindPrev !== 'core') record.followups = (record.followups || 0) + 1;
  appendTranscript(state, 'user', userAnswer || '(no answer)');
  if (extractionError) appendTranscript(state, 'engine', `extraction error: ${extractionError}`);

  // 2. Engine merges extracted fields deterministically (on extraction error, no-op).
  if (extracted) engine.mergeEvidence(record, extracted);
  state.criteria[cid] = record;

  // 3. Engine adjudicates (authoritative — LLM never decides this).
  const recheck = engine.engineMove(record);

  if (recheck.move === 'complete') {
    const { status, confidence } = engine.deriveStatus(record);
    record.status = status;
    record.confidence = confidence;
    state.criteria[cid] = record;
    appendTranscript(state, 'engine', `${cid} -> ${status} (${confidence})`);
    return nextOrDone(state, { criterionId: cid, status, confidence, completed: false, criterion_done: true });
  }

  if (recheck.move === 'uncertain') {
    engine.markUncertain(record);
    state.criteria[cid] = record;
    appendTranscript(state, 'engine', `${cid} -> uncertain (follow-up cap exhausted)`);
    return nextOrDone(state, { criterionId: cid, uncertain: true, completed: false, criterion_done: true });
  }

  // recheck.move === 'ask_core': core answer not yet collected (e.g. extraction failed).
  // Re-ask the core question; the turn cap is enforced by engineMove (tries >= MAX_TURNS).
  if (recheck.move === 'ask_core') {
    state.pending = { cid, kind: 'core', followups: record.followups || 0 };
    return {
      question: engine.formatCoreQuestion(criterion),
      criterionId: cid,
      kind: 'core',
      completed: false,
      ...(extractionError ? { error: extractionError } : {}),
    };
  }

  // recheck.move === 'followup'
  const kindNext = engine.pickFollowupKind(record.followups || 0);
  const followupQ = engine.followupPrompt(criterion, kindNext);

  const pending = { cid, kind: kindNext, followups: record.followups || 0 };
  if (extractionError) pending.retry = true;
  state.pending = pending;
  return {
    question: followupQ,
    criterionId: cid,
    kind: kindNext,
    followup: true,
    completed: false,
    evidence: engine.stripEvidence(record),
    ...(extractionError ? { error: extractionError } : {}),
  };
}

function getReport(state) {
  if (state.stage !== 'REPORT') state.report = engine.evaluate(state);
  return state.report;
}

function getProgress(state) {
  const done = CRITERIA.filter(c => {
    const r = state.criteria[c.id];
    return r && r.status !== null && !r.uncertainty;
  }).length;
  return { total: CRITERIA.length, completed: done, stage: state.stage, current: state.pending?.cid || null };
}

// --- §5: Stage 3 — Childhood-onset evidence (additive; does not alter Stage 2 flow) ---
// The engine asks concrete pre-age-12 probes DETERMINISTICALLY. The LLM interviewer only
// extracts recalled childhood memories into a structured array. The engine then rates onset
// quality — NEVER inferring childhood from adult symptom records (rateOnset reads childhood
// evidence only).
function beginStage3(state) {
  state.stage = 'CHILDHOOD';
  if (!state.childhood) {
    state.childhood = { evidence: [], probesAsked: 0, done: false };
  }
  state.pending = { stage: 'CHILDHOOD', probe: 0, kind: 'childhood' };
  const probe = engine.CHILDHOOD_PROBES[0];
  return {
    question: engine.childhoodQuestion(probe),
    probeId: probe.id,
    kind: 'childhood',
    first: true,
    completed: false,
  };
}

const CHILDHOOD_EXTRACT_DEFAULT = { memories: [] };

// Merge extractor-returned childhood memories into the stage's evidence pile (deduped by behavior).
function mergeChildhoodEvidence(state, extracted) {
  const existing = state.childhood.evidence;
  const seen = new Set(existing.map(m => (m.behavior || '').toLowerCase()));
  for (const m of (extracted && extracted.memories) || []) {
    const key = (m.behavior || '').toLowerCase();
    if (key && !seen.has(key)) {
      existing.push(m);
      seen.add(key);
    }
  }
}

// Process a user answer to a childhood probe. Deterministic prompt; LLM only extracts.
async function processStage3Turn(state, userAnswer) {
  const pending = state.pending || { stage: 'CHILDHOOD', probe: 0, kind: 'childhood' };
  if (pending.stage !== 'CHILDHOOD') return beginStage3(state);

  const idx = pending.probe == null ? 0 : pending.probe;
  const probe = engine.CHILDHOOD_PROBES[idx];
  if (!probe) {
    // No more probes — finalize onset rating.
    state.onset = engine.rateOnset(state.childhood.evidence);
    state.childhood.done = true;
    state.pending = null;
    return { completed: true, stage: 'CHILDHOOD', onset: state.onset, evidence: state.childhood.evidence.slice() };
  }

  let extracted = CHILDHOOD_EXTRACT_DEFAULT;
  let extractionError = null;
  try {
    extracted = await extractEvidence({
      stage: 'childhood',
      probe,
      priorEvidence: { memories: state.childhood.evidence },
      transcript: state.transcript,
      userAnswer,
    });
  } catch (e) {
    extractionError = e.message;
  }
  if (extracted) mergeChildhoodEvidence(state, extracted);

  state.childhood.probesAsked = (state.childhood.probesAsked || 0) + 1;
  appendTranscript(state, 'user', userAnswer || '(no answer)');
  if (extractionError) appendTranscript(state, 'engine', `childhood extraction error: ${extractionError}`);

  const nextIdx = idx + 1;
  if (nextIdx < engine.CHILDHOOD_PROBES.length) {
    const nextProbe = engine.CHILDHOOD_PROBES[nextIdx];
    state.pending = { stage: 'CHILDHOOD', probe: nextIdx, kind: 'childhood' };
    return {
      question: engine.childhoodQuestion(nextProbe),
      probeId: nextProbe.id,
      kind: 'childhood',
      completed: false,
    };
  }

  // Last probe answered — finalize.
  state.onset = engine.rateOnset(state.childhood.evidence);
  state.childhood.done = true;
  state.pending = null;
  return {
    completed: true,
    stage: 'CHILDHOOD',
    onset: state.onset,
    evidence: state.childhood.evidence.slice(),
  };
}

// --- §6: Stage 4 — Functional impairment & multiple-settings (additive; M2/M3 untouched) ---
// Two deterministic probes (per §6): concrete impairment examples across life domains, then
// concrete settings. The LLM only extracts; the engine rates via engine.assessImpairment.
// Results populate the LOCKED top-level fields state.domains_impaired[] and state.settings[].
function beginStage4(state) {
  state.stage = 'IMPAIRMENT';
  if (!state.impairment) {
    state.impairment = { examples: [], settings: [], probesAsked: 0, done: false, probe: 0 };
  }
  state.pending = { stage: 'IMPAIRMENT', probe: 0, kind: 'impairment' };
  return {
    question: engine.formatImpairmentQuestion(),
    probeId: 'domains',
    kind: 'impairment',
    first: true,
    completed: false,
  };
}

const IMPAIRMENT_PROBES = [
  { id: 'domains', question: () => engine.formatImpairmentQuestion() },
  { id: 'settings', question: () => engine.formatSettingsQuestion() },
];
const IMPAIRMENT_EXTRACT_DEFAULT = { domains_impaired: [], settings: [], uncertainty: null };

function mergeImpairmentEvidence(state, extracted) {
  const imp = state.impairment;
  const seenEx = new Set(imp.examples.map(e => (e.domain || '').toLowerCase() + '|' + (e.example || '').toLowerCase()));
  for (const e of (extracted && extracted.domains_impaired) || []) {
    const key = (e.domain || '').toLowerCase() + '|' + (e.example || '').toLowerCase();
    if (!key || seenEx.has(key)) continue;
    imp.examples.push({ domain: e.domain, example: e.example, concrete: !!e.concrete });
    seenEx.add(key);
  }
  const seenSt = new Set(imp.settings.map(s => (s.setting || '').toLowerCase()));
  for (const s of (extracted && extracted.settings) || []) {
    const key = (s.setting || '').toLowerCase();
    if (!key || seenSt.has(key)) continue;
    imp.settings.push({ setting: s.setting, example: s.example, concrete: !!s.concrete });
    seenSt.add(key);
  }
}

async function processStage4Turn(state, userAnswer) {
  const pending = state.pending || { stage: 'IMPAIRMENT', probe: 0, kind: 'impairment' };
  if (pending.stage !== 'IMPAIRMENT') return beginStage4(state);

  const idx = pending.probe == null ? 0 : pending.probe;
  const probe = IMPAIRMENT_PROBES[idx];
  if (!probe) {
    // All probes done — finalize into the locked top-level fields (§9a-D/E).
    const a = engine.assessImpairment(state.impairment);
    state.domains_impaired = a.domains;
    state.settings = a.settings;
    state.impairment.done = true;
    state.pending = null;
    return { completed: true, stage: 'IMPAIRMENT', ...a };
  }

  let extracted = IMPAIRMENT_EXTRACT_DEFAULT;
  let extractionError = null;
  try {
    extracted = await extractEvidence({
      stage: 'impairment',
      probe: { id: probe.id, prompt: probe.question() },
      priorEvidence: { examples: state.impairment.examples, settings: state.impairment.settings },
      transcript: state.transcript,
      userAnswer,
    });
  } catch (e) {
    extractionError = e.message;
  }
  if (extracted) mergeImpairmentEvidence(state, extracted);

  state.impairment.probesAsked = (state.impairment.probesAsked || 0) + 1;
  state.impairment.probe = idx;
  appendTranscript(state, 'user', userAnswer || '(no answer)');
  if (extractionError) appendTranscript(state, 'engine', `impairment extraction error: ${extractionError}`);

  const nextIdx = idx + 1;
  if (nextIdx < IMPAIRMENT_PROBES.length) {
    const nextProbe = IMPAIRMENT_PROBES[nextIdx];
    state.pending = { stage: 'IMPAIRMENT', probe: nextIdx, kind: 'impairment' };
    return { question: nextProbe.question(), probeId: nextProbe.id, kind: 'impairment', completed: false };
  }

  // Last probe answered — finalize.
  const a = engine.assessImpairment(state.impairment);
  state.domains_impaired = a.domains;
  state.settings = a.settings;
  state.impairment.done = true;
  state.pending = null;
  return { completed: true, stage: 'IMPAIRMENT', ...a };
}

module.exports = {
  createStage2Assessment, begin, processTurn, nextOrDone, getReport, getProgress,
  beginStage3, processStage3Turn,
  beginStage4, processStage4Turn,
  CRITERIA,
};
