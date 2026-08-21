# ADHD LLM Extraction Benchmark — Results Archive

This directory contains archived benchmark results from the LLM extraction-layer evaluation
for the ADHD assessment companion's evidence-extraction pipeline.

## Scope

The benchmark measures **LLM text-extraction fidelity** — how accurately each model extracts
structured JSON evidence fields from user responses across 4 clinical branches in
`interviewer/interviewer.js` (Criterion, Childhood, Impairment, Differential).

It does **NOT** measure diagnosis, tier determination, or any logic in `model/engine.js`.

- **Benchmark size:** 48 human-authored test cases
- **Scoring:** Deterministic (token-overlap + exact-match), fixed weights, no LLM callbacks
- **Production prompt/parameters used verbatim:** `temperature: 0.2`, `response_format: { type: "json_object" }`, `max_tokens: 512–768`

## Archived Runs

### 1. `2026-08-10-baseline/`

- **Date:** August 10, 2026
- **Run ID:** `run-2026-08-10T12-55-34`
- **Models tested:** 4
  - `llama-3.1-8b-instant` (now deprecated/unavailable)
  - `llama-3.3-70b-versatile` (now deprecated/unavailable)
  - `openai/gpt-oss-120b` — **87.8%** (historical baseline)
  - `qwen/qwen3.6-27b` — excluded due to JSON mode incompatibility (41/48 API failures)

### 2. `2026-08-21-fair-rerun/`

- **Date:** August 21, 2026
- **Run ID:** `run-2026-08-21T09-36-49`
- **Models tested:** 2
  - `openai/gpt-oss-120b` — **87.8%** aggregate / **89.7%** successful-only
  - `openai/gpt-oss-20b` — **84.4%** aggregate / **88.8%** successful-only
- **Method:** Includes 30-second cooldown between model runs to reduce cross-model rate limiting

## Production Decision

**Selected for production: `openai/gpt-oss-120b`**

Rationale:
- Highest overall extraction fidelity (89.7% on successful cases)
- Lowest API failure rate (3/48 vs 7/48 for 20B)
- Strongest childhood-evidence extraction (92.7% — clinically critical for ADHD onset requirement)
- Strongest injection resistance (100%) and contradiction handling (33.3%)
- Acceptable latency (4,457ms p50) and moderate cost ($0.0111 per 48-case benchmark run)

## Why GPT-OSS 20B Was Not Selected

Despite being **49% cheaper** ($0.0057/run vs $0.0111/run) and showing strong uncertainty
handling (81.8% vs 63.6%), GPT-OSS 20B was not promoted to production because:

1. **Childhood extraction weakness:** 82.7% vs 92.7% on the childhood branch — the single most
   clinically critical branch for ADHD diagnosis (onset-before-age-12 requirement).

2. **Higher failure rate:** 7/48 API/infrastructure failures vs 3/48 for 120B, including
   JSON validation rejections (`json_validate_failed`) and rate-limit exhaustion.

3. **Slower latency:** 7,403ms p50 vs 4,457ms p50 — 62% slower per extraction call.

4. **Weaker contradiction handling:** 22.2% vs 33.3% — critical for differentiating ADHD from
   alternative explanations in clinical contexts.

GPT-OSS 20B remains a viable **cost-optimized backup** for non-clinical or lower-stakes use cases
where the childhood-evidence and contradiction-handling deficits are acceptable.

## File Structure

Each archived run directory contains:
- `summary.json` — aggregate results, availability, per-model scores
- `model-<model-id>.json` — per-case results (raw output, parsed JSON, normalized evidence,
  scores, downstream impact) for each model tested

## Historical Context

`benchmark/results/REPORT.md` and `benchmark/results/SUMMARY.json` at the parent directory
level contain the most recent auto-generated report and are overwritten on each run. The
archived snapshots in this directory preserve the historical comparison baselines.
