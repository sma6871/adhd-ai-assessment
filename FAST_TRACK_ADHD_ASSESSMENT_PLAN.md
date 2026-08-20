# Fast-Track ADHD Assessment Plan

**Status:** Authoritative implementation plan (next phase after V1).
**Product:** ADHD Screening Companion — structured ADHD assessment companion.

**Source of truth chain:** this doc → `V1 product spec.md` (V1) → `V1_QUESTION_AND_RESULT_SCRIPT.md` (ASRS wording) → `index.html` (current prototype).

---

## 1. Product objective

Build the simplest possible **structured ADHD assessment** that can achieve high-quality, evidence-based results — not the most powerful, not the most feature-rich.

**Optimization target:** clinical structure, evidence quality, consistency, and a manageable implementation.

Outcome: a user can run a careful, evidence-based ADHD assessment and receive a structured, traceable report that helps them decide whether a professional ADHD evaluation may be worthwhile — without claiming to diagnose.

---

## 2. Why the fast-track approach exists

The previous long-term vision drifted toward a general assessment platform / workflow engine. That scope is **deferred**.

The clinical reality is: ADHD assessment is specific, structured, and evidence-heavy. A tight, ADHD-focused assessment that follows evidence-based frameworks (ASRS → DSM-5 → DIVA-5 principles) is more valuable and far safer than a broad, loosely-structured "mental health platform."

This plan intentionally constrains scope to ADHD alone, for now.

---

## 3. Scope

**In scope:**
- ASRS initial screening (existing V1 — reused verbatim).
- Adult ADHD symptoms (DSM-5/DSM-5-TR, all 18 items, structured evidence collection).
- Childhood history (pre-age-12 evidence, concrete memories).
- Functional impairment + multiple settings (concrete examples).
- Focused differential check (anxiety, depression, sleep, bipolar-spectrum, substance use, chronic stress, relevant medical factors).
- Structured, evidence-based final report.

**Out of scope (deferred):**
- Autism/ASD screening.
- Full anxiety/depression diagnostic modules.
- OCD / broad neurodivergence platform.
- Clinician dashboard, accounts, payments, multi-user infrastructure.
- General workflow engine or platform architecture.
- Treatment / medication recommendations.
- Diagnostic claims.

---

## 4. Five-stage assessment flow

```
Stage 1: ASRS Screener          (3–5 min)    — existing, reused
        ↓
Stage 2: Adult ADHD Symptoms     (20–30 min)  — 18 DSM-5 items, structured
        ↓
Stage 3: Childhood History       (10–15 min)  — pre-age-12 evidence
        ↓
Stage 4: Functional Impairment   (10–15 min)  — domains + multiple settings
        ↓
Stage 5: Focused Differential   (10–15 min)  — confounder screening
        ↓
Final:   Structured Report
```

**Target total interaction time:** ~50–75 minutes.

Stage 1 is the existing V1. A screen-negative result is a valid endpoint; the user is not forced to continue. A screen-positive result offers to continue into the structured assessment.

---

## 5. Approximate timing

| Stage | Duration | Purpose |
| --- | --- | --- |
| Stage 1 — ASRS | 3–5 min | Initial screen; gate to deeper assessment |
| Stage 2 — Adult symptoms | 20–30 min | 18 DSM-5 items, evidence per item |
| Stage 3 — Childhood history | 10–15 min | Pre-age-12 concrete evidence |
| Stage 4 — Functional impairment | 10–15 min | Impairment + multiple settings |
| Stage 5 — Differential check | 10–15 min | Confounder flagging |
| Report | — | Evidence-based structured summary |

---

## 6. Clinical foundations

- **ASRS v1.1** — initial screening (existing V1). Preserve official wording and scoring.
- **DSM-5 / DSM-5-TR** — 18 ADHD symptom items (9 inattentive, 9 hyperactive/impulsive) as the framework for Stage 2.
- **DIVA-5** — principles for structured interviewing, childhood history, and functional impairment (reference only; not reproduced; not branded as official DIVA-5).

**Before any public/commercial use:** verify instrument licensing, copyright, and translation/clinical-review requirements for ASRS and any DSM-derived items.

---

## 7. Evidence model

The central data structure is **evidence**, not chat history. Every conclusion must be traceable back to user-provided evidence.

Core unit (one per criterion):

```json
{
  "criterion": "adult_inattention_01",
  "status": "supported",            // supported | partially_supported | unsupported | uncertain
  "confidence": "strong",           // strong | moderate | weak
  "evidence": [
    "Frequently leaves final details unfinished after completing the difficult part.",
    "Provided examples from work and personal projects."
  ],
  "counter_evidence": [],
  "contexts": ["work", "personal"],
  "impairment": "moderate",         // none | mild | moderate | severe
  "source": "interview"             // interview | self_report | example
}
```

Status values:
- `supported` — clear evidence of the symptom.
- `partially_supported` — some evidence, but incomplete or ambiguous.
- `unsupported` — evidence indicates the symptom does not occur.
- `uncertain` — insufficient evidence to decide; explicitly recorded (not silently defaulted).

---

## 8. AI interviewer responsibilities

The AI is an **interviewer**, not the diagnostic engine.

The interviewer LLM is responsible for:
- Natural, conversational questioning of the current criterion.
- Understanding free-text answers.
- Asking bounded, purposeful follow-ups.
- Extracting structured evidence from the user's answers.
- Detecting when the criterion has enough evidence (or is explicitly uncertain) and moving on.
- Never inventing diagnostic criteria, scoring rules, or conclusions.

The interviewer must **not**:
- Decide the overall assessment protocol.
- Modify scoring logic.
- Diagnose, treat, or recommend medication.
- Keep asking indefinitely for a single criterion.

---

## 9. Deterministic assessment engine responsibilities

The structured assessment engine is responsible for:
- Tracking the current stage and criterion.
- Defining which criterion is being assessed and what evidence is required.
- Enforcing completion conditions per stage/criterion.
- Persisting structured state as JSON (per-criterion evidence records).
- Progression to the next stage once completion conditions are met.
- Producing the report data structure.

The engine logic is structured and deterministic. The AI fills evidence slots; the engine applies the rules.

---

## 10. State model

A simple state machine — **no general workflow engine**:

```
ONBOARDING
→ SCREENING          (Stage 1: ASRS)
→ ADULT_SYMPTOMS     (Stage 2: 18 DSM-5 items)
→ CHILDHOOD          (Stage 3)
→ IMPAIRMENT         (Stage 4: domains + settings)
→ DIFFERENTIAL       (Stage 5)
→ REPORT
```

Each stage has:
- Defined inputs (prior stage outputs).
- Defined questions / criteria.
- Defined evidence requirements (per §7).
- Defined completion conditions.
- Defined outputs (evidence records + next stage trigger).

State persisted as a single JSON document per assessment.

---

## 11. Follow-up question strategy

The AI must not ask endless questions. Bounded strategy per criterion:

1. Ask the core question for the criterion.
2. If the answer is sufficiently specific → accept and continue.
3. If vague → ask for **one** concrete example.
4. If still ambiguous → ask **one** targeted clarification.
5. If evidence remains insufficient → mark `uncertain` and continue to the next criterion.

Goal: high information quality, not maximum conversation length. Move on once evidence is adequate or explicitly uncertain.

---

## 12. Childhood assessment

Objective: determine whether relevant symptoms were present before age 12, via concrete memories — not by assuming current symptoms were also childhood symptoms.

Collect evidence from:
- school performance / reports
- homework habits
- organization (desk, backpack, room)
- forgetfulness / lost items
- attention span (listening, sustained focus)
- impulsivity (interrupting, blurting out)
- restlessness / hyperactivity
- teacher / parent observations
- friendships / peer relations
- extracurriculars

Record explicitly:
- `strong evidence`
- `moderate evidence`
- `weak evidence`
- `uncertain / insufficient evidence`
- `evidence against`

Never fabricate childhood evidence from current symptoms.

---

## 13. Functional impairment

Assess whether symptoms cause meaningful impairment. Cover:
- work
- education
- relationships
- household responsibilities
- finances
- time management
- organization
- driving
- daily routines
- emotional consequences

Determine whether difficulties occur across **multiple settings**, not exclusively one environment.

Require concrete examples. A symptom without meaningful impairment should not be treated as strong evidence for the assessment.

---

## 14. Differential check

A **focused screening / flagging step**, not diagnosis.

Check (at minimum):
- anxiety
- depression
- sleep problems
- bipolar-spectrum symptoms
- substance / alcohol use
- chronic stress / burnout
- relevant physical/medical factors (e.g., thyroid, sleep apnea, medications)

Output format per flagged factor:

```text
Potential confounder identified: Sleep problems
Relevance: Could plausibly contribute to reported concentration difficulties.
Recommendation: Discuss this factor with a clinician when interpreting the ADHD assessment.
```

Do not create full diagnostic modules for these conditions.

---

## 15. Report design

The report must NOT simply say "you have ADHD."

### Overall assessment
- Whether collected evidence is broadly consistent with ADHD.
- Whether evidence is insufficient.
- Whether professional assessment would be reasonable.

### Adult symptoms
Per DSM item: `supported` / `partially_supported` / `unsupported` / `uncertain`, with the strongest evidence attached.

### Childhood evidence
- Evidence supporting childhood onset.
- Evidence against.
- Uncertainty.

### Functional impairment
- Affected domains.
- Severity of real-world consequences.
- Settings affected.

### Differential considerations
List relevant factors that could explain or contribute to symptoms.

### Contradictory evidence
Surface evidence that weakens the ADHD hypothesis explicitly.

### Uncertainty
Explain what the system could not establish.

### Clinician-friendly summary
A concise summary the user could take to a professional appointment.

**Always include:** "This is not a medical diagnosis and does not replace an evaluation by a qualified clinician."

---

## 16. Safety boundaries

- Never diagnose ADHD or any other condition.
- Never recommend medication or treatment.
- Never show probability scores that imply clinical precision.
- Always distinguish screening, structured assessment, and formal clinical diagnosis.
- Always state results are not certain and the user can be wrong.
- Include urgent-support / crisis-language where appropriate (carry forward from V1 safety note).
- A screen-negative ASRS result is a valid endpoint; do not coerce users into continuing.

---

## 17. Licensing / permission considerations

- ASRS v1.1: use the validated instrument and official scoring; preserve the copyright notice and citation. Free for use with attribution.
- DSM-5/DSM-5-TR: reference the framework; do not reproduce copyrighted item text verbatim where avoidable; do not claim official endorsement.
- DIVA-5: reference principles only; do not brand as official DIVA-5; do not reproduce without licensing confirmation.
- Persian (and any) translations: obtain a reviewed/validated translation before describing any language version as validated.

**Before public/commercial use:** verify all instrument licensing, copyright, translation, and clinical-review requirements.

---

## 18. Implementation order

Smallest sensible sequence — do not implement all architecture upfront.

| Milestone | Goal |
| --- | --- |
| Gate 0 | Clinical Protocol Review (lock `CLINICAL_ADHD_PROTOCOL.md`). **Mandatory before M2.** |
| M1 | Lock the assessment protocol and data model (stages, criteria, evidence schema) — see Gate 0. |
| M2 | Implement Adult ADHD Symptoms interview (Stage 2 only, 18 items). |
| M3 | Implement Childhood History (Stage 3). |
| M4 | Implement Functional Impairment + Multiple Settings (Stage 4). |
| M5 | Implement Focused Differential Check (Stage 5). |
| M6 | Implement structured report generation. |
| M7 | Connect existing ASRS V1 as Stage 1 entry point. |
| M8 | Run manual/self testing + clinician review before adding anything else. |

**Mandatory gate:** M2 (and all later milestones) **must not** begin until `CLINICAL_ADHD_PROTOCOL.md` is locked (Gate 0). M1 itself is incomplete without Gate 0. Do **not** start M6 before M2–M5 exist; do **not** start public work before M8.

---

## 19. What is explicitly deferred

- Autism/ASD screening.
- Full anxiety/depression assessments.
- OCD / broad neurodivergence platform.
- Clinician dashboard, accounts, payments, multi-user infrastructure.
- General workflow engine / platform architecture.
- Treatment / medication recommendations.
- Diagnostic claims.
- Any work beyond the five-stage ADHD assessment + report.

---

## 20. Definition of done

The fast-track ADHD assessment is complete when a user can:

1. Complete the ASRS screener.
2. Continue into a structured adult ADHD interview.
3. Provide concrete evidence for relevant symptoms.
4. Discuss childhood history.
5. Establish functional impairment and multiple settings.
6. Complete the focused differential check.
7. Receive a structured evidence-based report.
8. See supporting evidence, counter-evidence, and uncertainty.
9. Receive a clear recommendation about whether professional evaluation may be worthwhile.
10. Understand that the result is **not a diagnosis**.

**System requirement:** the system must be able to explain **why** it reached its assessment summary, traceable back to the user's own evidence.
