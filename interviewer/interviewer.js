'use strict';

// LLM EVIDENCE EXTRACTOR — interviewer-only role.
//
// Strict separation of responsibilities (see CLINICAL_ADHD_PROTOCOL.md §8/§10):
//  - The deterministic engine (model/engine.js) ASKS every question (core + follow-ups)
//    and adjudicates completion, status, and advancement.
//  - This LLM ONLY extracts structured evidence fields from the user's latest answer
//    about the current criterion. It NEVER:
//      * ask questions (the engine does),
//      * decide status / completion / staging / recommendation,
//      * diagnose, claim "supported"/"uncertain", or give medical/treatment advice,
//      * invent symptoms beyond the 18 DSM-5 items,
//      * show probability scores.
//
// If a follow-up is needed, the engine supplies and asks it; this module only extracts.

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ONSET_AGE = require('../model/criteria').ONSET_AGE;

const SYSTEM_PROMPT = `You are a structured ADHD symptom evidence extractor. Your ONLY job is to read the user's latest answer about the CURRENT criterion and return structured evidence fields. You do NOT ask questions, do NOT decide anything about the assessment, and do NOT diagnose.

What you extract from THIS answer (about THIS criterion only):
- core_answer: the frequency (Never|Rarely|Sometimes|Often|Very Often) closest to the user's description FOR THIS criterion's behavior. Set ONLY if the user addressed this criterion. Otherwise null.
- example: a concrete real-life instance the user mentioned (paraphrase minimally). null if none.
- contexts: list of settings/contexts where it happens (e.g., work, home). [] if none.
- consequence: what it costs the person. null if none.
- counter_evidence: reasons the behavior does NOT occur (e.g., situational, "only at work"). [] if none.
- uncertainty: set ONLY if the user explicitly said they could not give evidence ("I don't know / not sure / can't recall / no example"). null otherwise.

Rules:
- Do not infer behavior the user did not state.
- Do not restate diagnostic conclusions. One criterion at a time (this one).
- If the user answered a DIFFERENT question or went off-topic, return all-null fields plus uncertainty noting the deflection.

Output STRICT JSON only (no prose, no markdown fences) with EXACTLY:
{
  "core_answer": "Never|Rarely|Sometimes|Often|Very Often|null",
  "example": "string|null",
  "contexts": ["..."],
  "consequence": "string|null",
  "counter_evidence": ["..."],
  "uncertainty": "string|null"
}`;

function buildMessages({ criterion, priorEvidence, transcript, userAnswer }) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Current criterion:\n`
        + `- Question: ${criterion.question}\n`
        + `- Core behavior: ${criterion.core}\n\n`
        + `Evidence collected so far for this criterion (JSON):\n${JSON.stringify(priorEvidence)}\n\n`
        + `Recent transcript (user/AI pairs):\n${JSON.stringify(transcript || [])}\n\n`
        + `User's latest answer:\n${userAnswer || '(empty)'}\n\n`
        + `Return STRICT JSON with evidence fields only.`,
    },
  ];
}

async function extractEvidence(args, signal) {
  // Stage 3 (childhood-onset) extraction branch. The engine asks the concrete probes
  // deterministically; the LLM only extracts recalled childhood memories into a structured
  // array. The LLM NEVER rates onset — that is the engine's deterministic job (engine.rateOnset).
  if (args && args.stage === 'childhood') {
    return extractChildhoodEvidence(args, signal);
  }
  // Stage 4 (functional impairment & settings) extraction branch. The engine asks the
  // concrete probes deterministically; the LLM only extracts concrete impairment examples and
  // settings with grounding. The LLM NEVER rates — engine.assessImpairment owns the rating.
  if (args && args.stage === 'impairment') {
    return extractImpairmentEvidence(args, signal);
  }
  // Stage 2 (per-criterion) evidence extraction.
  const { criterion, priorEvidence, transcript, userAnswer } = args;
  return extractCriterionEvidence({ criterion, priorEvidence, transcript, userAnswer }, signal);
}

const CHILDHOOD_SYSTEM_PROMPT = `You are a childhood-history evidence extractor for a structured ADHD assessment. Your ONLY job is to read the user's answer to the childhood probe and pull out specific memories the user attributes to BEFORE AGE 12. You do NOT ask questions, do NOT rate onset strength, and do NOT diagnose.

What to extract from the user's answer:
- Only memories the user explicitly recalls/attributes as BEFORE age 12 childhood behavior.
- Do NOT infer or map adult behaviors into childhood "evidence." If the user only describes adult behavior, return zero memories and note the deflection.
- Each memory: behavior (specific recalled event/situation, brief), age (numeric < 12 if the user stated it, else null), source (report_card | teacher | parent | memory | other).
- concrete=true if the user gave a specific attributable childhood situation; concrete=false + vague=true if only general phrasing ("always hyper") with no specifics.
- against=true if the user reports concrete evidence that ADHD-like behaviors were NOT present in childhood (e.g., "I was attentive and organized," "teachers praised my focus").
- uncertainty: set only if the user explicitly said they could not recall anything or were unsure.

Return STRICT JSON only (no prose, no markdown fences) with EXACTLY:
{
  "memories": [ { "behavior": "string|null", "age": <number<12>|null>, "source": "report_card|teacher|parent|memory|other", "concrete": bool, "against": bool, "vague": bool } ],
  "uncertainty": "string|null"
}`;

async function extractChildhoodEvidence({ probe, priorEvidence, transcript, userAnswer }, signal) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set in the environment.');
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: CHILDHOOD_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Current childhood probe:\n`
            + `- ${probe.prompt}\n\n`
            + `Childhood memories extracted so far (JSON):\n${JSON.stringify((priorEvidence && priorEvidence.memories) || [])}\n\n`
            + `Recent transcript (user/AI pairs):\n${JSON.stringify(transcript || [])}\n\n`
            + `User's latest answer:\n${userAnswer || '(empty)'}\n\n`
            + `Return STRICT JSON with memories[] + uncertainty only.`,
        },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
      max_tokens: 768,
    }),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Groq error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const raw = data.choices[0].message.content;
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { throw new Error('Extractor returned non-JSON: ' + raw.slice(0, 200)); }
  if (!parsed || typeof parsed !== 'object' || !('memories' in parsed) || !('uncertainty' in parsed)) {
    throw new Error('Childhood extractor response missing required fields.');
  }
  const memories = Array.isArray(parsed.memories)
    ? parsed.memories.map(m => ({
      behavior: typeof m.behavior === 'string' && m.behavior.trim() ? m.behavior.trim() : null,
      age: (typeof m.age === 'number' && m.age < ONSET_AGE) ? m.age : null,
      source: ['report_card', 'teacher', 'parent', 'memory', 'other'].includes(m.source) ? m.source : 'memory',
      concrete: !!m.concrete,
      against: !!m.against,
      vague: !!m.vague,
    }))
    : [];
  return {
    memories,
    uncertainty: typeof parsed.uncertainty === 'string' && parsed.uncertainty.trim() ? parsed.uncertainty.trim() : null,
  };
}

const IMPAIRMENT_SYSTEM_PROMPT = `You are a functional-impairment evidence extractor for a structured ADHD assessment. Your ONLY job is to read the user's answer to the CURRENT impairment/settings probe and pull out CONCRETE, GROUNDED evidence. You do NOT ask questions, do NOT rate overall completion, do NOT decide the DSM-5 outcome, and do NOT diagnose.

A piece of impairment evidence is CONCRETE only if the user gave a specific example tied to a life area and (for settings) a specific setting. Bare assertions ("yes, at work," "it affects everything") are NOT concrete.

What to extract from THIS answer (Stage 4 evidence only):
- domains_impaired: list of { domain, example, concrete }. domain = a life area (work, education, relationships, household, finances, time management, organization, driving, daily routines, emotional). Include ONLY entries the user backed with a specific example. concrete=true only if example is specific and non-empty.
- settings: list of { setting, example, concrete }. Include only settings the user named AND backed with a specific example of how it shows up there. concrete=true only if example is specific.
- uncertainty: set only if the user explicitly said they could not provide a concrete example ("I don't know / not sure / can't think of a specific case").

Do NOT infer domains/settings the user did not state. Do NOT rate strength; do NOT mention onset, symptoms, or the diagnosis.

Return STRICT JSON only (no prose, no markdown fences) with EXACTLY:
{
  "domains_impaired": [ { "domain": "string", "example": "string", "concrete": bool } ],
  "settings": [ { "setting": "string", "example": "string", "concrete": bool } ],
  "uncertainty": "string|null"
}`;

async function extractImpairmentEvidence({ probe, priorEvidence, transcript, userAnswer }, signal) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set in the environment.');
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: IMPAIRMENT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Current probe:\n`
            + `- ${probe.prompt}\n\n`
            + `Evidence collected so far (JSON):\n${JSON.stringify({ domains_impaired: (priorEvidence && priorEvidence.examples) || [], settings: (priorEvidence && priorEvidence.settings) || [] })}\n\n`
            + `Recent transcript (user/AI pairs):\n${JSON.stringify(transcript || [])}\n\n`
            + `User's latest answer:\n${userAnswer || '(empty)'}\n\n`
            + `Return STRICT JSON with domains_impaired[] + settings[] + uncertainty only.`,
        },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
      max_tokens: 768,
    }),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Groq error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const raw = data.choices[0].message.content;
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { throw new Error('Extractor returned non-JSON: ' + raw.slice(0, 200)); }
  if (!parsed || typeof parsed !== 'object' || !('domains_impaired' in parsed) || !('settings' in parsed) || !('uncertainty' in parsed)) {
    throw new Error('Impairment extractor response missing required fields.');
  }
  const cleanList = (arr, shape) => Array.isArray(arr)
    ? arr.map(x => {
      const o = {};
      for (const k of Object.keys(shape)) o[k] = x[k];
      return o;
    })
    : [];
  return {
    domains_impaired: cleanList(parsed.domains_impaired, { domain: '', example: '', concrete: false }).map(x => ({
      domain: typeof x.domain === 'string' && x.domain.trim() ? x.domain.trim() : null,
      example: typeof x.example === 'string' && x.example.trim() ? x.example.trim() : null,
      concrete: !!(x.example && x.example.trim()), // concrete => backed by a specific example
    }).filter(x => x.domain && x.example)),
    settings: cleanList(parsed.settings, { setting: '', example: '', concrete: false }).map(x => ({
      setting: typeof x.setting === 'string' && x.setting.trim() ? x.setting.trim() : null,
      example: typeof x.example === 'string' && x.example.trim() ? x.example.trim() : null,
      concrete: !!(x.example && x.example.trim()),
    }).filter(x => x.setting && x.example)),
    uncertainty: typeof parsed.uncertainty === 'string' && parsed.uncertainty.trim() ? parsed.uncertainty.trim() : null,
  };
}

async function extractCriterionEvidence({ criterion, priorEvidence, transcript, userAnswer }, signal) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: buildMessages({ criterion, priorEvidence, transcript, userAnswer }),
      temperature: 0.2,
      response_format: { type: 'json_object' },
      max_tokens: 768,
    }),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Groq error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const raw = data.choices[0].message.content;
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { throw new Error('Extractor returned non-JSON: ' + raw.slice(0, 200)); }
  if (!parsed || typeof parsed !== 'object' || !('core_answer' in parsed) || !('example' in parsed) || !('contexts' in parsed) || !('consequence' in parsed) || !('counter_evidence' in parsed) || !('uncertainty' in parsed)) {
    throw new Error('Extractor response missing required fields.');
  }
  return {
    core_answer: typeof parsed.core_answer === 'string' && parsed.core_answer ? parsed.core_answer : null,
    example: typeof parsed.example === 'string' && parsed.example.trim() ? parsed.example.trim() : null,
    contexts: Array.isArray(parsed.contexts) ? parsed.contexts.filter(x => typeof x === 'string') : [],
    consequence: typeof parsed.consequence === 'string' && parsed.consequence.trim() ? parsed.consequence.trim() : null,
    counter_evidence: Array.isArray(parsed.counter_evidence) ? parsed.counter_evidence.filter(x => typeof x === 'string') : [],
    uncertainty: typeof parsed.uncertainty === 'string' && parsed.uncertainty.trim() ? parsed.uncertainty.trim() : null,
  };
}

module.exports = { extractEvidence, SYSTEM_PROMPT };
