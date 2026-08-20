# CEO Plan — ADHD Screening Companion

**Purpose:** High-level, step-by-step roadmap for steering this project to a shipped, trusted, useful product. Written from a CEO / product-lead perspective: milestones, decision gates, risks, and the very next action at each stage.

**Product North Star:** Build the simplest possible **structured ADHD assessment** that can achieve high-quality, evidence-based results. Optimize for clinical structure, evidence quality, consistency, and a manageable implementation — not maximum features.

**Read this first:** [PROJECT_STATUS_AND_HANDOVER.md](PROJECT_STATUS_AND_HANDOVER.md) (living development status) → [PRD.md](PRD.md) (vision) → [FAST_TRACK_ADHD_ASSESSMENT_PLAN.md](FAST_TRACK_ADHD_ASSESSMENT_PLAN.md) (authoritative implementation plan) → current prototype `index.html`.

---

## 0. Where we are right now

- **V1 ASRS screener is complete** as a private, single-file, mobile-first web app (`index.html`: language selection → welcome → how-to-answer → 6 ASRS questions → binary result).
- It runs the official ASRS v1.1 with validated scoring (4+ positive → screen-positive).
- **The next major product goal is the structured ADHD assessment companion.** See `FAST_TRACK_ADHD_ASSESSMENT_PLAN.md`.
- The previous drift toward a general assessment platform / workflow engine is **deferred**.

---

## 1. Roadmap (fast-track, ADHD-only)

### Phase V1 — Validate ASRS screener (current)
**Goal:** Confirm the existing screener is understood correctly before building on top of it.

1. **Run the tiny usability test** — 3 adults, observe unmoderated (preferred language).
2. **Debrief:** What did this tool do? What did the result mean? Unclear/uncomfortable wording? What next?
3. **Success =** all three finish independently, understand "screening ≠ diagnosis," and understand their next step.
4. **One focused revision pass** — fix only recurring issues. No feature additions.

> **The structured assessment (Phase V2) does not start in earnest until V1 clears this gate.** The V1 work is preserved exactly as the entry stage of the larger assessment.

### Phase V2 — Structured ADHD Assessment (the priority)
**Goal:** Build the five-stage structured ADHD assessment companion.

```
Stage 1: ASRS Screener          (existing V1 — reused)
→ Stage 2: Adult ADHD Symptoms   (18 DSM-5 items, structured evidence)
→ Stage 3: Childhood History     (pre-age-12 concrete evidence)
→ Stage 4: Functional Impairment (domains + multiple settings)
→ Stage 5: Focused Differential Check (confounder flagging)
→ Final: Structured, evidence-based report
```

Target total: **~50–75 minutes**. Stage 1 is a valid endpoint on its own (screen-negative exits here).

Implementation order (smallest sensible, no upfront architecture) — **Gate 0 (lock `CLINICAL_ADHD_PROTOCOL.md`) is mandatory before M2 starts:**

| Step | Action | Gate |
| --- | --- | --- |
| Gate 0 | Clinical Protocol Review — lock `CLINICAL_ADHD_PROTOCOL.md`. | Before M2. |
| M1 | Lock the assessment protocol + data model (stages, criteria, evidence schema). | Requires Gate 0. |
| M2 | Build Adult ADHD Symptoms interview (18 DSM-5 items). | Requires Gate 0. |
| M3 | Build Childhood History. | — |
| M4 | Build Functional Impairment + Multiple Settings. | — |
| M5 | Build Focused Differential Check. | — |
| M6 | Build structured report. | After M2–M5. |
| M7 | Connect existing ASRS V1 as Stage 1. | — |
| M8 | Manual/self testing + clinician review. | Before any public/clinician work. |

Do **not** start M2–M5 until `CLINICAL_ADHD_PROTOCOL.md` is locked.

**Success =** a user can complete all five stages, provide concrete evidence, and receive a structured report that (a) shows supporting evidence, counter-evidence, and uncertainty; (b) gives a clear recommendation about professional evaluation; and (c) clearly states it is **not a diagnosis** and can explain *why* it reached its summary from the user's own evidence.

The Clinical Protocol Review (Gate 0) is now complete: `CLINICAL_ADHD_PROTOCOL.md` is written with the 18 DSM-5 criteria (distinct, adult-adapted), per-criterion evidence rules, bounded follow-ups, childhood-onset ratings, impairment/multiple-settings rules, focused differential flagging, and a **deterministic final evaluation** covering all six DSM-5 ADHD criteria (symptom count, ≥6-month duration, age of onset, ≥2 settings, clinically significant impairment, and "not better explained"). It is ADHD-only.

### Phase V Future — Everything else (deferred)
Autism/ASD, anxiety/depression full modules, OCD, broad neurodivergence, clinician dashboard, accounts, payments, general workflow engine, treatment/medication recommendations. These are explicitly **not** part of the fast-track path.

---

## 2. The very next 5 actions (priority order)

| # | Action | Note |
| --- | --- | --- |
| 1 | Run the V1 usability test (3 testers) on `index.html`. | Confirm the ASRS screener behaves as the trusted entry stage. |
| 2 | **Clinical Protocol Review (Gate 0):** lock `CLINICAL_ADHD_PROTOCOL.md`. | Required before M2 begins — defines evidence rules, childhood/onset, impairment, differential red flags, deterministic final evaluation. |
| 3 | Lock the assessment protocol + data model (M1). | Stages, criteria, evidence schema, state model. Done once Gate 0 is set. |
| 4 | Implement Stage 2 — Adult ADHD Symptoms (18 DSM-5 items). (M2) | AI interviewer + structured evidence per item. |
| 5 | Iterate: Stage 3 → Stage 4 → Stage 5 → Report → Connect ASRS as Stage 1 → Test. | M3–M8, one stage at a time. |

---

## 3. Decision gates & non-negotiables

- **V1 validation gate:** the ASRS screener must be verified with 3 users before treating it as a trusted foundation. (It is preserved verbatim regardless.)
- **M8 gate:** no public/clinician work before manual/self testing + clinician review.
- **No platform/engine:** do not build a general workflow engine. Use a simple five-stage state machine and one JSON state document per assessment.
- **Diagnosis boundary:** never say "you have ADHD," never recommend medication/treatment, never show probability scores implying clinical precision, never claim diagnostic validity.
- **Persian validation rule:** never describe any translation as validated until a qualified bilingual clinician reviews it.
- **Engineered separation:** AI is the interviewer; the engine is the determinative protocol/scoring/report logic. The AI never decides the protocol.

---

## 4. Risks & mitigations (CEO view)

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Building a general platform instead of ADHD assessment | Never ships, loses clinical focus | Strict ADHD-only scope; platform deferred. |
| AI overrides the structured protocol | Unsafe, untrustworthy results | Engine is deterministic; AI only fills evidence slots. |
| Over-claiming clinical validity | Trust, regulatory, reputational risk | Strict "screening/assessment, not diagnosis" wording; no numbers. |
| Persian labeled "validated" prematurely | Misleads FA users | Block "validated" until clinical review. |
| Scope creep / feature creep | Complexity kills evidence quality | Bounded 5-stage design; ruthless deferral. |
| V1 not validated before building on it | Weak foundation for the whole assessment | Hold V2 start on the V1 usability gate. |

---

## 5. What "done V1 + V2" looks like

V1 done: 3 testers finish the ASRS screener, understand it's screening (not diagnosis), and state a next step.

V2 done: a user can complete the five-stage structured ADHD assessment, receive a structured, evidence-traceable report, understand the recommendation about professional evaluation, and understand it is **not a diagnosis**. The system can explain why it reached its summary from the user's own evidence.
