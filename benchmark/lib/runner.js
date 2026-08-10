'use strict';

// MODEL RUNNER — drives the REAL production extractor (interviewer/interviewer.js)
// exactly as the app does, per model:
//   1. sets process.env.GROQ_MODEL before require (which the production module reads
//      at load time),
//   2. re-requires the production module fresh so its SYSTEM_PROMPT / buildMessages /
//      normalization code is the code under test,
//   3. patches globalThis.fetch ONLY to observe the production call (request body,
//      latency, raw content, tokens, status) without altering anything it sends
//      or what production receives.
// No production file is imported for mocking; no production file is modified.

const path = require('path');
const fs = require('fs');
const { CRITERIA, INATTENTIVE, HYPERACTIVE } = require('../../model/criteria');
const engine = require('../../model/engine');
const { validateSchema } = require('./scoring');

const INTERVIEWER_PATH = require.resolve('../../interviewer/interviewer.js');
const MODELS_CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'models.json'), 'utf8'));
const MODELS = MODELS_CONFIG.models.map(m => m.id);

function buildArgs(c) {
  const stage = c.stage;
  const transcript = c.transcript || [];
  if (stage === 'criterion') {
    const criterion = CRITERIA.find(x => x.id === c.criterion_id);
    if (!criterion) throw new Error('unknown criterion_id ' + c.criterion_id);
    return { criterion, priorEvidence: c.priorEvidence || null, transcript, userAnswer: c.userAnswer };
  }
  if (stage === 'childhood') {
    const probe = engine.CHILDHOOD_PROBES.find(x => x.id === c.probe_id);
    if (!probe) throw new Error('unknown childhood probe ' + c.probe_id);
    return { stage: 'childhood', probe, priorEvidence: { memories: (c.priorEvidence && c.priorEvidence.memories) || [] }, transcript, userAnswer: c.userAnswer };
  }
  if (stage === 'impairment') {
    const prompt = c.probe_id === 'settings' ? engine.formatSettingsQuestion() : engine.formatImpairmentQuestion();
    return { stage: 'impairment', probe: { id: c.probe_id, prompt }, priorEvidence: c.priorEvidence || { examples: [], settings: [] }, transcript, userAnswer: c.userAnswer };
  }
  if (stage === 'differential') {
    const factor = engine.DIFFERENTIAL_FACTORS.find(x => x.id === c.probe_id);
    if (!factor) throw new Error('unknown factor ' + c.probe_id);
    return { stage: 'differential', probe: { id: factor.id, prompt: factor.probe }, priorEvidence: c.priorEvidence || { factors: [] }, transcript, userAnswer: c.userAnswer };
  }
  throw new Error('unknown stage ' + stage);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadInterviewer(modelId) {
  process.env.GROQ_MODEL = modelId;
  delete require.cache[INTERVIEWER_PATH];
  return require(INTERVIEWER_PATH);
}

// Patch fetch once per model run; captures the single production call per case.
async function runModel(modelId, cases, { timeoutMs = 60000 } = {}) {
  const interviewer = loadInterviewer(modelId);
  const captureSlot = [];
  const origFetch = globalThis.fetch;

  globalThis.fetch = async (url, opts) => {
    const start = performance.now();
    let res;
    let retries = 0;
    while (true) {
      try {
        res = await origFetch(url, opts);
      } catch (e) {
        if (retries++ < 3) { await sleep(500 * retries); continue; }
        captureSlot.push({ networkError: e.message, latency: performance.now() - start });
        throw e;
      }
      if ((res.status === 429 || res.status >= 500) && retries < 3) {
        await sleep(1000 * Math.pow(2, retries));
        retries++;
        continue;
      }
      break;
    }
    const latency = performance.now() - start;
    let body = '';
    try { body = await res.clone().text(); } catch (e) { body = ''; }
    let data = null;
    try { data = JSON.parse(body); } catch (e) { /* non-JSON error body */ }
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    const usage = data && data.usage;
    captureSlot.push({
      model: (data && data.model) || null,
      status: res.status,
      ok: res.ok,
      latency,
      request: (() => { try { return JSON.parse(opts.body); } catch (e) { return null; } })(),
      content: msg ? msg.content : null,
      tokens: usage ? {
        prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens,
        total_time: usage.total_time, queue_time: usage.queue_time,
      } : null,
      errorBody: res.ok ? null : body.slice(0, 500),
    });
    return res;
  };

  const results = [];
  let errors = 0;
  try {
    for (const c of cases) {
      const args = buildArgs(c);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const t0 = performance.now();
      let normalized = null;
      let productionOk = false;
      let extractionError = null;
      let signal = controller.signal;
      try {
        normalized = await interviewer.extractEvidence(args, signal);
        productionOk = true;
      } catch (e) {
        extractionError = e.message;
      } finally {
        clearTimeout(timer);
      }
      const wall = performance.now() - t0;
      const rec = captureSlot.shift() || { latency: wall, status: 0, ok: false, content: null, tokens: null };
      if (!productionOk) errors++;

      let rawParsed = null;
      if (rec.content != null) {
        try { rawParsed = JSON.parse(rec.content); } catch (e) { rawParsed = null; }
      }
      const schema = rec.content != null ? validateSchema(c.stage, rawParsed) : { valid: false, violations: ['no content from API'] };

      results.push({
        case_id: c.id,
        stage: c.stage,
        category: c.category,
        productionOk,
        apiErrors: { networkError: rec.networkError || null, status: rec.status, errorBody: rec.errorBody || (extractionError && !rec.ok ? String(extractionError) : null) },
        extractionError,
        latency_ms: Math.round(rec.latency != null ? rec.latency : wall),
        wall_ms: Math.round(wall),
        request_model: rec.model,
        request: rec.request ? { model: rec.request.model, temperature: rec.request.temperature, max_tokens: rec.request.max_tokens, response_format: rec.request.response_format } : null,
        tokens: rec.tokens,
        raw: rec.content,
        rawParsed,
        schema,
        normalized,
      });
      if (!productionOk && (process.env.BENCH_DEBUG || process.env.BENCH_SMOKE)) {
        console.error('  [' + modelId + '] ' + c.id + ' error: ' + extractionError);
      }
    }
  } finally {
    globalThis.fetch = origFetch;
  }
  return { modelId, results, errors };
}

async function listAvailableModels() {
  const key = process.env.GROQ_API_KEY;
  if (!key) return [];
  const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + key } });
  if (!res.ok) return [];
  const data = await res.json();
  const ids = new Set((data.data || []).map(m => m.id));
  return MODELS.map(id => ({ id, available: ids.has(id) }));
}

module.exports = { runModel, buildArgs, MODELS, listAvailableModels, INATTENTIVE, HYPERACTIVE };
