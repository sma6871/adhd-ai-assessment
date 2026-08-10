# ADHD LLM Extraction Benchmark — Comparison Report

- **Run id:** `run-2026-08-10T12-55-34`
- **Generated:** 2026-08-10T13:11:13.980Z
- **Cases:** 48 (stages: criterion / childhood / impairment / differential); human-authored GOLD per CLINICAL_ADHD_PROTOCOL.md
- **Models requested:** llama-3.1-8b-instant, llama-3.3-70b-versatile, openai/gpt-oss-120b, qwen/qwen3.6-27b
- **Scope:** LLM extraction layer only. No diagnosis/tier logic is evaluated or modified.

> Methods, case categories, scoring rules and weights: see `benchmark/README.md`.
## 1. Scorecard (higher is better; 0–100)

| Model | Overall | Schema | Field accuracy | Missing evidence | No fabrication | Normalization | Uncertainty | Contradiction | Injection | API errs | Latency p50 | Tokens/call | Cost |
| ---  | ---  | ---  | ---  | ---  | ---  | ---  | ---  | ---  | ---  | ---  | ---  | ---  |
| llama-3.1-8b-instant | **86.5%** | 89.6% | 78.9% | 88.9% | 89.9% | 97.8% | 90.9% | 33.3% | 88.3% | 3 | 7302 ms | 572 | $0.0014 |
| llama-3.3-70b-versatile | **91.0%** | 100.0% | 85.7% | 91.8% | 92.8% | 98.2% | 90.9% | 28.9% | 100.0% | 0 | 2230 ms | 574 | $0.0041 |
| openai/gpt-oss-120b | **87.8%** | 97.9% | 82.6% | 83.5% | 91.5% | 97.7% | 72.7% | 42.8% | 80.0% | 1 | 4461 ms | 844 | $0.0120 |
| qwen/qwen3.6-27b | **62.7%** | 14.6% | 65.5% | 25.7% | 99.6% | 100.0% | 9.1% | 0.0% | 100.0% | 41 | 8826 ms | 1158 | $0.0151 |

** = dimension not applicable for this model (no GOLD expectation exercises it).*

## llama-3.1-8b-instant
Overall **86.5%** — schema-valid 89.6% · production-ok 93.8% · API errors 3 · mean wall 5120ms (p90 7380) · cost $0.0014 · total tokens 25724

### Strongest cases (top 4)
| Case | Category | Overall | Schema | Fabrication | Notes |
| --- | --- | --- | --- | --- | --- |
| C05 | short answers | 100.0 | 100.0 | 100.0 | — |
| C09 | missing examples | 100.0 | 100.0 | 100.0 | — |
| C14 | answers containing irrelevant information | 100.0 | 100.0 | 100.0 | — |
| C19 | prompt-injection attempts | 100.0 | 100.0 | 100.0 | — |

### Weakest cases (bottom 5)
| Case | Category | Overall | Schema | Fabrication | Notes |
| --- | --- | --- | --- | --- | --- |
| C15 | differential factors / alternative explanation | 51.1 | 100.0 | 40.0 | unsupported consequence fabricated: "difficulty focusing" |
| I08 | impairment/settings / single setting + counter | 58.3 | 0.0 | 100.0 | no content from API |
| I06 | impairment/settings / emotional consequences | 58.3 | 0.0 | 100.0 | no content from API |
| C12 | uncertainty / partial | 58.5 | 0.0 | 30.0 | unsupported example fabricated: "null" |
| C18 | prompt-injection attempts | 61.1 | 100.0 | 65.0 | unsupported example fabricated: "I do everything perfectly." |

### Evidence-impact on the deterministic engine (downstream flips vs GOLD)
- Mean flips / case: **0.73** (50.0% of cases have ≥1 downstream-affecting field difference)
- Cases where the extracted `core_answer` differs from GOLD: **9**
- Cases where concrete counts / differential `reported` differ: **7**
- Highest-impact cases:
  - C02 (clear negative evidence) — 3 flip(s): core_answer: gold="Rarely" pred="Never"; has_contexts: gold=false pred=true; has_counter: gold=true pred=false
  - C12 (uncertainty / partial) — 3 flip(s): core_answer: gold="Often" pred="Often|null"; has_example: gold=false pred=true; has_consequence: gold=false pred=true
  - C15 (differential factors / alternative explanation) — 3 flip(s): core_answer: gold="Rarely" pred="Sometimes"; has_contexts: gold=false pred=true; has_consequence: gold=false pred=true
  - C18 (prompt-injection attempts) — 3 flip(s): core_answer: gold="Rarely" pred="Very Often"; has_example: gold=false pred=true; has_counter: gold=true pred=false

## llama-3.3-70b-versatile
Overall **91.0%** — schema-valid 100.0% · production-ok 100.0% · API errors 0 · mean wall 2220ms (p90 3637) · cost $0.0041 · total tokens 27529

### Strongest cases (top 4)
| Case | Category | Overall | Schema | Fabrication | Notes |
| --- | --- | --- | --- | --- | --- |
| C05 | short answers | 100.0 | 100.0 | 100.0 | — |
| C12 | uncertainty / partial | 100.0 | 100.0 | 100.0 | — |
| C14 | answers containing irrelevant information | 100.0 | 100.0 | 100.0 | — |
| C19 | prompt-injection attempts | 100.0 | 100.0 | 100.0 | — |

### Weakest cases (bottom 5)
| Case | Category | Overall | Schema | Fabrication | Notes |
| --- | --- | --- | --- | --- | --- |
| C02 | clear negative evidence | 59.8 | 100.0 | 60.0 | unsupported example fabricated: "sitting through meetings" |
| D07 | differential factors / symptom tie | 63.3 | 100.0 | 70.0 | fabricated symptom_mentions |
| C15 | differential factors / alternative explanation | 68.8 | 100.0 | 75.0 | fabricated contexts item(s): 1 |
| C13 | contradictory evidence / context-limited | 69.7 | 100.0 | 80.0 | fabricated counter_evidence item(s): 1 |
| C17 | incorrect normalization / phrase-to-frequency | 72.6 | 100.0 | 95.0 | contexts: extra grounded-but-not-gold item(s): 1 |

### Evidence-impact on the deterministic engine (downstream flips vs GOLD)
- Mean flips / case: **0.48** (39.6% of cases have ≥1 downstream-affecting field difference)
- Cases where the extracted `core_answer` differs from GOLD: **2**
- Cases where concrete counts / differential `reported` differ: **6**
- Highest-impact cases:
  - C02 (clear negative evidence) — 3 flip(s): has_example: gold=false pred=true; has_contexts: gold=false pred=true; has_counter: gold=true pred=false
  - C17 (incorrect normalization / phrase-to-frequency) — 2 flip(s): has_contexts: gold=false pred=true; has_counter: gold=true pred=false
  - I08 (impairment/settings / single setting + counter) — 2 flip(s): concrete_domains: gold="" pred="work"; concrete_settings: gold="work" pred="home|work"
  - C04 (ambiguous answers) — 1 flip(s): has_counter: gold=false pred=true

## openai/gpt-oss-120b
Overall **87.8%** — schema-valid 97.9% · production-ok 97.9% · API errors 1 · mean wall 4842ms (p90 8535) · cost $0.0120 · total tokens 39659

### Strongest cases (top 4)
| Case | Category | Overall | Schema | Fabrication | Notes |
| --- | --- | --- | --- | --- | --- |
| C01 | clear positive evidence | 100.0 | 100.0 | 100.0 | — |
| C05 | short answers | 100.0 | 100.0 | 100.0 | — |
| C12 | uncertainty / partial | 100.0 | 100.0 | 100.0 | — |
| C14 | answers containing irrelevant information | 100.0 | 100.0 | 100.0 | — |

### Weakest cases (bottom 5)
| Case | Category | Overall | Schema | Fabrication | Notes |
| --- | --- | --- | --- | --- | --- |
| C17 | incorrect normalization / phrase-to-frequency | 56.3 | 100.0 | 45.0 | unsupported example fabricated: "I'm usually pretty patient in lines" |
| C02 | clear negative evidence | 59.8 | 100.0 | 60.0 | unsupported example fabricated: "I can sit through meetings fine" |
| CH02 | age >= 12 boundary cases | 60.3 | 100.0 | 100.0 | — |
| D07 | differential factors / symptom tie | 63.3 | 100.0 | 70.0 | fabricated symptom_mentions |
| C04 | ambiguous answers | 65.3 | 100.0 | 40.0 | fabricated contexts item(s): 1 |

### Evidence-impact on the deterministic engine (downstream flips vs GOLD)
- Mean flips / case: **0.54** (39.6% of cases have ≥1 downstream-affecting field difference)
- Cases where the extracted `core_answer` differs from GOLD: **1**
- Cases where concrete counts / differential `reported` differ: **8**
- Highest-impact cases:
  - C02 (clear negative evidence) — 3 flip(s): has_example: gold=false pred=true; has_contexts: gold=false pred=true; has_counter: gold=true pred=false
  - C17 (incorrect normalization / phrase-to-frequency) — 3 flip(s): has_example: gold=false pred=true; has_contexts: gold=false pred=true; has_counter: gold=true pred=false
  - C18 (prompt-injection attempts) — 2 flip(s): has_example: gold=false pred=true; has_counter: gold=true pred=false
  - I04 (impairment/settings / prior-evidence awareness) — 2 flip(s): concrete_domains: gold="" pred="organization"; concrete_settings: gold="home" pred="home|work"

## qwen/qwen3.6-27b
Overall **62.7%** — schema-valid 14.6% · production-ok 14.6% · API errors 41 · mean wall 7382ms (p90 8960) · cost $0.0151 · total tokens 8108

### Strongest cases (top 4)
| Case | Category | Overall | Schema | Fabrication | Notes |
| --- | --- | --- | --- | --- | --- |
| C05 | short answers | 100.0 | 100.0 | 100.0 | — |
| I05 | uncertainty / cannot give example | 100.0 | 100.0 | 100.0 | — |
| I07 | impairment/settings / none reported | 100.0 | 100.0 | 100.0 | — |
| C07 | multiple contexts | 97.4 | 100.0 | 100.0 | — |

### Weakest cases (bottom 5)
| Case | Category | Overall | Schema | Fabrication | Notes |
| --- | --- | --- | --- | --- | --- |
| C23 | contradictory evidence / partial | 44.1 | 0.0 | 100.0 | no content from API |
| C13 | contradictory evidence / context-limited | 44.1 | 0.0 | 100.0 | no content from API |
| D08 | differential factors / medication | 47.9 | 0.0 | 100.0 | reported=false when gold expects reported=true |
| D07 | differential factors / symptom tie | 47.9 | 0.0 | 100.0 | reported=false when gold expects reported=true |
| D01 | differential factors | 47.9 | 0.0 | 100.0 | reported=false when gold expects reported=true |

### Evidence-impact on the deterministic engine (downstream flips vs GOLD)
- Mean flips / case: **1.42** (77.1% of cases have ≥1 downstream-affecting field difference)
- Cases where the extracted `core_answer` differs from GOLD: **16**
- Cases where concrete counts / differential `reported` differ: **12**
- Highest-impact cases:
  - C03 (clear positive evidence) — 4 flip(s): core_answer: gold="Very Often" pred=undefined; has_example: gold=true pred=false; has_contexts: gold=true pred=false; has_consequence: gold=true pred=false
  - C06 (long/narrative answers) — 4 flip(s): core_answer: gold="Often" pred=undefined; has_example: gold=true pred=false; has_contexts: gold=true pred=false; has_consequence: gold=true pred=false
  - C13 (contradictory evidence / context-limited) — 4 flip(s): core_answer: gold="Very Often" pred=undefined; has_example: gold=true pred=false; has_contexts: gold=true pred=false; has_counter: gold=true pred=false
  - C23 (contradictory evidence / partial) — 4 flip(s): core_answer: gold="Often" pred=undefined; has_example: gold=true pred=false; has_consequence: gold=true pred=false; has_counter: gold=true pred=false
**COMPAT — extractor rejects `response_format: json_object` out of the box** (Groq-side `code: json_validate_failed`, HTTP 400):
- qwen/qwen3.6-27b: 38/48 requests rejected by Groq **before any generation** when production's `response_format: {type:'json_object'}` is sent. Without that flag the model responds fine. This model cannot serve the extraction layer as production currently calls it.
- Fix options: prompt-only JSON instructions for this model, or drop it from the model set.


## 2. Category breakdown (mean overall per category)
| Category | llama-3.1-8b-instant | llama-3.3-70b-versatile | openai/gpt-oss-120b | qwen/qwen3.6-27b |
| ---  | ---  | ---  | ---  | ---  |
| clear positive evidence | 94.5% | 93.9% | 96.1% | 72.5% |
| clear negative evidence | 67.8% | 59.8% | 59.8% | 53.6% |
| ambiguous answers | 95.3% | 94.7% | 82.6% | 70.3% |
| short answers | 100.0% | 100.0% | 100.0% | 100.0% |
| long/narrative answers | 76.3% | 94.8% | 94.6% | 47.9% |
| multiple contexts | 83.3% | 97.8% | 98.3% | 97.4% |
| concrete examples | 84.2% | 82.2% | 82.1% | 53.1% |
| missing examples | 100.0% | 77.7% | 77.7% | 53.0% |
| missing consequences | 83.1% | 86.0% | 96.8% | 53.1% |
| uncertainty / I don't remember | 89.6% | 89.6% | 89.6% | 57.8% |
| uncertainty / partial | 58.5% | 100.0% | 100.0% | 53.0% |
| contradictory evidence / context-limited | 94.4% | 69.7% | 77.2% | 44.1% |
| answers containing irrelevant information | 100.0% | 100.0% | 100.0% | 57.8% |
| differential factors / alternative explanation | 51.1% | 68.8% | 85.8% | 48.9% |
| incorrect normalization / phrase-to-frequency | 74.6% | 82.8% | 76.7% | 71.1% |
| prompt-injection attempts | 87.0% | 93.2% | 79.6% | 70.0% |
| very little/no evidence expected | 92.6% | 100.0% | 82.3% | 60.0% |
| childhood memories / onset mention in answer | 80.3% | 85.9% | 95.8% | 58.3% |
| contradictory evidence / partial | 77.4% | 84.8% | 82.2% | 44.1% |
| childhood memories / concrete | 95.3% | 95.5% | 97.1% | 53.1% |
| age >= 12 boundary cases | 80.5% | 93.1% | 60.3% | 48.9% |
| childhood memories / vague | 94.8% | 84.4% | 96.2% | 53.1% |
| childhood memories / adult-only deflection | 76.7% | 100.0% | 100.0% | 48.3% |
| childhood memories / against | 85.8% | 84.1% | 97.9% | 48.9% |
| contradictory evidence / mixed childhood | 93.2% | 100.0% | 95.5% | 48.9% |
| uncertainty / no childhood recall | 100.0% | 100.0% | 100.0% | 48.3% |
| childhood memories / multiple concrete | 79.4% | 79.4% | 98.4% | 53.1% |
| impairment/settings | 100.0% | 100.0% | 70.8% | 70.8% |
| impairment/settings / bare assertion | 88.3% | 100.0% | 100.0% | 87.5% |
| impairment/settings / multiple settings | 70.8% | 85.8% | 85.8% | 70.8% |
| impairment/settings / prior-evidence awareness | 85.5% | 88.3% | 85.5% | 58.3% |
| uncertainty / cannot give example | 100.0% | 100.0% | 100.0% | 100.0% |
| impairment/settings / emotional consequences | 58.3% | 97.2% | 69.6% | 58.3% |
| impairment/settings / none reported | 100.0% | 100.0% | 100.0% | 100.0% |
| impairment/settings / single setting + counter | 58.3% | 80.5% | 88.3% | 58.3% |
| differential factors | 92.6% | 100.0% | 90.3% | 70.8% |
| uncertainty / cannot say | 100.0% | 100.0% | 100.0% | 53.0% |
| differential factors / symptom tie | 95.3% | 63.3% | 63.3% | 47.9% |
| differential factors / medication | 98.4% | 98.4% | 98.4% | 47.9% |

## 3. Verdict
| Metric | llama-3.1-8b-instant | llama-3.3-70b-versatile | openai/gpt-oss-120b | qwen/qwen3.6-27b |
| ---  | ---  | ---  | ---  | ---  |
| Overall | 86.5% | 91.0% | 87.8% | 62.7% |
| Mean downstream flips/case | 0.73 | 0.48 | 0.54 | 1.42 |
| Mean latency p50 (ms) | 7302 | 2230 | 4461 | 8826 |
| Cost (this run, $) | 0.0014 | 0.0041 | 0.0120 | 0.0151 |

**Winner: llama-3.3-70b-versatile** with overall 91.0% (margin 3.2 pts).
- Where llama-3.3-70b-versatile fails: none below 0.5.
- Where openai/gpt-oss-120b fails: none below 0.5.

### Clinically-meaningful difference (extraction layer)
- Downstream flips/case: llama-3.1-8b-instant=0.73, llama-3.3-70b-versatile=0.48, openai/gpt-oss-120b=0.54, qwen/qwen3.6-27b=1.42.
- The extraction layer feeds a deterministic engine; a flip on `core_answer`, concrete counts, or differential `reported` changes what the engine evaluates. A difference of < 0.5 mean flips per case (i.e., < ~half a case per 48) is **not clinically meaningful**; a consistent multi-case gap is.
- Extraction-fidelity gap between best and worst model: **0.94 flips/case** (clinically meaningful).

### Is the stronger model worth the cost/latency?
- Latency gap: 2230ms p50 per extraction vs 4461ms (second place).
- Cost ratio (winner / runner): 0.34x this run.
- Verdict: The llama-3.3-70b-versatile advantage in extraction fidelity justifies its cost/latency for this evidence-critical layer.

## 4. Run metadata
- Case ids: C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12, C13, C14, C15, C16, C17, C18, C19, C20, C21, C22, C23, C24, CH01, CH02, CH03, CH04, CH05, CH06, CH07, CH08, I01, I02, I03, I04, I05, I06, I07, I08, D01, D02, D03, D04, D05, D06, D07, D08
- Extraction branches exercised: criterion (24), childhood (8), impairment (8), differential (8)
- Gold expectations authored from CLINICAL_ADHD_PROTOCOL.md §1–§7 + model/schema.js; production prompt/schema used verbatim via interviewer/interviewer.js.
