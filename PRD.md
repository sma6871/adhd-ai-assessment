# PRD: Structured ADHD Assessment Companion

## Summary

Create a non-diagnostic, evidence-based **ADHD assessment companion** that helps an adult decide whether a professional ADHD evaluation may be worthwhile. It combines a validated ASRS screener with a bounded, structured AI-led evidence interview across adult ADHD symptoms, childhood history, functional impairment, and a focused differential check — then produces a structured, traceable report.

It is intentionally **ADHD-only** for now. A general mental-health / neurodivergence platform is explicitly out of scope (deferred).

The first release must stay intentionally small so it can be finished: the ASRS screener (V1) plus the five-stage structured assessment + report (fast-track).

## Product Promise

The product helps the user answer:

> "Based on a short, structured ADHD screening and evidence-gathering, would it make sense for me to seek a professional ADHD evaluation?"

The product must **not** answer:

> "Do I officially have ADHD?"

The output helps the user understand their own pattern, notice uncertainty, and prepare for a possible appointment with a psychiatrist, psychologist, therapist, or other qualified clinician. Every conclusion is traceable back to the user's own evidence.

## Scope

### In scope
- **Stage 1 — ASRS v1.1 screener** (existing V1). Preserved verbatim.
- **Stage 2 — Adult ADHD symptoms.** Structured interview of all 18 DSM-5/DSM-5-TR items (9 inattentive, 9 hyperactive/impulsive), collecting concrete evidence per item.
- **Stage 3 — Childhood history.** Concrete pre-age-12 evidence (school, homework, organization, attention, impulsivity, behavior, etc.).
- **Stage 4 — Functional impairment + multiple settings.** Evidence of meaningful impact across life domains and across settings.
- **Stage 5 — Focused differential check.** Flagging of plausible alternative explanations (anxiety, depression, sleep, bipolar-spectrum, substance use, chronic stress, relevant medical factors) — flagging only, not diagnosing.
- **Structured report.** Evidence-based summary: adult symptoms, childhood evidence, impairment, differentials, contradictory evidence, uncertainty, and a clinician-friendly summary. Always with a non-diagnosis disclaimer.

### Explicitly out of scope (deferred)
- Autism/ASD screening.
- Full anxiety/depression diagnostic modules.
- OCD, broad neurodivergence platform.
- Clinician dashboard, accounts, payments, multi-user infrastructure.
- General workflow engine or platform architecture.
- Treatment / medication recommendations.
- Diagnostic claims.

These are future ideas, not current work.

## Architecture principle (AI vs. engine)

- **Interviewer LLM:** natural conversation, asking the current question, understanding free-text, bounded follow-ups, extracting evidence, detecting when a criterion is adequately evidenced or uncertain.
- **Structured assessment engine:** stage/criterion tracking, evidence requirements, completion conditions, scoring/classification rules, progression, and report data.
- The AI never decides the protocol, scoring, or conclusions. The protocol is structured and deterministic.

The system uses a simple state model — **no general workflow engine**:

```
ONBOARDING → SCREENING → ADULT_SYMPTOMS → CHILDHOOD → IMPAIRMENT → DIFFERENTIAL → REPORT
```

State is persisted as a single JSON document per assessment. The core data structure is **evidence per criterion** (supported / partially_supported / unsupported / uncertain), not chat history.

## Clinical Foundations

- **ASRS v1.1** — initial screening (existing V1). Preserve official wording and scoring.
- **DSM-5 / DSM-5-TR** — 18 ADHD symptom items as the framework for Stage 2.
- **DIVA-5** — principles for structured interviewing, childhood history, and impairment (reference only; not reproduced/branded as official DIVA-5; not copied without licensing).

Clinical requirements:
- ASRS scoring must preserve its validated meaning.
- DSM-derived items should guide symptom mapping; plain-language explanations over clinical jargon.
- Any public/commercial version must verify permissions for copyrighted instruments, translations, and branding before use.

## Assessment Flow & Timing

Approximately **50–75 minutes** total:

| Stage | Duration | Notes |
| --- | --- | --- |
| ASRS screening | 3–5 min | Existing V1; valid standalone endpoint. |
| Adult ADHD symptoms | 20–30 min | 18 DSM-5 items, structured evidence. |
| Childhood history | 10–15 min | Concrete pre-age-12 evidence. |
| Functional impairment | 10–15 min | Domains + multiple settings. |
| Differential check | 10–15 min | Confounder flagging. |
| Report | — | Evidence-based, traceable. |

## Evidence model

Every conclusion is traceable back to user-provided evidence. Per criterion:

```json
{
  "criterion": "adult_inattention_01",
  "status": "supported",
  "confidence": "strong",
  "evidence": ["...concrete examples..."],
  "counter_evidence": [],
  "contexts": ["work"],
  "impairment": "moderate"
}
```

Status: `supported` / `partially_supported` / `unsupported` / `uncertain`.

## Safety And Trust Requirements

The product must always be careful with mental-health claims. It must clearly state:

- It is not a medical diagnosis.
- It is not emergency support.
- It does not replace a clinician.
- Results can be incomplete or wrong.
- Similar symptoms can come from other mental-health, sleep, lifestyle, or medical causes.
- A qualified professional is needed for formal diagnosis and treatment decisions.

The product must avoid:

- Saying "you have ADHD".
- Recommending medication.
- Giving treatment instructions.
- Using scary or absolute language.
- Overclaiming accuracy.
- Presenting AI judgment as clinical certainty.

## Product Tone

The product should feel:

- Calm
- Serious but not cold
- Supportive but not flattering
- Clear about uncertainty
- Respectful of the user's lived experience
- More like a structured intake conversation than a quiz or chatbot

The product should not feel:

- Like a diagnosis machine
- Like a generic ChatGPT conversation
- Like a viral personality test
- Like a medical authority pretending to know more than it does

## Implementation order (recommended)

Smallest sensible sequence — no upfront architecture.

**Gate 0 (mandatory before step 2):** Lock `CLINICAL_ADHD_PROTOCOL.md` — the deterministic evidence rules, childhood/onset criteria, impairment/multiple-settings rules, differential red flags, contradictory evidence handling, and final DSM-5 evaluation. Step 2 onward cannot begin until this gate is cleared.

1. Gate 0 — Lock the clinical protocol (`CLINICAL_ADHD_PROTOCOL.md`).
2. Lock the assessment protocol and data model (stages, criteria, evidence schema).
3. Implement Adult ADHD Symptoms interview (18 items).
4. Implement Childhood History.
5. Implement Functional Impairment + Multiple Settings.
6. Implement Focused Differential Check.
7. Implement structured report.
8. Connect the existing ASRS V1 as Stage 1.
9. Run manual/self testing + clinician review before adding anything else.

## Assumptions

- First release is private or self-use first.
- V1 ASRS is the screening foundation; the fast-track assessment is the next stage.
- Technical architecture is intentionally lightweight: a simple state machine and one JSON state document per assessment.
- This PRD is from a product and clinical-assessment perspective; implementation details are intentionally lightweight.
