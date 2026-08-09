'use strict';

// DETERMINISTIC ASSESSMENT ENGINE.
// Owns: stage/criterion tracking, per-criterion completion rules (§2/§4),
// bounded follow-up cap (§3), and the §9 deterministic final evaluation.
// The LLM interviewer (interviewer/interviewer.js) only fills evidence fields
// and asks questions — it never sets status, the tier, or the recommendation.

const { CRITERIA, INATTENTIVE, HYPERACTIVE, SYMPTOM_THRESHOLD, ONSET_AGE } = require('./criteria');
const { EVIDENCE_STATUSES, ONSET_RATINGS, blankEvidenceRecord } = require('./schema');

const MAX_FOLLOWUPS = 3;           // §3: max 3 follow-up questions per criterion after the core question
const MAX_TURNS_PER_CRITERION = 5; // hard safety cap (core + up to 3 follow-ups + 1 buffer): guarantees the
                                 // interview always advances even if extraction is repeatedly flaky.
const POSITIVE_FREQ = ['Often', 'Very Often'];
const LOW_FREQ = ['Never', 'Rarely'];
const MID_FREQ = ['Sometimes'];

// Interview order for Stage 2: inattentive (01-09) then hyperactive (01-09).
function orderedCriteria() {
  return [...CRITERIA];
}

// --- §2 / §4: per-criterion readiness + status derivation (deterministic) ---

function hasCore(r) { return r && r.core_answer != null; }
function hasExample(r) { return r && r.example && r.example.trim().length > 0; }
function hasContexts(r) { return r && Array.isArray(r.contexts) && r.contexts.length > 0; }
function hasConsequence(r) { return r && r.consequence && r.consequence.trim().length > 0; }

// Context-limited when only one setting is cited or counter-evidence notes a limit.
function isContextLimited(r) {
  return (!hasContexts(r)) || (r.contexts.length === 1) || (r.counter_evidence && r.counter_evidence.length > 0);
}

// Readiness to assign a status — frequency-aware per §2 (a concrete example is required
// only when the behavior is Often/Very Often; Never/Rarely establishes "unsupported"
// on frequency alone, so a consequence is NOT required to be ready for that status).
function isReadyForStatus(r) {
  if (!hasCore(r)) return false;
  const fa = r.core_answer;
  if (LOW_FREQ.includes(fa)) return true;            // Never/Rarely -> unsupported is determinable
  if (MID_FREQ.includes(fa)) return hasExample(r);  // Sometimes needs at least a concrete example
  if (POSITIVE_FREQ.includes(fa)) return hasExample(r) && hasContexts(r) && hasConsequence(r);
  return false;
}

// Derive status + confidence from collected evidence (§4), deterministically.
// These are evidence-quality heuristics encoding §4, NOT diagnostic thresholds.
function deriveStatus(record) {
  const fa = record.core_answer;
  const ctxLimited = isContextLimited(record);

  if (LOW_FREQ.includes(fa)) {
    // Behavior does not occur at a relevant frequency -> unsupported (§4).
    const confidence = (hasExample(record) || (record.counter_evidence && record.counter_evidence.length)) ? 'moderate' : 'weak';
    return { status: 'unsupported', confidence, reason: 'behavior not present at a relevant frequency' };
  }

  if (MID_FREQ.includes(fa)) {
    // Sometimes = some evidence but not clearly above normal variation (§4).
    // Requires a concrete example to be ready; otherwise the engine follows up.
    if (!hasExample(record)) return { status: null, confidence: null, reason: 'awaiting concrete example' };
    const confidence = hasContexts(record) ? 'moderate' : 'weak';
    return { status: 'partially_supported', confidence, reason: 'frequency sometimes; not clearly above normal variation' };
  }

  if (POSITIVE_FREQ.includes(fa)) {
    // Often/Very Often. Needs concrete example + contexts + consequence (§2) to be supported.
    if (!(hasExample(record) && hasContexts(record))) {
      return { status: null, confidence: null, reason: 'awaiting concrete example/context/consequence' };
    }
    if (ctxLimited) {
      // Frequent but context-limited or with counter-evidence -> partially supported (§4).
      return { status: 'partially_supported', confidence: hasConsequence(record) ? 'moderate' : 'weak', reason: 'frequent but context-limited or counter-evidence present' };
    }
    return {
      status: 'supported',
      confidence: hasConsequence(record) ? 'strong' : 'moderate',
      reason: 'frequent behavior with concrete example, context, and consequence',
    };
  }

  return { status: null, confidence: null, reason: 'core answer not collected' };
}

// Decide the engine's move for the current criterion:
//  - 'complete' : ready to assign a final status -> engine assigns it, advance.
//  - 'followup' : evidence incomplete; request one more question (if under cap).
//  - 'uncertain' : followup cap exhausted and still incomplete -> mark uncertain, advance.
// Decide the engine's move for the current criterion (deterministic — LLM never calls this):
//  - 'ask_core'  : core answer not yet collected.
//  - 'complete'  : evidence sufficient to assign a final status -> engine assigns it, advance.
//  - 'followup'  : evidence incomplete; request one more question (if under cap).
//  - 'uncertain' : follow-up cap OR hard turn cap exhausted and still incomplete -> advance as uncertain.
function engineMove(record) {
  if (!record) return { move: 'ask_core', followup: 0 };
  if (!hasCore(record)) {
    if ((record.tries || 0) >= MAX_TURNS_PER_CRITERION) return { move: 'uncertain' };
    return { move: 'ask_core' };
  }
  if (isReadyForStatus(record)) return { move: 'complete' };

  const asked = (record.followups || 0);
  if (asked >= MAX_FOLLOWUPS || (record.tries || 0) >= MAX_TURNS_PER_CRITERION) return { move: 'uncertain' };
  return { move: 'followup', followup: asked }; // interviewer will ask follow-up #asked+1
}

function markUncertain(record) {
  record.status = 'uncertain';
  record.confidence = 'weak';
  if (!record.uncertainty) record.uncertainty = 'Insufficient concrete evidence after bounded follow-up.';
  return record;
}

// Advance the interviewer pointer to the next unready criterion in Stage 2.
function currentCriterionIndex(state) {
  const order = orderedCriteria();
  let i = state.criterion_index == null ? 0 : state.criterion_index;
  // resume at stored index, but skip already-complete (terminal) criteria.
  // A terminal status (supported/partially_supported/unsupported/uncertain) means
  // the engine has already adjudicated this criterion -> advance past it.
  // NOTE: `r.uncertainty` set by markUncertain is a TERMINAL marker, not a blocker;
  // only extractor-collected `r.uncertainty` (on a non-terminal record) blocks.
  while (i < order.length) {
    const r = state.criteria[order[i].id] || blankEvidenceRecord(order[i].id);
    if (r.status) { i++; continue; }                       // terminal -> skip & advance
    const { status } = deriveStatus(r);
    if (status === null || r.uncertainty) break;           // not ready, or candidate expressed uncertainty
    i++;
  }
  return i;
}

function currentCriterion(state) {
  const order = orderedCriteria();
  const i = currentCriterionIndex(state);
  if (i >= order.length) return null;
  state.criterion_index = i;
  return order[i];
}

function hasMoreCriteria(state) {
  return currentCriterion(state) !== null;
}

// --- §9: deterministic final evaluation (no LLM) ---

function countSupported(domainIds) {
  // domainIds: array of criterion ids
  let n = 0;
  for (const id of domainIds) {
    const r = this.criteria[id];
    if (r && r.status === 'supported') n++;
  }
  return n;
}

function evaluate(state) {
  const inattIds = INATTENTIVE.map(c => c.id);
  const hyperIds = HYPERACTIVE.map(c => c.id);
  const inatt_supported = inattIds.reduce((n, id) => n + (state.criteria[id] && state.criteria[id].status === 'supported' ? 1 : 0), 0);
  const hyper_supported = hyperIds.reduce((n, id) => n + (state.criteria[id] && state.criteria[id].status === 'supported' ? 1 : 0), 0);
  const inatt_partial = inattIds.reduce((n, id) => n + (state.criteria[id] && state.criteria[id].status === 'partially_supported' ? 1 : 0), 0);
  const hyper_partial = hyperIds.reduce((n, id) => n + (state.criteria[id] && state.criteria[id].status === 'partially_supported' ? 1 : 0), 0);

  const onset = state.onset;      // ONSET_RATINGS
  const duration = state.duration; // met | uncertain | not_met
  const settings = (state.settings || []).length;
  const multiple_settings = settings >= 2; // DSM-5 D (§9a-D / §6)
  const domains_impaired = (state.domains_impaired || []).length;
  const differentials = (state.differentials_flagged || []).length;

  // §8: aggregate contradictory evidence (evidence weakening the ADHD hypothesis).
  // Gathered from per-criterion counter_evidence (§2) + childhood evidence-against (§5).
  // This is evidence-summary, NOT clinical inference; it surfaces what the user reported.
  const contradictions_list = [];
  const contraSeen = new Set();
  for (const c of CRITERIA) {
    const r = state.criteria[c.id];
    if (r && Array.isArray(r.counter_evidence)) {
      for (const ce of r.counter_evidence) {
        const k = String(ce);
        if (k && !contraSeen.has(k)) { contraSeen.add(k); contradictions_list.push(`[${c.id}] ${k}`); }
      }
    }
  }
  // §8: childhood 'against' memories are contradictions, even when onset is 'weak' (H3 mixed evidence).
  const childhoodEvidence = (state.childhood && state.childhood.evidence) || [];
  for (const ce of childhoodEvidence.filter(e => e && e.against)) {
    const k = String(ce.behavior || '');
    if (k && !contraSeen.has(k)) { contraSeen.add(k); contradictions_list.push(`[childhood] ${k}`); }
  }
  if (onset === 'evidence_against' && !contraSeen.has('onset')) { contraSeen.add('onset'); contradictions_list.push('Childhood evidence suggests ADHD-like behaviors were not present before age 12.'); }
  const contradictions = contradictions_list.length;

  // §7 / §9a-F: differentials. flagDifferentialEvidence (M6) examines Stage 5 factors
  // and returns flagged labels + "strong" ones (user tied a factor to ADHD-like symptoms via
  // symptom_mentions). §9b-F uses strong vs partial to classify §9a-F.
  const diffEvidence = (state.differential && state.differential.evidence)
    || flagDifferentialEvidence(state); // fallback: compute directly if not yet finalized
  const differentialConsiderations = diffEvidence.considerations;
  const stronglyExplanatory = diffEvidence.strong.length;

  const symptomatic = inatt_supported >= SYMPTOM_THRESHOLD || hyper_supported >= SYMPTOM_THRESHOLD;

  // §9b DSM-5 criteria checklist (evidence-supported / partially / not)
  const dsm = {
    A_symptom_count: symptomatic ? 'supported' : 'not_supported',
    B_duration: duration === 'met' ? 'supported' : (duration === 'uncertain' ? 'partially_supported' : 'not_supported'),
    C_onset: (onset === 'strong' || onset === 'moderate') ? 'supported'
      : (onset === 'weak') ? 'partially_supported'
      : 'not_supported', // insufficient | evidence_against -> not_supported
    D_settings: settings >= 2 ? 'supported' : (settings === 1 ? 'partially_supported' : 'not_supported'),
    E_impairment: domains_impaired >= 1 ? 'supported' : 'not_supported',
    // §9b-F: a STRONG alternative explanation (user reported a factor AND tied it to ADHD-like
    // symptoms) -> not_supported; otherwise any flagged differential -> partially_supported.
    F_not_better_explained: stronglyExplanatory > 0 ? 'not_supported' : (differentials > 0 ? 'partially_supported' : 'supported'),
  };

  // §9c pattern
  let pattern = 'below_threshold';
  const inatt = inatt_supported >= SYMPTOM_THRESHOLD;
  const hyper = hyper_supported >= SYMPTOM_THRESHOLD;
  if (inatt && hyper) pattern = 'combined';
  else if (inatt) pattern = 'inattentive';
  else if (hyper) pattern = 'hyperactive_impulsive';

  // §9d evidence-consistency summary
  const consistency = {
    // §9d: Consistent requires zero contradictions (§8: contradictions lower confidence).
    consistent: symptomatic
      && (onset === 'strong' || onset === 'moderate')
      && settings >= 2
      && domains_impaired >= 1
      && duration === 'met'
      && dsm.F_not_better_explained !== 'not_supported'
      && contradictions === 0,
    partially_consistent: symptomatic && !(
      (onset === 'strong' || onset === 'moderate')
      && settings >= 2
      && domains_impaired >= 1
      && duration === 'met'
      && dsm.F_not_better_explained !== 'not_supported'
      && contradictions === 0
    ),
    insufficient: !symptomatic || onset === 'evidence_against' || duration === 'not_met',
  };

  // §9e recommendation tiers (product wording; never a diagnosis)
  let tier, text;
  if (consistency.consistent) {
    tier = 'Consistent';
    text = 'Your responses are consistent with how ADHD tends to present, and there is evidence of early onset and cross-setting impact. A professional ADHD evaluation may be worthwhile — especially to explore alternative explanations.';
  } else if (consistency.insufficient) {
    tier = 'Insufficient';
    text = 'This assessment does not show a pattern consistent with ADHD. Still, if attention, organization, or energy difficulties meaningfully affect your life, a professional evaluation may be worthwhile to explore other causes.';
  } else {
    tier = 'Partially consistent';
    text = 'Some of your responses are consistent with ADHD, but supporting evidence (early onset, impact across settings, or impairment) is limited or uncertain, or alternative explanations were flagged. A professional evaluation may still be worthwhile to clarify.';
  }

    const perCriterion = CRITERIA.map(c => {
    const r = state.criteria[c.id];
    return {
      criterion: c.id,
      question: c.question,
      dsm: c.dsm,      // A (inattentive) | B (hyperactive/impulsive) | C (combined)
      domain: c.id.startsWith('INATT_') ? 'inattentive' : 'hyperactive_impulsive',
      status: r ? r.status : 'uncertain',
      confidence: r ? r.confidence : 'weak',
      evidence: r ? (r.evidence || []) : [],
      counter_evidence: r ? (r.counter_evidence || []) : [],
      contexts: r ? (r.contexts || []) : [],
      example: r ? (r.example || null) : null,
    };
  });

  // §9f product-readable notes (evidence-summary; NOT clinical inference).
  const differential_note = differentialConsiderations.length
    ? `Alternative explanations noted: ${differentialConsiderations.map(x => `${x.factor}${x.could_explain_for_symptoms ? ' (tied to ADHD-like symptoms)' : ''}`).join(', ')}.`
    : null;
  const contradiction_note = contradictions_list.length
    ? `Factors that the ADHD pattern does not cleanly explain: ${contradictions_list.join(' | ')}.`
    : null;

  return {
    not_a_diagnosis: true,
    disclaimer: 'This is not a medical diagnosis and does not replace an evaluation by a qualified clinician.',
    adult_symptoms: {
      pattern,
      inattentive_supported: inatt_supported,
      hyperactive_supported: hyper_supported,
      inattentive_partial: inatt_partial,
      hyperactive_partial: hyper_partial,
      threshold: SYMPTOM_THRESHOLD,
    },
    dsm5_criteria: dsm,
    consistency,
    tier,
    recommendation: text,
    childhood_onset: { rating: onset, source: 'Stage 3 (concrete pre-age-12 evidence)' },
    duration_persistence: { rating: duration, requirement: '>=6 months (DSM-5)' },
    settings: { count: settings, multiple_settings, requirement: '>=2 (DSM-5)' },
    impairment: { domains: domains_impaired, count: domains_impaired },
    differentials: { flagged: differentials, list: state.differentials_flagged || [] },
    contradictions: { count: contradictions, list: contradictions_list },
    // §9f product-readable notes (evidence-summary; NOT clinical inference).
    differential_note,
    contradiction_note,
    per_criterion: perCriterion,
    stage2_only: !onset && settings === 0 && domains_impaired === 0 && differentials === 0
      ? 'Adult-symptom evidence collected. Childhood onset, multiple-settings, impairment, and differential check (Stages 3-5) remain to be completed for a full assessment.'
      : null,
    summary: `${text} ${differential_note || ''} ${contradiction_note || ''} This is not a medical diagnosis and does not replace an evaluation by a qualified clinician.`.replace(/\s+/g, ' ').trim(),
  };
}

// Determine the next follow-up question *kind* to ask, cycling deterministically.
// Capped by MAX_FOLLOWUPS (engineMove enforces the cap).
function pickFollowupKind(followupsAsked) {
  const order = ['example', 'context', 'consequence'];
  return order[(followupsAsked % order.length)] || 'example';
}

// Deterministic core question text (no LLM — the engine asks the core question).
function formatCoreQuestion(criterion) {
  return `${criterion.question}\n\nOver the past 6 months, how often does this happen?\n` +
    'Never — Rarely — Sometimes — Often — Very Often';
}

// Deterministic follow-up prompts (no LLM — the engine asks follow-ups).
function followupPrompt(criterion, kind) {
  switch (kind) {
    case 'example':
      return `You indicated this happens with some frequency. Can you describe one concrete recent situation where this happened — what was going on, what did you do, and what happened as a result?`;
    case 'context':
      return `Where does this tend to happen — at work, at home, in social situations, or elsewhere?`;
    case 'consequence':
      return `What does this cost you or get in the way of when it happens?`;
    case 'clarify':
      return `To be sure I'm tracking: is this different from just feeling bored or tired, or from something that happens to everyone occasionally?`;
    default:
      return `Can you say a bit more about that for this item?`;
  }
}

// Merge an extracted evidence packet into a record (LLM-extracted fields only).
// Engine-derived fields (status/confidence/impairment) are NOT set here.
function mergeEvidence(record, ev) {
  if (!ev) return record;
  if (ev.core_answer != null) record.core_answer = ev.core_answer;
  if (ev.example) record.example = ev.example;
  if (Array.isArray(ev.contexts) && ev.contexts.length) record.contexts = ev.contexts;
  if (ev.consequence) record.consequence = ev.consequence;
  if (Array.isArray(ev.counter_evidence) && ev.counter_evidence.length) {
    record.counter_evidence = Array.isArray(record.counter_evidence) ? record.counter_evidence : [];
    record.counter_evidence = [...new Set([...record.counter_evidence, ...ev.counter_evidence])];
  }
  if (ev.uncertainty) record.uncertainty = ev.uncertainty;
  return record;
}

// Strip a record down to LLM-visible evidence fields (engine fields hidden from the interviewer).
function stripEvidence(record) {
  return {
    core_answer: record.core_answer,
    example: record.example,
    contexts: record.contexts,
    consequence: record.consequence,
    counter_evidence: record.counter_evidence,
    uncertainty: record.uncertainty,
  };
}

// --- §5: Childhood-onset evidence (Stage 3) ---
// These concrete probes are asked DETERMINISTICALLY by the engine (no LLM question-writing).
// Each asks the user to recall/attribute a pre-age-12 behavior — the engine never asks for
// assumptions; evidence must be recalled/attributed as childhood behavior.
const CHILDHOOD_PROBES = [
  { id: 'report_card', prompt: 'Do you recall any primary-school report cards or teacher comments that mentioned attention, organization, hyperactivity, or impulsivity?' },
  { id: 'homework', prompt: 'As a child (under 12), how did you tend to handle homework completion — did you start it, finish it, or leave it unfinished?' },
  { id: 'organization', prompt: 'As a child, was your desk, backpack, or room generally organized, or were small items (pencils, toys, papers) frequently lost or misplaced?' },
  { id: 'forgetting', prompt: 'As a child, did you often forget daily things — like bringing home permission slips, lunches, or school supplies?' },
  { id: 'sit_still', prompt: 'As a child, were you able to sit still and quiet during class or meals, or did you squirm, fidget, or seem "on the go"?' },
  { id: 'interrupt', prompt: 'As a child, did you tend to interrupt, blurt out answers, or have trouble waiting your turn (e.g., in class or with friends)?' },
  { id: 'peer_relations', prompt: 'As a child, how were your friendships and peer interactions at recess — did you play cooperatively, or tended to be overly chummy/intrusive?' },
  { id: 'extracurricular', prompt: 'As a child, how did you approach organized activities or sports — could you stick with them, or did you lose interest or dash off quickly?' },
  { id: 'parent_obs', prompt: 'Do you recall any parent/guardian observations from before age 12 about your attention, energy, or self-control — as they were described then?' },
];

// Deterministic, engine-asked childhood prompt text (no LLM).
function formatChildhoodQuestion(probe) {
  return `${probe.prompt}\n\nIf you recall anything, describe it as specifically as you can (what you remember, roughly what age, and where it came from — e.g., a report card, a teacher, a parent, or your own memory).`;
}

function childhoodQuestion(probe) {
  return formatChildhoodQuestion(probe);
}

// Rate childhood-onset evidence quality per CLINICAL_ADHD_PROTOCOL.md §5.
// PURE & SELF-CONTAINED: reads ONLY the childhood evidence array — it NEVER consults
// state.criteria (adult symptom records). Childhood onset is never inferred from adult symptoms.
//
// Evidence item contract (produced by the extractor):
//   { behavior, age, source, concrete:bool, against:bool, vague:bool }
  //   - age: numeric if stated (engine excludes age >= ONSET_AGE), or null if unstated
//   - source: 'report_card'|'teacher'|'parent'|'memory'|... (external corroboration = strong)
//   - concrete: specific, attributable pre-12 behavior (true) vs general/vague
//   - against: concrete recall that behaviors were NOT present (e.g., "attentive, organized child")
//   - vague: general memory with no specifics (e.g., "always hyper" with no detail)
function rateOnset(childhoodEvidence) {
  const ev = Array.isArray(childhoodEvidence) ? childhoodEvidence : [];
  const childhood = ev.filter(e => (e && (e.age == null || e.age < ONSET_AGE)));

  const againsts = childhood.filter(e => e.against);
  const concretes = childhood.filter(e => e.concrete && !e.against);
  const externals = childhood.filter(e => e.concrete && !e.against && ['report_card', 'teacher', 'parent'].includes(e.source));

  // H3 / §5 mixed-evidence rule: evidence_against only when against evidence fully
  // negates supporting evidence (against memories exist AND no concrete supporting memories).
  // When both against and supporting concrete memories exist -> weak (conflicted; against is a contradiction).
  if (againsts.length > 0) {
    if (concretes.length === 0) return 'evidence_against';
    return 'weak';
  }

  if (concretes.length === 0) {
    // No specific childhood behaviors recalled.
    if (childhood.some(e => e.vague)) return 'weak';          // vague/general memories only
    if (childhood.length > 0) return 'insufficient';          // non-childhood-age or unattributable
    return 'insufficient';                                    // "I'm not sure" / nothing recalled
  }

  // Concrete pre-age-12 behaviors present (no against evidence).
  if (externals.length > 0) return 'strong';                  // specific + external corroboration (report card/teacher/parent)
  if (concretes.length >= 2) return 'moderate';               // 2-4 concrete behaviors, recalled
  return 'weak';                                              // only 1 concrete childhood behavior
}

function childhoodDone(state) {
  return state.stage === 'CHILDHOOD' && state.childhood && state.childhood.done;
}

// --- §6: Functional impairment & multiple-settings (Stage 4) ---
// The 10 concrete life-area domains from CLINICAL_ADHD_PROTOCOL.md §6.
const IMPAIRMENT_DOMAINS = [
  'Work', 'Education', 'Relationships', 'Household / housework',
  'Finances', 'Time management', 'Organization', 'Driving',
  'Daily routines', 'Emotional consequences',
];

// Deterministic prompts the engine asks (no LLM question-writing). Per §6 these collect
// CONCRETE examples + concrete grounding for settings — not bare assertions.
function formatImpairmentQuestion() {
  return 'Think back over the past 6 months. In which areas of life are attention, focus, organization, or energy difficulties costly if someone were watching closely? For each area you mention, give ONE specific recent example and name the area (e.g., work, relationships, finances, daily routines, organization, driving, school, household, time management, emotional impact).';
}
function formatSettingsQuestion() {
  return 'Where do you regularly experience these difficulties? Name AT LEAST TWO specific settings (e.g., work, home, social, school) and give one brief, concrete example of how it shows up in each.';
}

// Dedup by normalized key, keeping first occurrence.
function dedupByKey(items, keyFn) {
  const seen = new Set();
  return items.filter(x => {
    const k = keyFn(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Assess Stage 4 evidence from the collected working record (engine-rated, Stage 4 evidence only).
// Reads ONLY state.impairment — never state.criteria / onset / symptoms (no cross-stage inference).
// §6 completion heuristic: >=2 concrete impairment examples across life AND >=2 settings w/ concrete grounding.
// (Counts feed §9a-D `settings` and §9a-E `domains_impaired`.)
function assessImpairment(impairmentState) {
  const rawExamples = (impairmentState && impairmentState.examples) || [];
  const rawSettings = (impairmentState && impairmentState.settings) || [];

  const concreteExamples = rawExamples.filter(e => e && e.concrete && (e.domain || '').trim());
  const concreteSettings = rawSettings.filter(s => s && s.concrete && (s.setting || '').trim());

  const domains = dedupByKey(concreteExamples, e => e.domain.toLowerCase());
  const settings = dedupByKey(concreteSettings, s => s.setting.toLowerCase());

  return {
    domains: domains.map(e => e.domain),            // distinct impaired domains (concrete) -> §9a-E
    settings: settings.map(s => s.setting),          // distinct grounded settings -> §9a-D
    example_count: concreteExamples.length,         // §6 heuristic: >=2 concrete examples
    settings_count: concreteSettings.length,        // §6 heuristic: >=2 grounded settings
    multiple_settings: concreteSettings.length >= 2, // §6: ">=2 settings with concrete grounding"; <2 recorded explicitly
    complete: concreteExamples.length >= 2 && concreteSettings.length >= 2,
  };
}

function impairmentDone(state) {
  return state.stage === 'IMPAIRMENT' && state.impairment && state.impairment.done;
}

// --- §7: Focused differential check (Stage 5) — flagging ONLY, never a diagnosis ---
// The 7 factors from CLINICAL_ADHD_PROTOCOL.md §7. By the protocol's own definition these are
// factors that "could explain or contribute to ADHD-like symptoms," so plausibility is the
// protocol's classification — the engine does NOT invent a plausibility table.
const SYMPTOM_ENDORSED = ['Sometimes', 'Often', 'Very Often']; // a reported ADHD-like symptom (§2 core answer, past ~6 months)

const DIFFERENTIAL_FACTORS = [
  { id: 'anxiety', label: 'Anxiety', probe: 'Do you experience persistent worry, restlessness, muscle tension, or racing thoughts about threats? If so, does it seem related to your attention/focus difficulties?' },
  { id: 'depression', label: 'Depression', probe: 'Do you get persistent low mood, loss of interest/pleasure, fatigue, sleep/appetite changes, or feelings of worthlessness? If so, does it seem related to concentration or energy?' },
  { id: 'sleep', label: 'Sleep problems', probe: 'Do you have insomnia, fragmented or non-restorative sleep, signs of sleep apnea, or an irregular sleep schedule? If so, does it seem related to attention or fatigue?' },
  { id: 'bipolar', label: 'Bipolar-spectrum', probe: 'Have you had periods of abnormally elevated mood/energy, decreased need for sleep, or racing thoughts (distinct from your baseline)? If so, does it relate to impulsivity or restlessness?' },
  { id: 'substance', label: 'Substance/alcohol', probe: 'Do you use alcohol or substances regularly in a way that could affect your attention or self-regulation?' },
  { id: 'stress', label: 'Chronic stress / burnout', probe: 'Are you experiencing prolonged overwhelm, exhaustion, or detachment from work/things? If so, does it relate to focus or executive difficulties?' },
  { id: 'medical', label: 'Medical / physical', probe: 'Do you have or suspect any medical/physical condition (e.g., thyroid issues, sleep apnea, chronic pain) or take medications that affect attention? If so, does it relate to your focus/energy?' },
];

// Deterministic, engine-asked differential prompt (no LLM question-writing).
function formatDifferentialQuestion(factor) {
  return `${factor.probe}\n\nAnswer yes/no and, if applicable, briefly note how (if at all) it may relate to the attention/energy/focus difficulties described earlier. This is a flagging screen only — it is not a diagnosis.`;
}

// Flag differentials deterministically per §7: a factor is flagged when the user REPORTED it
// AND an ADHD-like symptom was endorsed in Stage 2 (so the factor is plausibly linked to a
// reported symptom). Reads ONLY state.differential (Stage 5) + Stage 2 core answers — never
// onset / settings / impairment (no cross-stage inference). Returns flagged factor LABELS.
function flagDifferentials(state) {
  const symptomEndorsed = Object.keys(state.criteria || {}).some(id => {
    const r = state.criteria[id];
    return r && SYMPTOM_ENDORSED.includes(r.core_answer);
  });
  const collected = (state.differential && state.differential.factors) || [];
  const flagged = [];
  for (const f of collected) {
    if (f && f.reported && symptomEndorsed) {
      const label = (DIFFERENTIAL_FACTORS.find(d => d.id === f.factor) || {}).label || f.factor;
      if (!flagged.includes(label)) flagged.push(label);
    }
  }
  return flagged;
}

// §7 / §9b-F: enrich flagged differentials with "strong" evidence.
// A flagged factor is a STRONG alternative explanation ONLY when the user themselves tied it
// to ADHD-like symptoms (symptom_mentions non-empty). This is complementary to flagDifferentials
// (which only decides whether to flag) — it adds the evidence dimension used by §9b-F.
// Reads ONLY state.differential.factors (Stage 5) + Stage 2 core endorsements via flagDifferentials.
function flagDifferentialEvidence(state) {
  const flagged = flagDifferentials(state);
  const collected = (state.differential && state.differential.factors) || [];
  const flaggedLabels = new Set(flagged);
  const considerations = [];
  for (const f of collected) {
    if (f && f.reported) {
      const label = (DIFFERENTIAL_FACTORS.find(d => d.id === f.factor) || {}).label || f.factor;
      // Only consider factors that pass the flagDifferentials gate (reported + Stage 2 symptom endorsed).
      if (!flaggedLabels.has(label)) continue;
      const couldExplain = Array.isArray(f.symptom_mentions) && f.symptom_mentions.length > 0;
      considerations.push({ factor: label, could_explain_for_symptoms: couldExplain });
    }
  }
  const strong = considerations.filter(x => x.could_explain_for_symptoms).map(x => x.factor);
  return { flagged, strong, considerations };
}

function differentialDone(state) {
  return state.stage === 'DIFFERENTIAL' && state.differential && state.differential.done;
}


// --- §9a-B / §9b-B: derive ≥6-month duration/persistence from Stage 2 core answers ONLY.
// Per protocol, the duration evidence source is "Stage 2 core answers (§2)" — the core question
// is framed over the past ~6 months, so a positive frequency endorsement confirms persistence
// over the ≥6-month DSM-5 timeframe. This reads ONLY core_answer values; it does not consult
// adult symptom status, onset, or any other stage's data (no clinical inference beyond §2).
const POSITIVE_DURATION_FREQ = ['Sometimes', 'Often', 'Very Often'];
const NEGATIVE_DURATION_FREQ = ['Never', 'Rarely'];

function deriveDuration(state) {
  const answers = Object.keys(state.criteria || {})
    .map(id => state.criteria[id] && state.criteria[id].core_answer)
    .filter(v => v != null);
  if (answers.length === 0) return 'uncertain';                          // no core answers collected
  if (answers.some(f => POSITIVE_DURATION_FREQ.includes(f))) return 'met'; // symptom(s) endorsed within the ≥6-month frame
  if (answers.every(f => NEGATIVE_DURATION_FREQ.includes(f))) return 'not_met'; // all answered behaviors absent within the ≥6-month frame
  return 'uncertain';                                                     // mixed/uninterpretable (defensive)
}

module.exports = {
  orderedCriteria, hasCore, hasExample, hasContexts, hasConsequence,
  isReadyForStatus, deriveStatus, engineMove, markUncertain,
  currentCriterion, currentCriterionIndex, hasMoreCriteria,
  evaluate, pickFollowupKind, formatCoreQuestion, followupPrompt,
  mergeEvidence, stripEvidence,
  MAX_FOLLOWUPS,

  CHILDHOOD_PROBES, formatChildhoodQuestion, childhoodQuestion,
  rateOnset, childhoodDone,
  deriveDuration,
  IMPAIRMENT_DOMAINS, formatImpairmentQuestion, formatSettingsQuestion,
  assessImpairment, impairmentDone,
  DIFFERENTIAL_FACTORS, formatDifferentialQuestion, flagDifferentials, flagDifferentialEvidence, differentialDone,
};
