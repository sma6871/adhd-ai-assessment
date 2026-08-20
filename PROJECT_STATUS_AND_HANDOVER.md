# ADHD Screening Companion — Status & Handover

## One-sentence product

A calm, bilingual (English/Persian), mobile-first **structured ADHD assessment companion**. It uses a validated ASRS screener to decide whether further structured ADHD evidence-gathering is warranted, then — if the user chooses — conducts a brief, evidence-based adult ADHD interview (symptoms, childhood history, functional impairment, focused differential check) and produces a structured, traceable summary. It is not a diagnosis or treatment tool.

## Current status

**Phase: V1 ASRS screener complete; fast-track structured ADHD assessment is the next milestone.**

### What is built

The V1 ASRS screener is implemented as a private, single-file, mobile-first web prototype (`index.html`):

- English and Persian are separate flows (LTR / RTL respectively).
- Full ASRS v1.1 (6-question) flow: language selection → welcome → how-to-answer → six questions → binary result.
- Scoring is implemented and verified: **4 or more** positive screen responses (Q1–3: Sometimes/Often/Very Often; Q4–6: Often/Very Often) → screen-positive; fewer → screen-negative.
- The response count is never shown to the user.
- Results avoid diagnoses, probabilities, severity, treatment advice, and numerical scores; plain-language next steps only.
- ASRS copyright notice and citation included; safety/urgent-support note present.
- Visual direction matches the approved V1 wireframe (clean, calm, minimal, one question per screen).

**Code / version-control snapshot:**
- Repository: `main`, 2 commits.
  - `81f414b` — initial ADHD self-screening prototype (EN/FA ASRS v1.1 flow).
  - `4e1797b` — collapse help by default; tighten EN answer font; add ASRS citation.
- Current state: working tree clean except for planning docs.

### Relationship to the fast-track plan

- `FAST_TRACK_ADHD_ASSESSMENT_PLAN.md` is the authoritative implementation plan for the next phase: the structured ADHD assessment companion (five stages: ASRS → adult symptoms → childhood history → functional impairment → focused differential check → report).
- **`CLINICAL_ADHD_PROTOCOL.md` is a mandatory gating document.** It locks the evidence requirements, bounded follow-up, completion rules, childhood/onset criteria, impairment/multiple-settings rules, differential red flags, contradictory evidence handling, and the deterministic final DSM-5 evaluation. **No implementation stage (M2–M8) may begin until this protocol is locked.**
- The current V1 screener is **Stage 1** of that assessment. It is preserved, not replaced.
- A screen-negative ASRS result is a valid endpoint; screen-positive offers to continue into the deeper assessment.
- The general platform / workflow-engine / multi-condition vision is **deferred**. This project is intentionally ADHD-only for now.

### Development phases (where this project sits)

| Phase | Goal | Status |
| --- | --- | --- |
| V0 — Spec & ASRS prototype | Define scope, script, screens, build V1 screener | Complete |
| V1 — Validate screener (current) | Tiny usability test (3 users), confirm understanding | In progress — gate before Stage 2 |
| Gate 0 — Clinical Protocol Review | Lock `CLINICAL_ADHD_PROTOCOL.md` (evidence rules, deterministic DSM-5 evaluation) | **Complete — written, ready to lock** |
| V2 — Structured ADHD assessment | Five-stage assessment + report (ADHD-only) | Next milestone (after Gate 0 + V1) |
| Future — Other conditions / platform | Autism, anxiety/depression modules, workflow engine, etc. | Deferred (not in scope) |

## Source of truth

Read these in this order:

1. [PROJECT_STATUS_AND_HANDOVER.md](PROJECT_STATUS_AND_HANDOVER.md) — current status and decisions.
2. [CEO_PLAN.md](CEO_PLAN.md) — high-level CEO roadmap and next actions.
3. [FAST_TRACK_ADHD_ASSESSMENT_PLAN.md](FAST_TRACK_ADHD_ASSESSMENT_PLAN.md) — authoritative implementation plan for Stage 2–5 + report.
4. [CLINICAL_ADHD_PROTOCOL.md](CLINICAL_ADHD_PROTOCOL.md) — **mandatory gate** (evidence rules, completion rules, deterministic evaluation) before any Stage 2 implementation.
5. [V1_QUESTION_AND_RESULT_SCRIPT.md](V1_QUESTION_AND_RESULT_SCRIPT.md) — authoritative V1 ASRS copy, scoring, and result rules (Stage 1).
6. [V1_WIREFRAME_AND_SCREEN_SPEC.md](V1_WIREFRAME_AND_SCREEN_SPEC.md) — approved V1 flow and visual direction.
7. [index.html](index.html) — current working V1 prototype (Stage 1).
8. [V1 product spec.md](V1 product spec.md) — background; V1 = screening foundation.
9. [PRD.md](PRD.md) — vision (platform/engine explicitly deferred).

## Non-negotiables for V1 + fast-track

- Keep the ASRS screener under 10 minutes and limited to six ASRS-v1.1 questions; preserve the official scoring logic.
- Never claim to diagnose ADHD or recommend treatment/medication.
- Do not publicly present the Persian translation as validated until a qualified clinical reviewer confirms it.
- Keep the experience calm, private, simple, and mobile-first.
- Do not turn this into a general platform or workflow engine (deferred).
- Stay ADHD-only for this phase; do not add autism/anxiety/broad neurodivergence scope.
- The AI is an interviewer, not the diagnostic/assessment engine. Assessment protocol and scoring stay deterministic.

## High-level plan (CEO view — see CEO_PLAN.md for detail)

1. **Validate V1** with a tiny 3-person usability test; revise only recurring issues.
2. **Clinical Protocol Review (Gate 0)** — lock `CLINICAL_ADHD_PROTOCOL.md`. This is a mandatory gate **before any Stage 2 implementation** (M2+).
3. **Lock** the assessment protocol and data model (stages, criteria, evidence schema, simple state machine).
4. **Build Stage 2** — Adult ADHD Symptoms (18 DSM-5 items, structured evidence).
5. **Build Stage 3** — Childhood History (concrete pre-age-12 evidence).
6. **Build Stage 4** — Functional Impairment + Multiple Settings.
7. **Build Stage 5** — Focused Differential Check (confounder flagging).
8. **Build the structured, evidence-based report.**
9. **Connect** the existing ASRS V1 as Stage 1.
10. **Test** manually/self + clinician review before anything else.

## Definition of success for the next milestone

A user can complete the ASRS screener (V1 gate) **or** — after continuing — the full five-stage structured ADHD assessment and receive a report that:
- shows supporting evidence, counter-evidence, and uncertainty per DSM-5 symptom;
- summarizes childhood evidence, functional impairment, and settings affected;
- flags relevant differential considerations;
- gives a clear recommendation about whether professional evaluation may be worthwhile;
- clearly states it is **not a diagnosis**;
- can explain *why* it reached its summary from the user's own evidence.

If testers cannot do this, fix only the observed friction and retest. No scope expansion.
