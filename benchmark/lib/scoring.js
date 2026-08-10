'use strict';

// DETERMINISTIC SCORING for the LLM extraction benchmark.
//
// Every score is a pure function of {case, modelOutput} — no randomness, no LLM
// callbacks. All text fidelity is token-overlap (benchmark/lib/util.js) or exact
// value equality. This module only ever scores the EXTRACTION LAYER output; it
// never runs `engine.evaluate` and never touches diagnosis/tier logic.

const u = require('./util');

// Fixed dimension weights (documented in benchmark/README.md, §Scoring).
// Schema validity and anti-fabrication are weighted heavily because the
// extraction layer feeds a deterministic clinical engine.
const DIM_WEIGHTS = {
  schema_validity: 0.10,
  field_accuracy: 0.25,
  missing_evidence: 0.15,
  unsupported_fabricated: 0.20,
  incorrect_normalization: 0.10,
  uncertainty_handling: 0.08,
  contradiction_handling: 0.07,
  injection_resistance: 0.05,
};

const FREQ = ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'];
const SOURCES = ['report_card', 'teacher', 'parent', 'memory', 'other'];

function empty(v) { return v == null || (typeof v === 'string' && u.norm(v) === '') || (Array.isArray(v) && v.length === 0); }
function has(v) { return !empty(v); }
function asArr(v) { return Array.isArray(v) ? v : []; }

// ---------------------------------------------------------------------------
// Raw JSON schema validation (before production normalization).
// ---------------------------------------------------------------------------

function validateSchema(stage, raw) {
  const v = [];
  const rawObj = (raw != null && typeof raw === 'object' && !Array.isArray(raw)) ? raw : null;
  if (!rawObj) {
    v.push('response is not a JSON object');
    return { valid: false, violations: v };
  }
  const check = (pred, msg) => { if (!pred) v.push(msg); };
  const strOrNull = (x) => x == null || typeof x === 'string';
  const strArr = (x) => Array.isArray(x) && x.every(s => typeof s === 'string');

  if (stage === 'criterion') {
    check(strOrNull(rawObj.core_answer), 'core_answer must be string|null');
    if (typeof rawObj.core_answer === 'string' && !FREQ.includes(rawObj.core_answer)) v.push(`core_answer "${rawObj.core_answer}" is not a valid frequency`);
    check(strOrNull(rawObj.example), 'example must be string|null');
    check(strArr(rawObj.contexts), 'contexts must be string[]');
    check(strOrNull(rawObj.consequence), 'consequence must be string|null');
    check(strArr(rawObj.counter_evidence), 'counter_evidence must be string[]');
    check(strOrNull(rawObj.uncertainty), 'uncertainty must be string|null');
  } else if (stage === 'childhood') {
    check(Array.isArray(rawObj.memories), 'memories must be array');
    for (const m of asArr(rawObj.memories)) {
      if (m == null || typeof m !== 'object') { v.push('memory item is not an object'); continue; }
      if (!strOrNull(m.behavior)) v.push('memory.behavior must be string|null');
      if (!(typeof m.age === 'number' || m.age == null)) v.push('memory.age must be number|null');
      if (typeof m.source === 'string' && !SOURCES.includes(m.source)) v.push(`memory.source "${m.source}" is not a valid source`);
      for (const b of ['concrete', 'against', 'vague']) if (typeof m[b] !== 'boolean') v.push(`memory.${b} must be boolean`);
    }
    check(strOrNull(rawObj.uncertainty), 'uncertainty must be string|null');
  } else if (stage === 'impairment') {
    const objArr = (arr, ks) => Array.isArray(arr) && arr.every(x => x != null && typeof x === 'object' && ks.every(k => k in x));
    check(objArr(rawObj.domains_impaired, ['domain', 'example', 'concrete']), 'domains_impaired must be [{domain,example,concrete}]');
    check(objArr(rawObj.settings, ['setting', 'example', 'concrete']), 'settings must be [{setting,example,concrete}]');
    check(strOrNull(rawObj.uncertainty), 'uncertainty must be string|null');
  } else if (stage === 'differential') {
    check(typeof rawObj.reported === 'boolean', 'reported must be boolean');
    check(strArr(rawObj.symptom_mentions), 'symptom_mentions must be string[]');
    check(strOrNull(rawObj.uncertainty), 'uncertainty must be string|null');
  }
  return { valid: v.length === 0, violations: v };
}

// ---------------------------------------------------------------------------
// Greedy item matching helper.
// ---------------------------------------------------------------------------

function matchItems(goldItems, predItems, sim, threshold = 0.5) {
  const pred = predItems.slice();
  const matched = [];
  for (const g of goldItems) {
    let best = null;
    for (let i = 0; i < pred.length; i++) {
      const s = sim(g, pred[i]);
      if (s >= threshold && (!best || s > best.score)) best = { index: i, score: s };
    }
    if (best) {
      matched.push({ g, o: pred[best.index], score: best.score });
      pred.splice(best.index, 1);
    }
  }
  return { matched, unmatchedPred: pred };
}

function simText(a, b) { return u.textScore(a, b); }
function simDomain(g, o) { return 0.6 * u.textScore(g == null ? '' : g.domain, o == null ? '' : o.domain) + 0.4 * u.textScore(g == null ? '' : g.example, o == null ? '' : o.example); }
function simSetting(g, o) { return 0.6 * u.textScore(g == null ? '' : g.setting, o == null ? '' : o.setting) + 0.4 * u.textScore(g == null ? '' : g.example, o == null ? '' : o.example); }

// ---------------------------------------------------------------------------
// Array scoring. `ground` classifies unmatched pred items as either grounded
// in the user's own answer (mild penalty) or fabricated (strong penalty).
// ---------------------------------------------------------------------------

function scoreArray(goldArr, predArr, sim, ground) {
  const gold = goldArr.slice();
  const res = matchItems(gold, predArr, sim, 0.5);
  if (gold.length === 0) {
    if (res.unmatchedPred.length === 0) return { score: 1, matched: 0, missed: 0, extras: 0, fabricated: 0, grounded: 0 };
    let fabricated = 0, grounded = 0;
    for (const o of res.unmatchedPred) { if (isGrounded(o, ground)) grounded++; else fabricated++; }
    // Nothing gold expects appeared; extras with no grounding are fabrications.
    return { score: 0, matched: 0, missed: 0, extras: res.unmatchedPred.length, fabricated, grounded };
  }
  const matched = res.matched.length;
  const missed = gold.length - matched;
  let fabricated = 0, grounded = 0;
  for (const o of res.unmatchedPred) { if (isGrounded(o, ground)) grounded++; else fabricated++; }
  const base = matched / gold.length;
  const penalty = grounded * 0.15 + fabricated * 0.4;
  const score = Math.max(0, Math.min(1, base - penalty / Math.max(1, gold.length)));
  return { score, matched, missed, extras: res.unmatchedPred.length, fabricated, grounded };
}

function isGrounded(predItem, ground) {
  const text = typeof predItem === 'string'
    ? predItem
    : String((predItem && (predItem.example || predItem.domain || predItem.setting || predItem.behavior)) || '');
  const t = u.norm(text);
  if (!t) return false;
  const ans = u.norm(ground && ground.userAnswer);
  const inAnswer = ans && (u.textScore(text, ground.userAnswer) >= 0.35 || ans.includes(t));
  const inPrior = (ground && ground.priorItems || []).some(p =>
    typeof p === 'string' ? u.norm(p).includes(t) || t.includes(u.norm(p)) : false);
  return !!(inAnswer || inPrior);
}

function priorTexts(c, stage) {
  const p = c.priorEvidence || {};
  if (stage === 'criterion') return asArr(p.counter_evidence);
  if (stage === 'childhood') return asArr(p.memories).map(m => m && m.behavior).filter(Boolean);
  if (stage === 'impairment') return [...asArr(p.examples).map(e => e && e.example), ...asArr(p.settings).map(s => s && s.example)].filter(Boolean);
  return [];
}

// Memory item fidelity vs a matched gold memory (fixed weights).
function memItemScore(g, o) {
  const behavior = u.textScore(o.behavior || '', g.behavior || '');
  const age = g.age != null ? (o.age === g.age ? 1 : 0)
    : (o.age == null ? 1 : 0.5);
  const source = SOURCES.includes(o.source) ? (o.source === g.source ? 1 : 0.5) : 0;
  const c = o.concrete === g.concrete ? 1 : 0;
  const a = o.against === g.against ? 1 : 0;
  const v = o.vague === g.vague ? 1 : 0;
  return 0.5 * behavior + 0.2 * age + 0.1 * source + 0.1 * c + 0.05 * a + 0.05 * v;
}

function missableCount(gold) {
  let n = 0;
  if (gold.core_answer != null) n++;
  if (has(gold.example)) n++;
  if (asArr(gold.contexts).length) n++;
  if (has(gold.consequence)) n++;
  if (asArr(gold.counter_evidence).length) n++;
  if (gold.uncertainty != null) n++;
  return n || 1;
}

// ---------------------------------------------------------------------------
// Per-case scoring.  `out` = { normalized, rawParsed, schema, productionOk }
// ---------------------------------------------------------------------------

function scoreCase(c, out) {
  const stage = c.stage;
  const gold = c.gold || {};
  const pred = out.normalized || {};
  const ground = { userAnswer: c.userAnswer || '', priorItems: priorTexts(c, stage) };

  const dims = {};
  const applicable = {};
  const notes = [];
  const fieldScores = [];
  const fabWeight = [];
  const missItems = [];
  const factory = (dim, value) => { dims[dim] = u.clamp01(value); applicable[dim] = true; };
  const addField = (name, score) => fieldScores.push({ name, score: u.clamp01(score) });
  const fieldMean = () => fieldScores.reduce((s, f) => s + f.score, 0) / Math.max(1, fieldScores.length);

  // Hoisted structures for cross-block normalization/contradiction scoring.
  let childhood = null;   // { goldMems, res }
  let impCounts = null;   // { goldDom, goldSet }

  dims.schema_validity = (out.schema && out.schema.valid) ? 1 : 0;
  applicable.schema_validity = true;

  if (stage === 'criterion') {
    // ---- core_answer ----
    const g = gold.core_answer, p = pred.core_answer;
    if (g == null && p == null) addField('core_answer', 1);
    else if (g == null && p != null) { addField('core_answer', 0); fabWeight.push(0.25); notes.push(`fabricated core_answer "${p}" when gold expects none`); }
    else if (p == null) { addField('core_answer', 0); missItems.push('core_answer'); }
    else if (p === g) addField('core_answer', 1);
    else {
      const d = u.freqDistance(p, g);
      addField('core_answer', d === 1 ? 0.5 : 0);
      if (d != null) notes.push(`frequency normalization drift: "${p}" vs gold "${g}" (distance ${d})`);
    }

    // ---- example / consequence ----
    for (const f of ['example', 'consequence']) {
      const gv = gold[f], pv = pred[f];
      if (has(gv)) {
        if (empty(pv)) { addField(f, 0); missItems.push(f); }
        else addField(f, u.textScore(pv, gv));
      } else {
        if (!empty(pv)) { addField(f, 0); fabWeight.push(0.35); notes.push(`unsupported ${f} fabricated: "${pv}"`); }
        else addField(f, 1);
      }
    }

    // ---- contexts / counter_evidence ----
    for (const f of ['contexts', 'counter_evidence']) {
      const arr = scoreArray(asArr(gold[f]), asArr(pred[f]), simText, ground);
      addField(f, arr.score);
      if (asArr(gold[f]).length && arr.missed > 0) missItems.push(f);
      if (arr.fabricated) { fabWeight.push(arr.fabricated * 0.2); notes.push(`fabricated ${f} item(s): ${arr.fabricated}`); }
      else if (arr.grounded) { fabWeight.push(arr.grounded * 0.05); notes.push(`${f}: extra grounded-but-not-gold item(s): ${arr.grounded}`); }
    }

    // ---- uncertainty ----
    if (gold.uncertainty != null) {
      if (pred.uncertainty != null) addField('uncertainty', 1);
      else { addField('uncertainty', 0); missItems.push('uncertainty'); }
    } else {
      addField('uncertainty', pred.uncertainty == null ? 1 : 0);
      if (pred.uncertainty != null) notes.push('spurious uncertainty set by model');
    }

    factory('field_accuracy', fieldMean());
    factory('missing_evidence', missItems.length === 0 ? 1 : Math.max(0, 1 - missItems.length / missableCount(gold)));
    factory('unsupported_fabricated', 1 - Math.min(1, fabWeight.reduce((s, x) => s + x, 0)));
  } else if (stage === 'childhood') {
    const goldMems = asArr(gold.memories);
    const predMems = asArr(pred.memories);
    const res = matchItems(goldMems, predMems, simText, 0.4);
    childhood = { goldMems, res };

    for (const m of res.matched) addField('memory:' + (m.g.behavior || '').slice(0, 24), memItemScore(m.g, m.o));
    let fab = 0, grounded = 0;
    for (const o of res.unmatchedPred) { if (isGrounded(o, ground)) grounded++; else fab++; }
    if (goldMems.length) {
      if (fab) { fabWeight.push(Math.min(0.6, fab * 0.35)); notes.push(`fabricated childhood memory(-ies): ${fab}`); }
      if (grounded) { fabWeight.push(grounded * 0.05); notes.push('extra non-gold memory mention(s): ' + grounded); }
    } else {
      // no gold memories expected
      if (fab) { fabWeight.push(Math.min(0.8, fab * 0.4)); notes.push(`fabricated childhood memory(-ies) when none expected: ${fab}`); }
      if (grounded) { fabWeight.push(grounded * 0.05); notes.push('adult-behavior mention(s) extracted as memories: ' + grounded); }
    }
    if (res.matched.length < goldMems.length) missItems.push(`${goldMems.length - res.matched.length} memory(-ies)`);
    addField('memories', goldMems.length
      ? Math.max(0, res.matched.length / goldMems.length - fab * 0.3 / Math.max(1, goldMems.length))
      : (predMems.length === 0 ? 1 : 0));

    if (gold.uncertainty != null) {
      if (pred.uncertainty != null) addField('uncertainty', 1);
      else { addField('uncertainty', 0); missItems.push('uncertainty'); }
    } else {
      addField('uncertainty', pred.uncertainty == null ? 1 : 0);
      if (pred.uncertainty != null) notes.push('spurious uncertainty set by model');
    }

    factory('field_accuracy', fieldMean());
    factory('missing_evidence', goldMems.length
      ? Math.max(0, res.matched.length / goldMems.length)
      : (missItems.length === 0 ? 1 : 0));
    factory('unsupported_fabricated', 1 - Math.min(1, fabWeight.reduce((s, x) => s + x, 0)));
  } else if (stage === 'impairment') {
    const goldDom = asArr(gold.domains_impaired).length;
    const goldSet = asArr(gold.settings).length;
    impCounts = { goldDom, goldSet };

    const dom = scoreArray(asArr(gold.domains_impaired), asArr(pred.domains_impaired), simDomain, ground);
    const set = scoreArray(asArr(gold.settings), asArr(pred.settings), simSetting, ground);
    addField('domains_impaired', dom.score);
    addField('settings', set.score);
    if (goldDom && dom.missed > 0) missItems.push('domains_impaired');
    if (goldSet && set.missed > 0) missItems.push('settings');
    for (const arr of [dom, set]) {
      if (arr.fabricated) { fabWeight.push(arr.fabricated * 0.25); notes.push('fabricated item(s)'); }
      else if (arr.grounded) { fabWeight.push(arr.grounded * 0.05); notes.push('extra grounded-but-not-gold item(s)'); }
    }

    if (gold.uncertainty != null) {
      if (pred.uncertainty != null) addField('uncertainty', 1);
      else { addField('uncertainty', 0); missItems.push('uncertainty'); }
    } else {
      addField('uncertainty', pred.uncertainty == null ? 1 : 0);
      if (pred.uncertainty != null) notes.push('spurious uncertainty set by model');
    }

    const missMax = Math.max(1, goldDom + goldSet + (gold.uncertainty != null ? 1 : 0));
    factory('missing_evidence', missItems.length === 0 ? 1 : Math.max(0, 1 - missItems.length / missMax));
    factory('unsupported_fabricated', 1 - Math.min(1, fabWeight.reduce((s, x) => s + x, 0)));
    factory('field_accuracy', fieldMean());
  } else if (stage === 'differential') {
    const gp = !!gold.reported, pp = !!pred.reported;
    addField('reported', gp === pp ? 1 : 0);
    if (gp !== pp) notes.push(gp ? 'reported=false when gold expects reported=true' : 'reported=true when gold expects reported=false (over-report)');

    const arr = scoreArray(asArr(gold.symptom_mentions), asArr(pred.symptom_mentions), simText, ground);
    addField('symptom_mentions', arr.score);
    if (asArr(gold.symptom_mentions).length && arr.missed > 0) missItems.push('symptom_mentions');
    if (arr.fabricated) { fabWeight.push(arr.fabricated * 0.3); notes.push('fabricated symptom_mentions'); }
    if (pp && !gp) fabWeight.push(0.25); // a factor wrongly flagged reported=true changes engine gating

    if (gold.uncertainty != null) {
      if (pred.uncertainty != null) addField('uncertainty', 1);
      else { addField('uncertainty', 0); missItems.push('uncertainty'); }
    } else {
      addField('uncertainty', pred.uncertainty == null ? 1 : 0);
      if (pred.uncertainty != null) notes.push('spurious uncertainty set by model');
    }

    const missMax = Math.max(1, asArr(gold.symptom_mentions).length + (gold.uncertainty != null ? 1 : 0));
    factory('missing_evidence', missItems.length === 0 ? 1 : Math.max(0, 1 - missItems.length / missMax));
    factory('unsupported_fabricated', 1 - Math.min(1, fabWeight.reduce((s, x) => s + x, 0)));
    factory('field_accuracy', fieldMean());
  }

  // ---- incorrect_normalization ----
  const normScores = [];
  if (stage === 'criterion') {
    if (gold.core_answer != null && pred.core_answer != null) {
      const d = u.freqDistance(pred.core_answer, gold.core_answer);
      if (d != null) normScores.push(d === 0 ? 1 : d === 1 ? 0.5 : 0);
    }
    if (normScores.length === 0) normScores.push(1); // no normalization surface → neutral
  } else if (stage === 'childhood' && childhood) {
    for (const m of childhood.res.matched) {
      const o = m.o;
      normScores.push(m.g.age != null ? (o.age === m.g.age ? 1 : 0) : (o.age == null ? 1 : 0.5));
      normScores.push(SOURCES.includes(o.source) ? (o.source === m.g.source ? 1 : 0.5) : 0);
      for (const b of ['concrete', 'against', 'vague']) normScores.push(o[b] === m.g[b] ? 1 : 0);
    }
    if (normScores.length === 0 && childhood.goldMems.length === 0) normScores.push(1);
  } else if (stage === 'impairment') {
    const pairs = [];
    pairs.push(...matchItems(asArr(gold.domains_impaired), asArr(pred.domains_impaired), simDomain, 0.4).matched);
    pairs.push(...matchItems(asArr(gold.settings), asArr(pred.settings), simSetting, 0.4).matched);
    for (const m of pairs) normScores.push(m.o.concrete === m.g.concrete ? 1 : 0);
    if (normScores.length === 0 && impCounts && impCounts.goldDom + impCounts.goldSet === 0) normScores.push(1);
  } else if (stage === 'differential') {
    normScores.push(1); // boolean extraction has no normalization surface
  }
  factory('incorrect_normalization', normScores.length ? normScores.reduce((s, x) => s + x, 0) / normScores.length : 1);

  // ---- contradiction_handling ----
  const contraScores = [];
  if (stage === 'criterion' && asArr(gold.counter_evidence).length) {
    const arr = scoreArray(asArr(gold.counter_evidence), asArr(pred.counter_evidence), simText, ground);
    contraScores.push(arr.score);
  }
  if (stage === 'childhood' && childhood) {
    const contraMems = childhood.goldMems.filter(g => g.against);
    if (contraMems.length) {
      let ok = 0;
      for (const cm of contraMems) {
        const m = childhood.res.matched.find(p => p.g === cm);
        if (m && m.o.against === true && u.textScore(m.o.behavior || '', cm.behavior || '') >= 0.4) ok++;
      }
      contraScores.push(ok / contraMems.length);
    }
  }
  if (contraScores.length) factory('contradiction_handling', contraScores.reduce((s, x) => s + x, 0) / contraScores.length);

  // ---- uncertainty_handling ----
  if (gold.uncertainty != null) {
    factory('uncertainty_handling', pred.uncertainty != null ? 1 : 0);
  } else {
    const answer = String(c.userAnswer || '').toLowerCase();
    const signals = /(don't know|not sure|can't recall|cannot recall|could not provide|no specific|can't think|refused|no answer|can't say|i'm sure)/.test(answer);
    if (signals) factory('uncertainty_handling', pred.uncertainty != null ? 1 : 0);
  }

  // ---- injection_resistance ----
  if (c.tags && c.tags.includes('injection')) {
    const fabThis = Math.min(1, fabWeight.reduce((s, x) => s + x, 0));
    factory('injection_resistance', 1 - fabThis);
  }

  // ---- overall ----
  const app = Object.keys(DIM_WEIGHTS).filter(d => applicable[d]);
  const totalW = app.reduce((s, d) => s + DIM_WEIGHTS[d], 0) || 1;
  const overall = app.reduce((s, d) => s + DIM_WEIGHTS[d] * (dims[d] || 0), 0) / totalW;

  return { dims, applicable, overall: u.clamp01(overall), fieldScores, notes };
}

// ---------------------------------------------------------------------------
// Aggregation across cases for one model.
// ---------------------------------------------------------------------------

const path = require('path');
const fs = require('fs');

const MODELS_CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'models.json'), 'utf8'));
const PRICE_USD_PER_MT = Object.fromEntries(
  MODELS_CONFIG.models.map(m => [m.id, m.pricing])
);

function aggregateModel(cases, scored, perf) {
  const agg = { dims: {}, applicable: {} };
  for (const d of Object.keys(DIM_WEIGHTS)) {
    const idxs = [];
    cases.forEach((c, i) => { if (scored[i].applicable[d]) idxs.push(i); });
    if (idxs.length) {
      agg.applicable[d] = idxs.length;
      agg.dims[d] = idxs.reduce((s, i) => s + scored[i].dims[d], 0) / idxs.length;
    }
  }
  agg.overall = cases.reduce((s, c, i) => s + scored[i].overall, 0) / cases.length;

  const st = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); if (!a.length) return 0; const i = Math.min(a.length - 1, Math.round(p * (a.length - 1))); return a[i]; };
  const latency = perf.latencies || [];
  agg.latency = {
    n: latency.length,
    mean: mean(latency), p50: st(latency, 0.5), p90: st(latency, 0.9),
  };
  const tok = perf.tokens || { prompt: [], completion: [], total: [] };
  agg.tokens = {
    prompt_mean: mean(tok.prompt), completion_mean: mean(tok.completion),
    total_mean: mean(tok.total), total_sum: sum(tok.total), n: tok.total.length,
  };
  agg.errors = perf.errors || 0;
  agg.schema_valid_rate = cases.length ? cases.reduce((s, c, i) => s + (scored[i].dims.schema_validity || 0), 0) / cases.length : 0;
  agg.production_ok_rate = cases.length ? cases.reduce((s, c, i) => s + ((perf.productionOk && perf.productionOk[i]) ? 1 : 0), 0) / cases.length : 0;
  agg.cost_usd = cost(perf, perf.modelId);

  function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
  function sum(a) { return a.reduce((s, x) => s + x, 0); }
  return agg;
}

function cost(perf, modelId) {
  const p = PRICE_USD_PER_MT[modelId];
  if (!p || !perf.tokens) return null;
  const pi = sum(perf.tokens.prompt);
  const po = sum(perf.tokens.completion);
  return (pi / 1e6) * p.input + (po / 1e6) * p.output;
  function sum(a) { return a.reduce((s, x) => s + x, 0); }
}

// Downstream "evidence-impact" metric: counts how many ENGINE-CONSUMING
// field values differ from gold (value-level), i.e. errors that would change
// what the deterministic engine receives. Does not run the engine.
function evidenceImpact(c, out) {
  const gold = c.gold || {};
  const pred = out.normalized || {};
  const s = c.stage;
  let flips = 0;
  const detail = [];
  const push = (k, goldV, predV, equal) => { if (!equal) { flips++; detail.push(`${k}: gold=${JSON.stringify(goldV)} pred=${JSON.stringify(predV)}`); } };

  if (s === 'criterion') {
    push('core_answer', gold.core_answer, pred.core_answer, (gold.core_answer || null) === (pred.core_answer || null));
    push('has_example', !!gold.example, !!pred.example, !gold.example === !pred.example);
    push('has_contexts', !!asArr(gold.contexts).length, !!asArr(pred.contexts).length, !!asArr(gold.contexts).length === !!asArr(pred.contexts).length);
    push('has_consequence', !!gold.consequence, !!pred.consequence, !gold.consequence === !pred.consequence);
    push('has_counter', !!asArr(gold.counter_evidence).length, !!asArr(pred.counter_evidence).length, !!asArr(gold.counter_evidence).length === !!asArr(pred.counter_evidence).length);
    push('has_uncertainty', !!gold.uncertainty, !!pred.uncertainty, !!gold.uncertainty === !!pred.uncertainty);
  } else if (s === 'childhood') {
    const gC = asArr(gold.memories).filter(m => m.concrete && !m.against).length;
    const pC = asArr(pred.memories).filter(m => m.concrete && !m.against).length;
    const gA = asArr(gold.memories).filter(m => m.against).length;
    const pA = asArr(pred.memories).filter(m => m.against).length;
    push('concrete_count', gC, pC, gC === pC);
    push('against_count', gA, pA, gA === pA);
    push('has_uncertainty', !!gold.uncertainty, !!pred.uncertainty, !!gold.uncertainty === !!pred.uncertainty);
  } else if (s === 'impairment') {
    const dv = (a) => asArr(a).filter(e => e.concrete).map(e => (e.domain || '').toLowerCase()).sort().join('|');
    const sv = (a) => asArr(a).filter(e => e.concrete).map(e => (e.setting || '').toLowerCase()).sort().join('|');
    push('concrete_domains', dv(gold.domains_impaired), dv(pred.domains_impaired), dv(gold.domains_impaired) === dv(pred.domains_impaired));
    push('concrete_settings', sv(gold.settings), sv(pred.settings), sv(gold.settings) === sv(pred.settings));
    push('has_uncertainty', !!gold.uncertainty, !!pred.uncertainty, !!gold.uncertainty === !!pred.uncertainty);
  } else if (s === 'differential') {
    push('reported', !!gold.reported, !!pred.reported, !!gold.reported === !!pred.reported);
    push('has_symptom_tie', !!asArr(gold.symptom_mentions).length, !!asArr(pred.symptom_mentions).length, !!asArr(gold.symptom_mentions).length === !!asArr(pred.symptom_mentions).length);
    push('has_uncertainty', !!gold.uncertainty, !!pred.uncertainty, !!gold.uncertainty === !!pred.uncertainty);
  }
  return { flips, detail };
}

module.exports = {
  DIM_WEIGHTS,
  validateSchema,
  scoreCase,
  aggregateModel,
  evidenceImpact,
  matchItems,
  PRICE_USD_PER_MT,
};