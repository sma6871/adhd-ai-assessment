'use strict';

// ASSESSMENT ORCHESTRATOR (Stage 2 turn-loop).
// Wires the deterministic engine to the LLM evidence extractor.
// The engine ASKS all questions (deterministic) and ADJUDICATES completion/status.
// The LLM (extractor) ONLY extracts structured evidence from the user's answers.

const { CRITERIA, INATTENTIVE, HYPERACTIVE } = require('./criteria');
const { newAssessment, blankEvidenceRecord } = require('./schema');
const engine = require('./engine');
const locales = require('./locales');
const { classifyFrequency, classifyYesNo, detectUncertainty } = locales;
const { extractEvidence } = require('../interviewer/interviewer');

const fs = require('fs');
const path = require('path');
const STORAGE_DIR = path.join(__dirname, '..', 'data');

const MAX_TRANSCRIPT = 20;

function createStage2Assessment(id, lang) {
  const state = newAssessment(id);
  if (lang === 'fa' || lang === 'en') state.lang = lang;
  state.stage = 'ADULT_SYMPTOMS';
  state.criterion_index = 0;
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

// --- Canonical persistence (single source: the server, via data/<id>.json) ---
// The in-memory session map lives in server.js; these helpers back it with disk so a
// resume survives a server restart. Nothing here is clinical logic.
function snapshot(state) {
  try {
    if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
    fs.writeFileSync(path.join(STORAGE_DIR, state.id + '.json'), JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('snapshot failed:', e.message);
  }
}
function loadSnapshot(id) {
  try {
    const p = path.join(STORAGE_DIR, id + '.json');
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}
function clearSnapshot(id) {
  try {
    const p = path.join(STORAGE_DIR, id + '.json');
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) {
    console.error('clearSnapshot failed:', e.message);
  }
}
function snapshotExists(id) {
  try { return fs.existsSync(path.join(STORAGE_DIR, id + '.json')); } catch (e) { return false; }
}

// Reconstruct the question the engine is currently waiting on from the persisted state.
// Used to restore the in-flight prompt after a reload/resume (deterministic — no LLM).
function currentQuestion(state, lang) {
  const l = state.lang || lang || 'en';
  if (!state.pending) return null;
  const stage = state.stage;
  if (stage === 'ADULT_SYMPTOMS') {
    const { cid, kind } = state.pending || {};
    if (!cid) return null;
    const criterion = CRITERIA.find(c => c.id === cid);
    if (!criterion) return null;
    if (kind === 'core' || !kind) return engine.formatCoreQuestion(criterion, l);
    return engine.followupPrompt(criterion, kind, l);
  }
  if (stage === 'CHILDHOOD') {
    const idx = (state.pending && state.pending.probe) || 0;
    const probe = engine.CHILDHOOD_PROBES[idx];
    if (!probe) return null;
    return engine.childhoodQuestion(probe, l);
  }
  if (stage === 'IMPAIRMENT') {
    const idx = (state.pending && state.pending.probe) || 0;
    const probe = IMPAIRMENT_PROBES[idx];
    if (!probe) return null;
    return probe.id === 'settings' ? engine.formatSettingsQuestion(l) : engine.formatImpairmentQuestion(l);
  }
  if (stage === 'DIFFERENTIAL') {
    const idx = (state.pending && state.pending.probe) || 0;
    const factor = engine.DIFFERENTIAL_FACTORS[idx];
    if (!factor) return null;
    return engine.formatDifferentialQuestion(factor, l);
  }
  return null;
}

// Begin Stage 2: present the first criterion's deterministic core question (localized).
function begin(state) {
  const lang = state.lang || 'en';
  const criterion = engine.currentCriterion(state);
  if (!criterion) {
    state.stage = 'REPORT';
    state.duration = engine.deriveDuration(state);
    state.report = engine.evaluate(state);
    return { completed: true, report: localizeReport(state, state.report), progress: getProgress(state) };
  }
  state.pending = { cid: criterion.id, kind: 'core', followups: 0 };
  return {
    question: engine.formatCoreQuestion(criterion, lang),
    criterionId: criterion.id,
    kind: 'core',
    first: true,
    progress: getProgress(state),
  };
}

// Advance after a criterion is completed (or marked uncertain). Returns the next question or the report.
function nextOrDone(state, opts = {}) {
  const lang = state.lang || 'en';
  if (engine.hasMoreCriteria(state)) {
    const next = engine.currentCriterion(state);
    state.pending = { cid: next.id, kind: 'core', followups: 0 };
    return {
      question: engine.formatCoreQuestion(next, lang),
      criterionId: next.id,
      kind: 'core',
      advanced: true,
      progress: getProgress(state),
      ...opts,
    };
  }
// Stage 2 complete — signal transition to CHILDHOOD (NOT REPORT).
// The unified processTurn() dispatcher handles the actual stage transition.
  state.duration = engine.deriveDuration(state);
  state.criterion_index = null;
  return { ...opts, completed: false, stage_complete: 'ADULT_SYMPTOMS', duration: state.duration };
}

// Process a Stage 2 user answer. Internal — use processTurn() (the unified dispatcher)
// for the production stage flow.
async function _processStage2Turn(state, userAnswer) {
  const { cid, kind: kindPrev } = state.pending || { cid: null, kind: 'core' };
  if (!cid) return begin(state);

  const idx = CRITERIA.findIndex(c => c.id === cid);
  const criterion = CRITERIA[idx];
  const record = getRecord(state, cid);
  const lang = state.lang || 'en';
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
      lang: state.lang || 'en',
    });
  } catch (e) {
    extractionError = e.message;
  }

   // §3: Pre-classify simple frequency/yes-no answers deterministically (Issue #3).
   // The LLM is unreliable for short Persian/English words like "گاهی", "هرگز", "خیر".
   // If the raw answer directly maps to a canonical frequency, use it as ground truth;
   // the LLM's core_answer is only a fallback.
   var canonicalFreq = classifyFrequency(userAnswer);
   if (canonicalFreq) {
     extracted.core_answer = canonicalFreq;
   } else if (classifyYesNo(userAnswer) === false) {
     extracted.core_answer = 'Never';
   }
   var unc = detectUncertainty(userAnswer, lang);
   if (unc && !extracted.uncertainty) {
     extracted.uncertainty = unc;
   }

  if (kindPrev !== 'core') record.followups = (record.followups || 0) + 1;
  appendTranscript(state, 'user', userAnswer || '(no answer)');
  if (extractionError) appendTranscript(state, 'engine', `extraction error: ${extractionError}`);

  // 2. Engine merges extracted fields deterministically (on extraction error, no-op).
  if (extracted) engine.mergeEvidence(record, extracted);
  state.criteria[cid] = record;

  // An explicit inability to answer is a bounded, clinically honest outcome.
  // Do not re-ask the same fact or start a generic follow-up chain after
  // "I don't know"; keep the criterion visible as uncertain and advance.
  if (unc) {
    engine.markUncertain(record);
    state.criteria[cid] = record;
    appendTranscript(state, 'engine', `${cid} -> uncertain (user unable to provide evidence)`);
    return nextOrDone(state, { criterionId: cid, uncertain: true, completed: false, criterion_done: true });
  }

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

   // recheck.move === 'ask_core': core answer not yet collected (e.g. extraction failed or
   // the user couldn't state a frequency). Re-ask the core question; the turn cap is enforced
   // by engineMove (tries >= MAX_TURNS). A gentle recast preamble softens the re-ask when the
   // record already carries an uncertainty note — same clinical question, warmer framing.
   if (recheck.move === 'ask_core') {
     state.pending = { cid, kind: 'core', followups: record.followups || 0 };
     let q = engine.formatCoreQuestion(criterion, lang);
     if (record.uncertainty) q = locales.recastText(lang) + q;
     return {
       question: q,
       criterionId: cid,
       kind: 'core',
       completed: false,
       progress: getProgress(state),
       ...(extractionError ? { error: extractionError } : {}),
     };
   }

   // recheck.move === 'followup'
   const kindNext = engine.pickFollowupKind(record);
   const followupQ = engine.followupPrompt(criterion, kindNext, lang);

   const pending = { cid, kind: kindNext, followups: record.followups || 0 };
   if (extractionError) pending.retry = true;
   state.pending = pending;
   return {
     question: followupQ,
     criterionId: cid,
     kind: kindNext,
     followup: true,
     completed: false,
     progress: getProgress(state),
     evidence: engine.stripEvidence(record),
     ...(extractionError ? { error: extractionError } : {}),
   };
}

// Unified public stage-flow dispatcher.
// Drives: ASRS/Stage2 → Childhood → Impairment → Differential → Report.
// - Each stage transitions exactly once (no skips, no repeats).
// - Stage completion triggers beginXxx() for the next stage.
// - Report is generated ONLY after Stage 5 completion (§9d: evaluate only after all stages).
async function processTurn(state, userAnswer) {
  if (state.stage === 'ADULT_SYMPTOMS') {
    const ret = await _processStage2Turn(state, userAnswer);
    if (ret.stage_complete === 'ADULT_SYMPTOMS') {
       return { ...ret, ...beginStage3(state), stage: 'CHILDHOOD', completed: false, transitioned: true, onset: null, duration: state.duration };
     }
    return ret;
  }
  if (state.stage === 'CHILDHOOD') {
    const ret = await processStage3Turn(state, userAnswer);
     if (ret.completed) {
       return { ...ret, ...beginStage4(state), stage: 'IMPAIRMENT', completed: false, transitioned: true, onset: ret.onset };
     }
    return ret;
  }
  if (state.stage === 'IMPAIRMENT') {
    const ret = await processStage4Turn(state, userAnswer);
     if (ret.completed) {
       return { ...ret, ...beginStage5(state), stage: 'DIFFERENTIAL', completed: false, transitioned: true };
     }
    return ret;
  }
  if (state.stage === 'DIFFERENTIAL') {
    const ret = await processStage5Turn(state, userAnswer);
    if (ret.completed) {
      state.stage = 'REPORT';
      state.report = engine.evaluate(state);
      state.pending = null;
      return { stage: 'REPORT', completed: true, report: localizeReport(state, state.report), transitioned: true, progress: getProgress(state) };
    }
    return ret;
  }
  if (state.stage === 'REPORT') {
    return { stage: 'REPORT', completed: true, report: getReport(state), progress: getProgress(state) };
  }
  return begin(state);
}

// Report is only available after ALL stages complete (state.stage === 'REPORT').
function getReport(state) {
  if (state.stage !== 'REPORT') return null;
  if (!state.report) state.report = engine.evaluate(state);
  // Localize visible report strings (recommendation, disclaimer, labels) per §10C.
  return localizeReport(state, state.report);
}

// Issue #10C: localize the English report text produced by the engine when lang === 'fa'.
// Returns a shallow copy with localized top-level strings and differential labels.
// The original stored report is not mutated.
function localizeReport(state, report) {
  if (state.lang !== 'fa' || !report) return report;
  var r = Object.assign({}, report);
  var L = 'fa';
  r.recommendation = locales.tierRecommendationText(r.tier, L) || r.recommendation;
  r.disclaimer = locales.resultUILabel('limitationsText', L) || r.disclaimer;
  if (r.childhood_onset) {
    r.childhood_onset = Object.assign({}, r.childhood_onset, { source: locales.resultUILabel('onsetSource', L) || r.childhood_onset.source });
  }
  if (r.duration_persistence) {
    r.duration_persistence = Object.assign({}, r.duration_persistence, { requirement: locales.resultUILabel('durationReq', L) || r.duration_persistence.requirement });
  }
  if (r.settings) {
    r.settings = Object.assign({}, r.settings, { requirement: locales.resultUILabel('settingsReq', L) || r.settings.requirement });
  }
  if (r.differentials && Array.isArray(r.differentials.list)) {
    r.differentials = Object.assign({}, r.differentials, {
      list: r.differentials.list.map(function (label) { return locales.localizeDifferentialLabel(label, L) || label; }),
    });
  }
  // Rebuild differential_note from structured considerations with localized labels
  if (r.differentials && Array.isArray(r.differentials.considerations)) {
    var cons = r.differentials.considerations;
    if (cons.length) {
      var tiedSuffix = locales.resultUILabel('tiedToSymptoms', L) || '';
      var prefix = locales.resultUILabel('alternativeExplanations', L) || 'عوامل جایگزین یادآوری شده';
      r.differential_note = prefix + ': ' + cons.map(function (c) {
        var locLabel = locales.localizeDifferentialLabel(c.factor, L) || c.factor;
        return c.could_explain_for_symptoms ? (locLabel + tiedSuffix) : locLabel;
      }).join(', ') + '.';
    } else {
      r.differential_note = null;
    }
  }
  // Localize the prefix of contradiction_note (list items are engine-built English strings)
  if (r.contradiction_note && r.contradictions && Array.isArray(r.contradictions.list) && r.contradictions.list.length) {
    var cPrefix = locales.resultUILabel('contradictions', L) || 'شواهدی که الگوی ADHD را به‌خوبی تبیین نمی‌کند';
    r.contradiction_note = cPrefix + ': ' + r.contradictions.list.join(' | ') + '.';
   }
  // Localize stage2_only message
  if (r.stage2_only) {
    r.stage2_only = locales.resultUILabel('stage2OnlyText', L) || r.stage2_only;
  }
   // Sanitize per-criterion evidence: replace English text with Persian fallback
   // so no raw English appears in a Persian report (Issue #10C).
   if (Array.isArray(r.per_criterion)) {
     r.per_criterion = r.per_criterion.map(function (c) {
       return Object.assign({}, c, {
         example: locales.sanitizeEvidence(c.example, L),
         contexts: locales.sanitizeEvidenceList(c.contexts, L),
         counter_evidence: locales.sanitizeEvidenceList(c.counter_evidence, L),
         evidence: locales.sanitizeEvidenceList(c.evidence, L),
       });
     });
   }
   // Rebuild summary from localized components (engine built summary from English text)
  var sumDisclaimer = locales.resultUILabel('summaryDisclaimer', L) || r.disclaimer;
  r.summary = [
    r.recommendation || '',
    r.differential_note || '',
    r.contradiction_note || '',
    sumDisclaimer
  ].filter(function (s) { return s && s.length > 0; }).join(' ').replace(/\s+/g, ' ').trim();
  return r;
}

// Stage-aware progress (§: progress reflects the CURRENT stage only, so a prior stage's
// 100% never lingers into the next stage). Numbers derive from the real assessment state —
// no fake/hardcoded progress: Stage 2 = criteria with a terminal status; Stage 3 = probes
// answered; Stage 4 = impairment probes answered; Stage 5 = differential factors answered.
function getProgress(state) {
  const stage = state.stage;
  const lang = state.lang || 'en';
  if (stage === 'ADULT_SYMPTOMS' || stage === 'SCREENING' || stage == null) {
    const total = CRITERIA.length;
    const completed = CRITERIA.filter(c => {
      const r = state.criteria[c.id];
      return r && r.status !== null; // terminal (incl. uncertain) => processed
    }).length;
    return { stage, label: 'ADULT_SYMPTOMS', completed, total, pct: total ? Math.round(completed / total * 100) : 0, current: state.pending && state.pending.cid, lang };
  }
  if (stage === 'CHILDHOOD') {
    const total = engine.CHILDHOOD_PROBES.length;
    const asked = (state.childhood && state.childhood.probesAsked) || 0;
    const completed = Math.min(asked, total);
    return { stage, label: 'CHILDHOOD', completed, total, pct: total ? Math.round(completed / total * 100) : 0, current: null, lang };
  }
  if (stage === 'IMPAIRMENT') {
    const total = IMPAIRMENT_PROBES.length;
    const asked = (state.impairment && state.impairment.probesAsked) || 0;
    const completed = Math.min(asked, total);
    return { stage, label: 'IMPAIRMENT', completed, total, pct: total ? Math.round(completed / total * 100) : 0, current: null, lang };
  }
  if (stage === 'DIFFERENTIAL') {
    const total = engine.DIFFERENTIAL_FACTORS.length;
    const asked = (state.differential && state.differential.probesAsked) || 0;
    const completed = Math.min(asked, total);
    return { stage, label: 'DIFFERENTIAL', completed, total, pct: total ? Math.round(completed / total * 100) : 0, current: null, lang };
  }
  if (stage === 'REPORT') {
    return { stage, label: 'REPORT', completed: 5, total: 5, pct: 100, current: null, lang };
  }
  return { stage, label: stage, completed: 0, total: 0, pct: 0, current: (state.pending && state.pending.cid) || null, lang };
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
  const lang = state.lang || 'en';
  return {
    question: engine.childhoodQuestion(probe, lang),
    probeId: probe.id,
    kind: 'childhood',
    first: true,
    completed: false,
    progress: getProgress(state),
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
  const lang = state.lang || 'en';
  const pending = state.pending || { stage: 'CHILDHOOD', probe: 0, kind: 'childhood' };
  if (pending.stage !== 'CHILDHOOD') return beginStage3(state);

  const idx = pending.probe == null ? 0 : pending.probe;
  const probe = engine.CHILDHOOD_PROBES[idx];
  if (!probe) {
    // No more probes — finalize onset rating.
    state.onset = engine.rateOnset(state.childhood.evidence);
    state.childhood.done = true;
    state.pending = null;
    return { completed: true, stage: 'CHILDHOOD', onset: state.onset, evidence: state.childhood.evidence.slice(), progress: getProgress(state) };
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
      lang,
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
      question: engine.childhoodQuestion(nextProbe, lang),
      probeId: nextProbe.id,
      kind: 'childhood',
      completed: false,
      progress: getProgress(state),
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
    progress: getProgress(state),
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
  const lang = state.lang || 'en';
  return {
    question: engine.formatImpairmentQuestion(lang),
    probeId: 'domains',
    kind: 'impairment',
    first: true,
    completed: false,
    progress: getProgress(state),
  };
}

const IMPAIRMENT_PROBES = [
  { id: 'domains' },
  { id: 'settings' },
];
// Localized display prompt; the extractor always receives the canonical EN prompt.
function impairmentProbePrompt(id, lang) {
  return id === 'settings' ? engine.formatSettingsQuestion(lang) : engine.formatImpairmentQuestion(lang);
}
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
  const lang = state.lang || 'en';
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
    return { completed: true, stage: 'IMPAIRMENT', ...a, progress: getProgress(state) };
  }

  let extracted = IMPAIRMENT_EXTRACT_DEFAULT;
  let extractionError = null;
  try {
    extracted = await extractEvidence({
      stage: 'impairment',
      probe: { id: probe.id, prompt: impairmentProbePrompt(probe.id, 'en') },
      priorEvidence: { examples: state.impairment.examples, settings: state.impairment.settings },
      transcript: state.transcript,
      userAnswer,
      lang,
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
    return { question: impairmentProbePrompt(nextProbe.id, lang), probeId: nextProbe.id, kind: 'impairment', completed: false, progress: getProgress(state) };
  }

   // Last probe answered — finalize.
  const a = engine.assessImpairment(state.impairment);
  state.domains_impaired = a.domains;
  state.settings = a.settings;
  state.impairment.done = true;
  state.pending = null;
  return { completed: true, stage: 'IMPAIRMENT', ...a, progress: getProgress(state) };
}

// --- §7: Stage 5 — Focused differential check (additive; M1–M4 untouched) ---
// Flagging-only, never a diagnosis. The engine asks the 7 deterministic probes; the LLM ONLY
// extracts each factor's presence + any ADHD-like symptoms the user tied to it. The ENGINE
// applies the §7 flagging rule (§9a-F). Stores flagged labels in the locked top-level
// state.differentials_flagged[] (consumed by evaluate() §9b-F / §9f).
function beginStage5(state) {
  state.stage = 'DIFFERENTIAL';
  if (!state.differential) {
    state.differential = { factors: [], probesAsked: 0, done: false, probe: 0 };
  }
  state.pending = { stage: 'DIFFERENTIAL', probe: 0, kind: 'differential' };
  const lang = state.lang || 'en';
  const factor = engine.DIFFERENTIAL_FACTORS[0];
  return {
    question: engine.formatDifferentialQuestion(factor, lang),
    probeId: factor.id,
    kind: 'differential',
    first: true,
    completed: false,
    progress: getProgress(state),
  };
}

const DIFFERENTIAL_PROBES = engine.DIFFERENTIAL_FACTORS;
const DIFFERENTIAL_EXTRACT_DEFAULT = { reported: false, uncertainty: null, symptom_mentions: [] };

function mergeDifferentialEvidence(state, extracted) {
  const f = state.differential.factors;
  // factors are visited once each (one probe per factor), so just push the parsed result
  f.push({
    factor: extracted.factor,
    reported: !!extracted.reported,
    uncertainty: extracted.uncertainty || null,
    symptom_mentions: Array.isArray(extracted.symptom_mentions) ? extracted.symptom_mentions.slice() : [],
  });
}

async function processStage5Turn(state, userAnswer) {
  const lang = state.lang || 'en';
  const pending = state.pending || { stage: 'DIFFERENTIAL', probe: 0, kind: 'differential' };
  if (pending.stage !== 'DIFFERENTIAL') return beginStage5(state);

  const idx = pending.probe == null ? 0 : pending.probe;
  const factor = DIFFERENTIAL_PROBES[idx];
   if (!factor) {
    finalizeDifferential(state);
    return { completed: true, stage: 'DIFFERENTIAL', flagged: state.differentials_flagged, progress: getProgress(state) };
  }

  let extracted = DIFFERENTIAL_EXTRACT_DEFAULT;
  let extractionError = null;
  try {
    extracted = await extractEvidence({
      stage: 'differential',
      probe: { id: factor.id, prompt: factor.probe },
      priorEvidence: { factors: state.differential.factors },
      transcript: state.transcript,
      userAnswer,
      lang,
    });
    extracted.factor = factor.id;
   } catch (e) {
     extractionError = e.message;
   }
   // §3: Pre-classify yes/no answers deterministically (Issue #3).
   var yn = classifyYesNo(userAnswer);
   if (yn !== null) {
     extracted.reported = yn;
   }
   if (detectUncertainty(userAnswer, lang) && !extracted.uncertainty) {
     extracted.uncertainty = lang === 'fa'
       ? 'کاربر گفته است «' + userAnswer.trim() + '» — عدم قطعیت.'
       : 'User indicated "' + userAnswer.trim() + '" — uncertainty.';
   }
   if (extracted) mergeDifferentialEvidence(state, extracted);

  state.differential.probesAsked = (state.differential.probesAsked || 0) + 1;
  state.differential.probe = idx;
  appendTranscript(state, 'user', userAnswer || '(no answer)');
  if (extractionError) appendTranscript(state, 'engine', `differential extraction error: ${extractionError}`);

  const nextIdx = idx + 1;
  if (nextIdx < DIFFERENTIAL_PROBES.length) {
    state.pending = { stage: 'DIFFERENTIAL', probe: nextIdx, kind: 'differential' };
    return { question: engine.formatDifferentialQuestion(DIFFERENTIAL_PROBES[nextIdx], lang), probeId: DIFFERENTIAL_PROBES[nextIdx].id, kind: 'differential', completed: false, progress: getProgress(state) };
  }

  finalizeDifferential(state);
  return { completed: true, stage: 'DIFFERENTIAL', flagged: state.differentials_flagged, progress: getProgress(state) };
}

function finalizeDifferential(state) {
  state.differentials_flagged = engine.flagDifferentials(state);
  state.differential.evidence = engine.flagDifferentialEvidence(state); // M6 §7/§9b-F: strong-vs-partial evidence
  state.differential.done = true;
  state.pending = null;
}

// --- §12: Session export/import (machine-readable backup) ---
// EXPORT_FORMAT_VERSION — bump when the session-document shape changes.
// Import validates this and rejects incompatible major versions.
var EXPORT_FORMAT_VERSION = 1;

// Build a portable, versioned session blob containing exactly what is needed
// to resume. Excludes server-only/internal fields (no API keys, no server URLs,
// no internal scoring/debug info).
function exportSession(state) {
  var snapshot = {
    version: EXPORT_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    session: {
      id: state.id,
      lang: state.lang,
      stage: state.stage,
      screening: state.screening,
      duration: state.duration,
      onset: state.onset,
      settings: state.settings || [],
      domains_impaired: state.domains_impaired || [],
      differentials_flagged: state.differentials_flagged || [],
      criterion_index: state.criterion_index,
      pending: state.pending,
      criteria: state.criteria || {},
      childhood: state.childhood || null,
      impairment: state.impairment || null,
      differential: state.differential || null,
      transcript: state.transcript || [],
      report: state.report || null,
    },
  };
  return snapshot;
}

// Validate and import a session blob. Returns { state, error }.
// - error is null on success.
// - Rejects malformed JSON, wrong shape, incompatible major version, or
//   language that is not en|fa.
// - Does NOT overwrite an existing active session; the caller decides whether
//   to overwrite (import must not destroy an existing session without
//   explicit user confirmation — see server.js /api/import).
function importSession(blob) {
  if (!blob || typeof blob !== 'object') {
    return { state: null, error: 'invalid_format' };
  }
  if (blob.version !== EXPORT_FORMAT_VERSION) {
    return { state: null, error: 'version_mismatch' };
  }
  var s = blob.session;
  if (!s || typeof s !== 'object') {
    return { state: null, error: 'invalid_format' };
  }
  if (s.lang !== 'en' && s.lang !== 'fa') {
    return { state: null, error: 'lang_not_supported' };
  }
  if (!s.id || typeof s.id !== 'string') {
    return { state: null, error: 'invalid_format' };
  }

  var state = require('./schema').newAssessment(s.id);
  state.lang = s.lang;
  state.stage = s.stage || 'ADULT_SYMPTOMS';
  state.screening = s.screening || null;
  state.duration = s.duration || null;
  state.onset = s.onset || null;
  state.settings = Array.isArray(s.settings) ? s.settings : [];
  state.domains_impaired = Array.isArray(s.domains_impaired) ? s.domains_impaired : [];
  state.differentials_flagged = Array.isArray(s.differentials_flagged) ? s.differentials_flagged : [];
  state.criterion_index = s.criterion_index != null ? s.criterion_index : null;
  state.pending = s.pending || null;
  state.criteria = s.criteria || {};
  state.childhood = s.childhood || null;
  state.impairment = s.impairment || null;
  state.differential = s.differential || null;
  state.transcript = Array.isArray(s.transcript) ? s.transcript : [];
  state.report = s.report || null;

  return { state, error: null };
}

// --- §13: Human-readable assessment export ---
// Produces a plain-text document suitable for printing/sharing with a clinician.
// Excludes: session IDs, server URLs, API keys, internal prompts, debug info.
// Includes: language, date, questions + answers, structured evidence, report summary,
// uncertainty/contradictions, and the non-diagnosis disclaimer.
function exportHumanReadable(state, report) {
  var lang = state.lang || 'en';
  var r = report || (state.stage === 'REPORT' ? state.report : null);
  var lines = [];
  var blank = '\n';

  function push(s) { lines.push(s || ''); }

  push('ADHD Self-Screening — Assessment Summary');
  push('Language: ' + (lang === 'fa' ? 'Persian (فارسی)' : 'English'));
  push('Generated: ' + new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
  push(blank);

  // Stage 1 — ASRS Screener
  push('Stage 1: ASRS Screener');
  push('Result: ' + (state.screening === 'positive' ? 'Screen-positive' : state.screening === 'negative' ? 'Screen-negative' : 'Not completed'));
  push(blank);

  // Stage 2 — Adult ADHD Symptoms
  push('Stage 2: Adult ADHD Symptoms (18 DSM-5 Items)');
  push(blank);
  var criterionLabels = INATTENTIVE.map(function (c) { return c.id; })
    .concat(HYPERACTIVE.map(function (c) { return c.id; }));
  var completed = 0;
  var total = criterionLabels.length;
  for (var i = 0; i < criterionLabels.length; i++) {
    var cid = criterionLabels[i];
    var rec = state.criteria[cid];
    if (!rec || !rec.status) {
      push(cid + ': Not yet assessed');
      continue;
    }
    completed++;
    push(cid + ': ' + (rec.status || 'uncertain') + ' (' + (rec.confidence || 'weak') + ' confidence)');
    if (rec.core_answer) push('  Frequency: ' + rec.core_answer);
    if (rec.example) push('  Example: ' + rec.example);
    if (rec.contexts && rec.contexts.length) push('  Contexts: ' + rec.contexts.join(', '));
    if (rec.consequence) push('  Consequence: ' + rec.consequence);
    if (rec.counter_evidence && rec.counter_evidence.length) push('  Counter-evidence: ' + rec.counter_evidence.join('; '));
    if (rec.uncertainty) push('  Uncertainty: ' + rec.uncertainty);
    push('');
  }
  push('Criteria assessed: ' + completed + ' of ' + total);
  push(blank);

  // Stage 3 — Childhood History
  push('Stage 3: Childhood History (Pre-Age-12)');
  if (state.childhood && state.childhood.evidence && state.childhood.evidence.length) {
    var mems = state.childhood.evidence;
    for (var j = 0; j < mems.length; j++) {
      var m = mems[j];
      push('- ' + (m.behavior || '(no behavior described)') + ' (age: ' + (m.age != null ? m.age : 'unspecified') + ', source: ' + (m.source || 'memory') + ', concrete: ' + !!m.concrete + ', against: ' + !!m.against + ')');
    }
  } else {
    push('No childhood memories collected.');
  }
  if (state.onset) push('Onset rating: ' + state.onset);
  push(blank);

  // Stage 4 — Functional Impairment + Multiple Settings
  push('Stage 4: Functional Impairment & Multiple Settings');
  push('Impaired domains: ' + (state.domains_impaired && state.domains_impaired.length ? state.domains_impaired.join(', ') : 'None reported'));
  push('Settings: ' + (state.settings && state.settings.length ? state.settings.join(', ') : 'None reported'));
  push(blank);

  // Stage 5 — Focused Differential Check
  push('Stage 5: Focused Differential Check');
  if (state.differentials_flagged && state.differentials_flagged.length) {
    push('Flagged factors: ' + state.differentials_flagged.join(', '));
  } else {
    push('No differential factors flagged.');
  }
  push(blank);

  // Final report / recommendation
  if (r) {
    push('--- Final Assessment Summary ---');
    push('');
    push('Recommendation: ' + (r.tier || 'N/A'));
    push('');
    push(r.recommendation || '');
    push('');
    if (r.consistency) {
      push('Evidence consistency:');
      push('  Consistent: ' + r.consistency.consistent);
      push('  Partially consistent: ' + r.consistency.partially_consistent);
      push('  Insufficient: ' + r.consistency.insufficient);
    }
    if (r.adult_symptoms) {
      push('');
      push('Adult symptom pattern: ' + (r.adult_symptoms.pattern || 'unknown'));
      push('  Inattentive: ' + (r.adult_symptoms.inattentive_supported || 0) + ' supported');
      push('  Hyperactive: ' + (r.adult_symptoms.hyperactive_supported || 0) + ' supported');
    }
    push('');
    push('DSM-5 Criteria:');
    if (r.dsm5_criteria) {
      var dsm = r.dsm5_criteria;
      push('  A. Symptom count: ' + (dsm.A_symptom_count || 'not_supported'));
      push('  B. Duration (>=6 months): ' + (dsm.B_duration || 'not_supported'));
      push('  C. Childhood onset (<12): ' + (dsm.C_onset || 'not_supported'));
      push('  D. Multiple settings (2+): ' + (dsm.D_settings || 'not_supported'));
      push('  E. Functional impairment: ' + (dsm.E_impairment || 'not_supported'));
      push('  F. Not better explained: ' + (dsm.F_not_better_explained || 'not_supported'));
    }
    push('');
    if (r.contradictions && r.contradictions.list && r.contradictions.list.length) {
      push('Contradictory evidence:');
      for (var k = 0; k < r.contradictions.list.length; k++) push('  - ' + r.contradictions.list[k]);
      push('');
    }
    if (r.differential_note) push('Note: ' + r.differential_note);
    if (r.contradiction_note) push('Note: ' + r.contradiction_note);
  }

  push('');
  push('---');
  push('');
  push(r && r.disclaimer ? r.disclaimer : 'This is not a medical diagnosis and does not replace an evaluation by a qualified clinician.');
  push('Screening, not a diagnosis.');

  return lines.join('\n');
}

module.exports = {
  createStage2Assessment, begin, processTurn, nextOrDone, getReport, getProgress,
  localizeReport,
  beginStage3, processStage3Turn,
  beginStage4, processStage4Turn,
  beginStage5, processStage5Turn,
  currentQuestion, snapshot, loadSnapshot, clearSnapshot, snapshotExists,
  CRITERIA, IMPAIRMENT_PROBES,
  EXPORT_FORMAT_VERSION, exportSession, importSession, exportHumanReadable,
};
