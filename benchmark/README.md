# ADHD LLM Extraction Benchmark

Determines which Groq model is best for **this project's** LLM evidence-extraction task —
the structured-`JSON` extraction layer in `interviewer/interviewer.js` that feeds the
deterministic assessment engine (`model/engine.js`). It is **not** a general-intelligence
benchmark. Nothing here scores the diagnosis/tier: the deterministic engine owns that logic.

## Scope

The production extractor has four branches, each with its own code, prompt, schema, and
normalization:

| Branch | Production function | Extracted fields |
| --- | --- | --- |
| Criterion (Stage 2) | `extractCriterionEvidence` | `core_answer` (Never/Rarely/Sometimes/Often/Very Often), `example`, `contexts[]`, `consequence`, `counter_evidence[]`, `uncertainty` |
| Childhood (Stage 3) | `extractChildhoodEvidence` | `memories[]` `{behavior, age, source, concrete, against, vague}`, `uncertainty` |
| Impairment (Stage 4) | `extractImpairmentEvidence` | `domains_impaired[] {domain,example,concrete}`, `settings[] {setting,example,concrete}`, `uncertainty` |
| Differential (Stage 5) | `extractDifferentialEvidence` | `reported`, `symptom_mentions[]`, `uncertainty` |

The benchmark drives these **unchanged production functions** on the **unchanged production
prompts** (`SYSTEM_PROMPT`, `buildMessages`, per-stage prompts, `response_format` JSON mode,
temperature 0.2, max_tokens). The runner only (a) sets `GROQ_MODEL` before `require` so each
model is tested with its own engine instance, and (b) patches `globalThis.fetch` to **observe**
the request/response (latency, raw content, tokens, status) without altering what production
sends or receives. No production file is modified.

## Layout

```
benchmark/
  README.md            this file
  cases.json           48 human-authored cases with GOLD (input: criterion/probe/answer; output: expected normalized evidence)
  run.js               CLI entry point
  lib/
    runner.js          drives the real production extractor per model, captures raw/latency/tokens/errors
    scoring.js         deterministic per-case scoring + aggregation + evidence-impact metric
    util.js            text normalization (token-overlap) primitives
  results/
    run-.../           one timestamped run: per-model JSON + summary.json + REPORT.md
    REPORT.md          latest comparison report (overwritten each run)
    SUMMARY.json       latest aggregate summary
```

## Case coverage (48 cases, human-authored GOLD)

GOLD expectations are the **post-normalization evidence fields the production extractor should
return**, authored strictly from `CLINICAL_ADHD_PROTOCOL.md` (§1–§7) and `model/schema.js`.
Every case records: stage, the production `criterion_id`/`probe_id` it drives (so the runner
uses the real question text), `priorEvidence`, optional `transcript`, the user's answer, and the
GOLD extraction. Injection cases tag `injection`; the GOLD encodes the *legitimate* content
only.

Categories covered: clear positive evidence · clear negative evidence · ambiguous answers ·
short answers · long/narrative answers · multiple contexts · concrete examples · missing
examples · missing consequences · uncertainty/"I don't remember" · contradictory / context-limited
evidence · childhood memories (concrete, vague, mixed, against, adult-only deflection) ·
**age ≥ 12 boundary (H2: age must be preserved, not nullified)** · impairment/settings
(multi-domain, bare assertion, single-setting+counter, prior-evidence awareness, emotional
domain, none-reported) · differential factors (reported+tying, reported-no-tie, hedged=no,
injection) · answers containing irrelevant/off-topic content · prompt-injection attempts ·
cases where correct extraction is minimal/empty.

## Running

```bash
export GROQ_API_KEY=...          # required
node benchmark/run.js            # full run: 48 cases x available models
node benchmark/run.js --smoke    # 1 representative case per stage per model (fast sanity)
node benchmark/run.js --limit 10
node benchmark/run.js --only openai/gpt-oss-120b
```

Model availability is checked against `GET /v1/models` at runtime; unavailable models (e.g.
`qwen/qwen3.6-27b` if de-listed) are reported as `UNAVAILABLE` and skipped. Nothing is
committed; all artifacts land in `benchmark/results/`.

Transient HTTP 429/5xx are retried in the runner with 1s/2s/4s exponential backoff (max 3
attempts) so full runs are not poisoned by Groq rate limits.

## Model definitions

Model IDs, labels, pricing, and compatibility flags are centralized in
`benchmark/models.json`. The runner loads this file at startup — add a new entry
there to include a model in the next run. Pricing is in USD per 1M tokens
(source: Groq public pricing, July 2026 — verify before relying).

## Scoring methodology (deterministic)

Every score is a pure function of `{case, model output}`. No probability, no LLM callbacks.
Text fidelity = token-set overlap (Dice) or substring containment after
normalization (lowercase, non-alphanumeric stripped) — see `lib/util.js`.

### Per-case scoring

The model's **raw** JSON is schema-checked (`schema_validity`): required keys, correct types,
enum validity (`core_answer` must be one of the five frequencies; `source` must be one of the
five memory sources; booleans where required). This is distinct from *production acceptance*:
production normalizes/throws defensively, so a raw enum violation can still pass production.
Both are recorded.

Each evidence field is scored against GOLD:

- `core_answer` — exact match = 1; off-by-one on the frequency ladder = 0.5; anything else = 0;
  gold `null` + present value = fabricated (0).
- `example` / `consequence` — presence (both present/absent) and overlap fidelity; an
  `example` where GOLD expects none is fabrication.
- `contexts` / `counter_evidence` / `symptom_mentions` — greedy item matching; extra output
  items are neutral-near-zero when grounded in the user's own answer/prior evidence, and penalized
  as fabrication when ungrounded.
- `memories[]` — pairwise behavior fidelity + exact `age` equality (age ≥ 12 must be preserved),
  `source` enum, `concrete`/`against`/`vague` booleans, with fixed weights:
  behavior 0.5, age 0.2, source 0.1, concrete 0.1, against 0.05, vague 0.05.
- `domains_impaired` / `settings[]` — name+example matching and `concrete` flag equality.
- `reported` and `uncertainty` — exact boolean/presence values.

### Dimensions (literal, fixed)

| Dimension | Meaning |
| --- | --- |
| `schema_validity` | raw JSON shape/enums conform (0/1 per case) |
| `field_accuracy` | mean over per-field scores |
| `missing_evidence` | fraction of GOLD evidence absent from output |
| `unsupported_fabricated` | 1 − weighted fabrication (evidence present when GOLD says none, incl. ungrounded array items) |
| `incorrect_normalization` | off-by-one frequency drift, wrong/lost `age`, invalid `source`, wrong booleans |
| `uncertainty_handling` | uncertainty set only when GOLD says so (and vice versa) |
| `contradiction_handling` | `counter_evidence` / `against` memories captured correctly |
| `injection_resistance` | (injection cases only) 1 − leakage/fabrication caused by the injected instruction |

A dimension is `N/A` when the case has no such surface (e.g. `contradiction_handling` on a case
with no counter-evidence). Per-case **overall** = weighted mean over *applicable* dimensions,
weights renormalized to the applicable set:

| Dim | Weight |
| --- | --- |
| field_accuracy | 0.25 |
| unsupported_fabricated | 0.20 |
| missing_evidence | 0.15 |
| incorrect_normalization | 0.10 |
| schema_validity | 0.10 |
| uncertainty_handling | 0.08 |
| contradiction_handling | 0.07 |
| injection_resistance | 0.05 |

Model scores = mean of per-case dimension/overall scores. Anti-fabrication and schema validity
are weighted heavily because this layer feeds a deterministic clinical engine.

### Evidence-impact (downstream effect)

In addition to the fidelity score, each case records **downstream flips**: how many
engine-consumed field *values* differ from GOLD (`core_answer`, has-example, has-contexts,
has-consequence, has-counter, has-uncertainty; concrete/against memory counts; concrete domain
and setting sets; differential `reported` / symptom-tie / uncertainty). This quantifies the
eligibility of a model's error to change what the deterministic engine evaluates — without
running the engine or touching diagnosis.

## Cost & latency

Per-model token price table (`models.json`, USD per 1M tokens; source: public Groq
pricing, July 2026 — verify before relying):

| Model | Input $/M | Output $/M |
| --- | --- | --- |
 | `llama-3.1-8b-instant` | 0.05 | 0.08 |
| `llama-3.3-70b-versatile` | 0.15 | 0.15 |
| `openai/gpt-oss-120b` | 0.15 | 0.60 |
| `qwen/qwen3.6-27b` | 0.60 | 3.00 |

Latency is the wall time of the production HTTPS call (measured via the fetch patch). Token
usage comes from Groq's `usage` response field.

## Non-goals / guardrails

- Does **not** modify production assessment logic, prompts, schema, protocol, or scoring.
- Does **not** evaluate the final recommendation/tier. The deterministic engine owns that.
- Gold is authored by a human against the current protocol only — not against any model's output.
- All scoring is deterministic and transparent; thresholds and weights are documented here and
  hard-coded in `lib/scoring.js`.