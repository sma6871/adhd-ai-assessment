'use strict';

// Data model / evidence schema — locked per CLINICAL_ADHD_PROTOCOL.md §2 (per-criterion evidence),
// §3 (bounded follow-up), and §9a (top-level engine inputs). This file is the single source of
// the state-document shape.
//
// IMPORTANT: nothing here is clinical logic or conclusions. The engine (engine.js) owns all
// deterministic evaluation; the interviewer only fills evidence fields.

const EVIDENCE_STATUSES = ['supported', 'partially_supported', 'unsupported', 'uncertain'];
const CONFIDENCE_LEVELS = ['strong', 'moderate', 'weak'];
const ONSET_RATINGS = ['strong', 'moderate', 'weak', 'insufficient', 'evidence_against'];

// Required fields collected per criterion during the interview (§2).
// `status`, `confidence` are DERIVED by the engine, not chosen by the interviewer.
// `tries` / `followups` (§3) track the bounded turn cap; `uncertainty` is candidate-stated
// or engine-set (§4). Stage-specific inputs (onset, duration, settings, etc.) live at the
// top level of the assessment document (§9a), not on the per-criterion record.
function blankEvidenceRecord(criterionId) {
  return {
    criterion: criterionId,
    status: null,            // supported | partially_supported | unsupported | uncertain  (engine-derived, §4)
    confidence: null,         // strong | moderate | weak (engine-derived, §4)
    core_answer: null,        // frequency: Never/Rarely/Sometimes/Often/Very Often (§2)
    example: null,            // concrete real-life example (§2); required for Often/Very Often
    contexts: [],             // settings where it happens (§2)
    consequence: null,        // functional cost (§2)
    counter_evidence: [],     // reasons the behavior does NOT occur (§2, §8)
    uncertainty: null,        // candidate-stated or engine-set note when evidence insufficient (§2, §4)
    tries: 0,                 // core-answer attempts toward the safety cap (§3)
    followups: 0,             // post-core questions asked, capped at MAX_FOLLOWUPS (§3)
    source: 'interview',      // interview | self_report
  };
}

// A single assessment = one JSON document (state machine), per FAST_TRACK §10.
// Stage-specific inputs live here at the top level per protocol §9a (engine inputs),
// not on individual criterion records.
function newAssessment(id) {
  return {
    id,
    stage: 'SCREENING',       // current stage (see STAGES in criteria.js)
    criterion_index: null,   // index into the ordered criteria list for the current stage
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    screening: null,        // ASRS result: 'positive' | 'negative' (Stage 1)
    duration: null,         // >=6 months persistence: met | uncertain | not_met
    onset: null,            // ONSET_RATINGS (Stage 3)
    settings: [],           // concrete settings (Stage 4)
    domains_impaired: [],   // impairment domains (Stage 4)
    differentials_flagged: [], // confounder flags (Stage 5)
    criteria: {},           // { [criterionId]: evidenceRecord }
    contradictions: [],     // aggregated counter-evidence
    report: null,           // final §9 evaluation summary (set when stage === 'REPORT')
  };
}

// Lightweight runtime validators (defensive; the deterministic engine is the source of truth).
const validators = {
  isStatus(v) { return EVIDENCE_STATUSES.includes(v); },
  isConfidence(v) { return CONFIDENCE_LEVELS.includes(v); },
  isFrequency(v) { return ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'].includes(v); },
  isOnset(v) { return ONSET_RATINGS.includes(v); },
};

module.exports = {
  EVIDENCE_STATUSES, CONFIDENCE_LEVELS, ONSET_RATINGS,
  blankEvidenceRecord, newAssessment, validators,
};
