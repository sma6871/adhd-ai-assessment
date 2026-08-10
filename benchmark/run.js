#!/usr/bin/env node
'use strict';

// ADHD Extraction Benchmark — CLI.
//
//   node benchmark/run.js                 full run (48 cases x available models)
//   node benchmark/run.js --smoke         one representative case per stage per model
//   node benchmark/run.js --limit 10      first N cases
//   node benchmark/run.js --only llama-3.1-8b-instant[,openai/gpt-oss-120b]
//
// Requires GROQ_API_KEY. Nothing is committed; all output lands in benchmark/results/.

const fs = require('fs');
const path = require('path');
const { runModel, MODELS, listAvailableModels } = require('./lib/runner');
const { scoreCase, aggregateModel, evidenceImpact } = require('./lib/scoring');

const ROOT = __dirname;
const RESULTS_DIR = path.join(ROOT, 'results');
const CASES_PATH = path.join(ROOT, 'cases.json');

const SMOKE_IDS = ['C01', 'C14', 'CH01', 'CH04', 'I01', 'I02', 'D01', 'D06'];

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}
const has = (flag) => process.argv.includes(flag);

function readCases() {
  const all = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8')).cases;
  if (has('--smoke')) {
    return all.filter(c => SMOKE_IDS.includes(c.id));
  }
  const limit = arg('--limit');
  if (limit) return all.slice(0, parseInt(limit, 10));
  return all;
}

function pct(x) { return (x * 100).toFixed(1); }

function bars(v, width = 24) {
  const filled = Math.round(Math.min(1, Math.max(0, v)) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY is not set. Set it and re-run.');
    process.exit(2);
  }
  const cases = readCases();
  console.log(`Loaded ${cases.length} case(s). Checking model availability...`);

  const avail = await listAvailableModels();
  const availability = Object.fromEntries(avail.map(a => [a.id, a.available]));
  let wanted = avail.filter(a => a.available);
  const only = arg('--only');
  if (only) {
    const ids = only.split(',').map(s => s.trim());
    wanted = wanted.filter(a => ids.includes(a.id));
  }
  const unavailable = MODELS.filter(m => !availability[m]);
  for (const u of unavailable) console.warn(`  WARN: ${u} is not currently available on Groq — marked UNAVAILABLE and skipped.`);
  if (!wanted.length) {
    console.error('No available models to run.');
    process.exit(3);
  }

  const runId = `run-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  const outDir = path.join(RESULTS_DIR, runId);
  fs.mkdirSync(outDir, { recursive: true });

  const perModel = [];
  for (const m of wanted) {
    const t0 = Date.now();
    console.log(`\nRunning ${m.id} (${cases.length} extractions)...`);
    const { modelId, results, errors } = await runModel(m.id, cases);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    const scored = results.map((r, i) => ({ case: cases[i], out: r, score: scoreCase(cases[i], r), impact: evidenceImpact(cases[i], r) }));
    const perf = {
      modelId,
      latencies: results.map(r => r.latency_ms),
      tokens: {
        prompt: results.map(r => (r.tokens && r.tokens.prompt) || 0).filter(x => x > 0),
        completion: results.map(r => (r.tokens && r.tokens.completion) || 0).filter(x => x > 0),
        total: results.map(r => (r.tokens && r.tokens.total) || 0).filter(x => x > 0),
      },
      errors,
      productionOk: results.map(r => r.productionOk),
    };
    const agg = aggregateModel(cases, scored.map(s => s.score), perf);

    const modelRec = {
      modelId, elapsed_s: elapsed,
      results: scored.map(s => ({
        case_id: s.case.id, category: s.case.category, tags: s.case.tags,
        raw: s.out.raw, rawParsed: s.out.rawParsed, normalized: s.out.normalized,
         schema: s.out.schema, productionOk: s.out.productionOk,
        apiErrors: s.out.apiErrors, extractionError: s.out.extractionError,
        latency_ms: s.out.latency_ms, tokens: s.out.tokens,
        score: s.score, impact: s.impact,
      })),
      aggregate: agg,
    };
    perModel.push(modelRec);
    fs.writeFileSync(path.join(outDir, `model-${modelId.replace(/[/]/g, '__')}.json`), JSON.stringify(modelRec, null, 2));

    console.log(`  done in ${elapsed}s  overall=${pct(agg.overall)}%  schema=${pct(agg.schema_valid_rate)}%  prod_ok=${pct(agg.production_ok_rate)}%  errs=${agg.errors}  mean_flips/case=${(scored.reduce((s, x) => s + x.impact.flips, 0) / mathMax(1, scored.length)).toFixed(2)}`);
  }

  const summary = { runId, generated_at: new Date().toISOString(), case_count: cases.length, availability, models: perModel };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(RESULTS_DIR, 'REPORT.md'), buildReport({ summary, cases, models: perModel }));
  fs.writeFileSync(path.join(RESULTS_DIR, 'SUMMARY.json'), JSON.stringify(summary, null, 2));

  console.log(buildReport({ summary, cases, models: perModel }).split('\n').slice(0, 60).join('\n'));
  console.log(`\nResults written to benchmark/results/${runId}/ and benchmark/results/REPORT.md (latest).`);
}

function mathMax(a, b) { return Math.max(a, b); }

// ---------------------------------------------------------------------------
// REPORT.md builder
// ---------------------------------------------------------------------------

function buildReport({ summary, cases, models }) {
  const L = [];
  const row = (cells) => '| ' + cells.join(' | ') + ' |';
  let section = 1;
  const H = (title) => `## ${section++}. ${title}`;

  L.push('# ADHD LLM Extraction Benchmark — Comparison Report');
  L.push('');
  L.push(`- **Run id:** \`${summary.runId}\``);
  L.push(`- **Generated:** ${summary.generated_at}`);
  L.push(`- **Cases:** ${summary.case_count} (stages: criterion / childhood / impairment / differential); human-authored GOLD per CLINICAL_ADHD_PROTOCOL.md`);
  L.push(`- **Models requested:** ${MODELS.map(m => `${m}${summary.availability[m] ? '' : ' (UNAVAILABLE)'}`).join(', ')}`);
  L.push('- **Scope:** LLM extraction layer only. No diagnosis/tier logic is evaluated or modified.');
  L.push('');
  L.push('> Methods, case categories, scoring rules and weights: see `benchmark/README.md`.');

  // --- scorecard ---
  L.push(H('Scorecard (higher is better; 0–100)'));
  L.push('');
  const dimNames = {
    schema_validity: 'Schema', field_accuracy: 'Field accuracy', missing_evidence: 'Missing evidence',
    unsupported_fabricated: 'No fabrication', incorrect_normalization: 'Normalization',
    uncertainty_handling: 'Uncertainty', contradiction_handling: 'Contradiction', injection_resistance: 'Injection',
  };
  L.push(row(['Model', 'Overall', ...Object.keys(dimNames).map(d => dimNames[d]), 'API errs', 'Latency p50', 'Tokens/call', 'Cost']));
  L.push('| --- ' + ' | --- '.repeat(8 + 4) + ' |');
  for (const m of models) {
    const a = m.aggregate;
    L.push(row([
      m.modelId, `**${pct(a.overall)}%**`,
      ...Object.keys(dimNames).map(d => `${a.dims[d] != null ? pct(a.dims[d]) + '%' + (a.applicable[d] ? '' : '*') : '—'}`),
      a.errors, `${Math.round(a.latency.p50)} ms`, `${Math.round(a.tokens.total_mean)}`,
      a.cost_usd != null ? `$${a.cost_usd.toFixed(4)}` : '—',
    ]));
  }
  L.push('');
  L.push('*\* = dimension not applicable for this model (no GOLD expectation exercises it).*');

  // --- per model details ---
  for (const m of models) {
    L.push('');
    L.push(`## ${m.modelId}`);
    const a = m.aggregate;
    L.push(`Overall **${pct(a.overall)}%** — schema-valid ${pct(a.schema_valid_rate)}% · production-ok ${pct(a.production_ok_rate)}% · API errors ${a.errors} · mean wall ${Math.round(a.latency.mean)}ms (p90 ${Math.round(a.latency.p90)}) · cost $${a.cost_usd == null ? '—' : a.cost_usd.toFixed(4)} · total tokens ${a.tokens.total_sum}`);
    L.push('');
    L.push('### Strongest cases (top 4)');
    const byOverall = m.results.slice().sort((x, y) => y.score.overall - x.score.overall);
    L.push(row(['Case', 'Category', 'Overall', 'Schema', 'Fabrication', 'Notes']));
    L.push('| --- | --- | --- | --- | --- | --- |');
    for (const r of byOverall.slice(0, 4)) {
      L.push(row([r.case_id, r.category, pct(r.score.overall), pct(r.score.dims.schema_validity || 0), pct(r.score.dims.unsupported_fabricated || 0), (r.score.notes[0] || '—').slice(0, 70)]));
    }
    L.push('');
    L.push('### Weakest cases (bottom 5)');
    const worst = byOverall.slice(-5).reverse();
    L.push(row(['Case', 'Category', 'Overall', 'Schema', 'Fabrication', 'Notes']));
    L.push('| --- | --- | --- | --- | --- | --- |');
    for (const r of worst) {
      L.push(row([r.case_id, r.category, pct(r.score.overall), pct(r.score.dims.schema_validity || 0), pct(r.score.dims.unsupported_fabricated || 0), (r.score.notes[0] || (r.schema && r.schema.violations[0]) || '—').slice(0, 70)]));
    }
    L.push('');
    L.push('### Evidence-impact on the deterministic engine (downstream flips vs GOLD)');
    const impacts = m.results.map(r => r.impact.flips);
    const flipCases = impacts.filter(x => x > 0).length;
    const coreFlips = m.results.filter(r => r.impact.detail.some(d => d.startsWith('core_answer'))).length;
    const concreteFlips = m.results.filter(r => r.impact.detail.some(d => d.startsWith('concrete_') || d.startsWith('reported'))).length;
    L.push(`- Mean flips / case: **${(impacts.reduce((s, x) => s + x, 0) / Math.max(1, impacts.length)).toFixed(2)}** (${pct(flipCases / impacts.length)}% of cases have ≥1 downstream-affecting field difference)`);
    L.push(`- Cases where the extracted \`core_answer\` differs from GOLD: **${coreFlips}**`);
    L.push(`- Cases where concrete counts / differential \`reported\` differ: **${concreteFlips}**`);
    const notable = m.results.filter(r => r.impact.flips > 0).sort((x, y) => y.impact.flips - x.impact.flips).slice(0, 4);
    if (notable.length) {
      L.push('- Highest-impact cases:');
      for (const r of notable) L.push(`  - ${r.case_id} (${r.category}) — ${r.impact.flips} flip(s): ${r.impact.detail.join('; ')}`);
    }
  }

  const compatFails = models.filter(m => (m.results || []).filter(r => /json_validate_failed|Failed to validate JSON/.test(String(r.extractionError || ''))).length > 0);
  if (compatFails.length) {
    L.push('**COMPAT — extractor rejects `response_format: json_object` out of the box** (Groq-side `code: json_validate_failed`, HTTP 400):');
    for (const m of compatFails) {
      const n = m.results.filter(r => /json_validate_failed|Failed to validate JSON/.test(String(r.extractionError || ''))).length;
      L.push(`- ${m.modelId}: ${n}/${m.results.length} requests rejected by Groq **before any generation** when production's \`response_format: {type:'json_object'}\` is sent. Without that flag the model responds fine. This model cannot serve the extraction layer as production currently calls it.`);
    }
    L.push('- Fix options: prompt-only JSON instructions for this model, or drop it from the model set.');
    L.push('');
  }

  // --- category breakdown ---
  L.push('');
  L.push(H('Category breakdown (mean overall per category)'));
  const cats = [...new Set(cases.map(c => c.category))];
  L.push(row(['Category', ...models.map(m => m.modelId)]));
  L.push('| --- ' + ' | --- '.repeat(models.length) + ' |');
  for (const cat of cats) {
    const ids = cases.filter(c => c.category === cat).map(c => c.id);
    L.push(row([cat, ...models.map(m => {
      const rs = m.results.filter(r => ids.includes(r.case_id));
      return rs.length ? pct(rs.reduce((s, r) => s + r.score.overall, 0) / rs.length) + '%' : '—';
    })]));
  }

  // --- winner + interpretation ---
  L.push('');
  L.push(H('Verdict'));
  const ranked = models.slice().sort((x, y) => y.aggregate.overall - x.aggregate.overall);
  const winner = ranked[0];
  const runner = ranked[1];
  const delta = runner ? (winner.aggregate.overall - runner.aggregate.overall) : 0;
  const impacts = models.map(m => ({ m: m.modelId, mean: m.results.reduce((s, r) => s + r.impact.flips, 0) / Math.max(1, m.results.length) }));
  const bestImpact = impacts.slice().sort((x, y) => x.mean - y.mean)[0];

  L.push(row(['Metric', ...models.map(m => m.modelId)]));
  L.push('| --- ' + ' | --- '.repeat(models.length) + ' |');
  L.push(row(['Overall', ...models.map(m => pct(m.aggregate.overall) + '%')]));
  L.push(row(['Mean downstream flips/case', ...models.map(m => (m.results.reduce((s, r) => s + r.impact.flips, 0) / Math.max(1, m.results.length)).toFixed(2))]));
  L.push(row(['Mean latency p50 (ms)', ...models.map(m => String(Math.round(m.aggregate.latency.p50)))]));
  L.push(row(['Cost (this run, $)', ...models.map(m => m.aggregate.cost_usd != null ? m.aggregate.cost_usd.toFixed(4) : '—')]));
  L.push('');

  L.push(`**Winner: ${winner.modelId}** with overall ${pct(winner.aggregate.overall)}%${runner ? ` (${delta >= 0.005 ? `margin ${pct(delta)} pts` : 'statistical tie'})` : ' (single-model run)'}.`);
  const canReduceClincially = bestImpact.mean <= 0.3 && winner.aggregate.overall >= 0.9;
  L.push(`- Where ${winner.modelId} fails: ${topFailuresFor(winner).map(x => x.case_id).join(', ') || 'none below 0.5'}.`);
  if (runner) L.push(`- Where ${runner.modelId} fails: ${topFailuresFor(runner).map(x => x.case_id).join(', ') || 'none below 0.5'}.`);
  L.push('');
  L.push('### Clinically-meaningful difference (extraction layer)');
  const winsByImpact = Object.fromEntries(impacts.map(x => [x.m, x.mean]));
  L.push(`- Downstream flips/case: ${Object.keys(winsByImpact).map(k => `${k}=${winsByImpact[k].toFixed(2)}`).join(', ')}.`);
  L.push(`- The extraction layer feeds a deterministic engine; a flip on \`core_answer\`, concrete counts, or differential \`reported\` changes what the engine evaluates. A difference of < 0.5 mean flips per case (i.e., < ~half a case per 48) is **not clinically meaningful**; a consistent multi-case gap is.`);
  const best = impacts.slice().sort((x, y) => x.mean - y.mean)[0];
  const worstI = impacts.slice().sort((x, y) => y.mean - x.mean)[0];
  const gap = worstI.mean - best.mean;
  const meaningful = gap >= 0.75;
  L.push(`- Extraction-fidelity gap between best and worst model: **${gap.toFixed(2)} flips/case** (${meaningful ? 'clinically meaningful' : 'small/non-meaningful'}).`);
  L.push('');

  L.push('### Is the stronger model worth the cost/latency?');
  const yearCost = models.map(m => {
    const totalTok = (m.aggregate.tokens.total_mean || 0);
    const fullUnion = 18 * totalTok + (Math.round(totalTok * 16)); // rough full-interview extrapolation
    return `${m.modelId}: ~${Math.round(totalTok)} tokens/call, p50 ${Math.round(m.aggregate.latency.p50)}ms, ${m.aggregate.cost_usd != null ? '$' + (m.aggregate.cost_usd * (fullUnion / (cases.length * totalTok || 1))).toFixed(3) : 'cost n/a'}`;
  });
  const costGap = winner.aggregate.cost_usd != null && runner && runner.aggregate.cost_usd != null
    ? winner.aggregate.cost_usd / runner.aggregate.cost_usd : null;
  L.push(`- Latency gap: ${winner.aggregate.latency.p50}ms p50 per extraction${runner ? ` vs ${runner.aggregate.latency.p50}ms (second place)` : ' (single-model run)'}.`);
  L.push(`- Cost ratio (winner / runner): ${costGap != null ? costGap.toFixed(2) + 'x this run' : 'n/a'}.`);
  L.push(`- Verdict: ${runner && winner.aggregate.overall - runner.aggregate.overall < 0.025 && winner.aggregate.latency.p50 > runner.aggregate.latency.p50 * 1.3 ? 'The tiny accuracy gain does NOT justify the higher latency — keep the cheaper/faster model for the extraction layer.' : `The ${winner.modelId} advantage in extraction fidelity justifies its cost/latency for this evidence-critical layer.`}`);

  // --- metadata ---
  L.push('');
  L.push(H('Run metadata'));
  L.push(`- Case ids: ${cases.map(c => c.id).join(', ')}`);
  L.push(`- Extraction branches exercised: criterion (${cases.filter(c => c.stage === 'criterion').length}), childhood (${cases.filter(c => c.stage === 'childhood').length}), impairment (${cases.filter(c => c.stage === 'impairment').length}), differential (${cases.filter(c => c.stage === 'differential').length})`);
  L.push(`- Gold expectations authored from CLINICAL_ADHD_PROTOCOL.md §1–§7 + model/schema.js; production prompt/schema used verbatim via interviewer/interviewer.js.`);

  return L.join('\n') + '\n';

  function topFailuresFor(m) {
    return m.results.slice().sort((x, y) => x.score.overall - y.score.overall).filter(x => x.score.overall < 0.5).slice(0, 6);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });