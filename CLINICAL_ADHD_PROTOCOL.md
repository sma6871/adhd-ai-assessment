# Clinical ADHD Protocol

**Status:** Mandatory gating document for implementation. This protocol must be locked before **M2** (Adult ADHD Symptoms interview) begins. It is ADHD-only and minimal — no other conditions are diagnosed or assessed as primary criteria.

**Purpose:** Define, deterministically and independently of the AI's judgment, exactly what evidence is required per criterion, how follow-up questions are bounded, when a criterion is considered complete, and how the final assessment summary is computed. The AI interviewer only *collects* evidence into this structure; it never overrides these rules.

**Clinical references:** ASRS v1.1 (Stage 1 screening), DSM-5/DSM-5-TR ADHD symptom framework (18 items), DIVA-5 interviewing *principles* (onset, impairment, multiple settings, examples). These are references only; the product does not claim to perform an official DIVA-5 interview and does not reproduce copyrighted instrument text.

**Disclaimer (product-level):** This structured interview supports self-understanding only. It is **not** a medical diagnosis and does **not** replace an evaluation by a qualified clinician.

---

## 0. Overview of evaluation logic

The final assessment is produced **deterministically** from the evidence records. The AI cannot set the final conclusion. The engine computes:

1. **Adult symptom count** — number of DSM-5 criteria rated `supported` or `partially_supported`, split by inattentive and hyperactive/impulsive domains.
2. **Duration/persistence** — whether symptoms have persisted over the **≥6-month** timeframe (DSM-5 duration criterion).
3. **Childhood-onset evidence** — strength rating from concrete pre-age-12 evidence.
4. **Functional impairment** — number of affected life domains and number of settings.
5. **Multiple-settings** — whether symptoms appear in ≥2 settings.
6. **Differential red flags** — confounders that could explain ADHD-like symptoms (used to evaluate the "not better explained" exclusion, §9).
7. **Contradictory evidence** — evidence weakening the ADHD hypothesis.

From these, the engine produces one of three recommendation tiers (see §9). Every tier recommends professional evaluation as an option when concerns exist — none assert a diagnosis.

---

## 1. Criterion catalog (18 DSM-5 items, adult-adapted)

Criterion IDs: `INATT_01..09` (inattentive), `HYPERR_01..09` (hyperactive/impulsive, adult-restated).

### Inattentive domain

| ID | Plain-language question | Core behavior |
| --- | --- | --- |
| INATT_01 | How often do you have trouble keeping track of small details or making careless mistakes on tasks? | Careless mistakes; skips steps; misses small details. |
| INATT_02 | How often do you have difficulty sustaining attention on a task, reading, or lengthy material? | Difficulty staying focused on reading/long tasks; mind goes blank. |
| INATT_03 | How often do you seem to not listen when spoken to directly (as if distracted)? | Zoning out mid-conversation; misunderstanding when spoken to. |
| INATT_04 | How often do you start tasks but fail to finish them, even when you intended to? | Starts but doesn't complete; leaves final steps undone. |
| INATT_05 | How often do you have difficulty getting things in order when a task requires organization? | Disorganized workspace/desks; trouble sequencing steps. |
| INATT_06 | How often do you avoid, feel reluctant, or put off tasks that take a lot of thought? | Delays; thinks about delaying demanding mental work. |
| INATT_07 | How often do you lose things that you need for work or daily activities? | Losing keys/wallet/phone/documents repeatedly. |
| INATT_08 | How often are you easily distracted by unrelated thoughts or stimuli? | Mind wanders to unrelated topics; distracted by sounds/thoughts. |
| INATT_09 | How often do you forget daily responsibilities such as errands, appointments, or returning calls? | Forgetting commitments, deadlines, returning messages. |

### Hyperactive/Impulsive domain (adult-restated)

These nine items map **1:1** to the DSM-5 Hyperactivity/Impulsivity criteria, restated for adults. Each captures a distinct behavior.

| ID | Plain-language question | Core behavior | DSM-5 item |
| --- | --- | --- | --- |
| HYPERR_01 | How often do you fidget, squirm, or feel restless (e.g., can't sit still in meetings)? | Fidgeting, squirming, inner restlessness. | #1 |
| HYPERR_02 | How often do you feel driven to get up or move around when you should be sitting/staying still? | Leaves seat, gets up, driven to move. | #2 |
| HYPERR_03 | How often do you feel "on the go" or as if driven by a motor (racing thoughts, can't slow down)? | On-the-go feeling, racing thoughts, motor-driven. | #3 |
| HYPERR_04 | How often do you find it hard to engage in or enjoy quiet or leisure activities? | Quiet/boring activities feel impossible; must stay active. | #4 |
| HYPERR_05 | How often do you talk excessively or feel the need to fill silence? | Frequent talking; discomfort with quiet. | #5 |
| HYPERR_06 | How often do you blurt out answers or finish others' sentences mid-conversation? | Blurting out, interrupting to speak. | #6 |
| HYPERR_07 | How often do you have trouble waiting your turn or feel impatient in queues/waiting situations? | Impatience, can't wait turn. | #7 |
| HYPERR_08 | How often do you interrupt or intrude into others' conversations or activities? | Interrupts group talks; barges in. | #8 |
| HYPERR_09 | How often do you act or speak on impulse in a way you later regret or others find inappropriate (e.g., starting something without planning, or saying something without filtering first)? | Acts/speaks without forethought or regard for consequences; poor impulse control. Distinct from blurting answers (HYPERR_06) and from interrupting (HYPERR_08). | #9 |

**Note on DSM-5 rewording:** DSM-5 provides adult-restated versions of these items (e.g., "runs/climbs" → "driven to be on the go," "unable to play quietly" → "difficulty engaging in quiet activities"). The questions above use adult-adapted plain language preserving that clinical intent. These are *not* the copyrighted DSM wording; use of exact DSM item text in the product requires licensing verification.

**Item-boundary note (distinct behaviors):**
- HYPERR_06 = *blurting out answers* (verbal filling-in, e.g., finishing sentences with answers).
- HYPERR_07 = *impatience while waiting* (frustration in queues/situations requiring waiting).
- HYPERR_08 = *interrupting/intruding* on others' ongoing activities or conversations.
- HYPERR_09 = *impulsive acts/speech without forethought* (starting without planning, speaking without filtering, regretful consequences).

These four are clinically distinct impulsivity manifestations; the interviewer should keep them separate.

---

## 2. Evidence requirement per criterion (core rule)

For **each** of the 18 criteria, the system must collect:

1. **Core answer** — frequency of the behavior over the past ~6 months (Never / Rarely / Sometimes / Often / Very Often), anchored to the question above.
2. **A concrete real-life example** — *required* when the core answer is `Often` or `Very Often`, or when the behavior would reasonably vary by context. A concrete example names a specific situation, what happened, and (if relevant) when.
3. **Contexts** — where it happens (work, home, social, alone, etc.).
4. **Functional consequence** — what it costs the person.
5. **Counter-evidence** — any reason the behavior is *not* present (context-specific absence, situational only, explained by other factors).
6. **Uncertainty** — recorded explicitly if evidence is insufficient.

The criterion is `complete` only when core + example + contexts + consequence (+ counter-evidence if mentioned) are captured, **or** explicitly marked `uncertain`.

---

## 3. Bounded follow-up strategy (per criterion)

The AI must never ask indefinitely. Strict per-criterion follow-up cap:

1. **Core question.**
2. If vague or no example → ask **one** concrete example request.
3. If the example lacks context/consequence → ask **one** targeted probe ("Where does this tend to happen?" / "What's the impact?").
4. If still ambiguous → ask **one** clarification distinguishing the behavior from similar-but-different ones (e.g., "Is this different from just being bored?").
5. If evidence still insufficient → mark `uncertain`, record the gap, and **move on** to the next criterion.

**Max 3 questions per criterion after the core question.** Total per criterion: at most the core question + 3 follow-ups.

---

## 4. Per-criterion completion rule & rating

A criterion is **complete** when the engine can assign one `status`:

| Status | Rule |
| --- | --- |
| `supported` | Behavior occurs `Often`/`Very Often` in normal-range-or-higher frequency for the person, *and* a concrete example + context/consequence captured. |
| `partially_supported` | Some evidence (e.g., `Sometimes` with a clear example, or `Often` but context-limited), but not clearly above normal variation. |
| `unsupported` | Behavior does not occur, or is situational/ordinary. |
| `uncertain` | Insufficient evidence collected (user couldn't provide a concrete example despite bounded follow-up). |

**Confidence** (`strong`/`moderate`/`weak`) is derived, not chosen by the AI:
- `strong` — concrete example + context + consequence + (if relevant) counter-evidence considered.
- `moderate` — example present but thin, or only one context.
- `weak` — only a frequency answer, no example.

---

## 5. Childhood-onset evidence (Stage 3)

**DSM-5 criterion:** Several symptoms that caused impairment were present before age 12. The assessment does not diagnose; it records whether there is concrete evidence supporting childhood onset.

> This section collects evidence for the DSM-5 onset criterion. The ratings below are **internal evidence-quality heuristics**, not diagnostic thresholds. The actual DSM-5 criterion is simply "evidence of symptoms before age 12" — these ratings only grade *how well-supported* that claim is.

### Onset evidence rating (per the childhood stage, aggregated)

| Rating | Definition |
| --- | --- |
| `strong` | Concrete, specific memories of relevant childhood behaviors (school, homework, organization, attention, impulsivity, hyperactivity) before age 12, ideally recalled from report cards, teacher comments, or parent observations. |
| `moderate` | Concrete memories of 2–4 relevant behaviors before age 12. |
| `weak` | Vague/general childhood memories ("I was always hyper" but no specifics, or only 1 concrete behavior). |
| `insufficient` | No concrete childhood memories; only "I'm not sure." |
| `evidence_against` | Concrete evidence that behaviors were *not* present before age 12 (e.g., was an attentive, organized child). Applies **only** when concrete `against` memories exist and there are **no** concrete supporting memories. |

### Mixed evidence rule (conflicting childhood memories)
When the user reports **both** supporting and `against` childhood behaviors:

- **Supporting concrete memory present + `against` present** → `weak`. The `against` memory is recorded as a contradiction (§8) but does **not** negate the supporting evidence — it lowers confidence.
- **`against` present, no supporting concrete memory** → `evidence_against`. Behaviors were not present before age 12.
- `evidence_against` memories from **external sources** (report card, teacher, parent) carry more weight than memory-only, but the same mixed-evidence rule applies: any supporting concrete memory (even memory-only) prevents a full `evidence_against` rating.

This follows §8: contradictions lower confidence but do not zero it out unless they fully negate the supporting evidence.

### Concrete childhood probes (the adult asks for memories, not assumptions)
- Primary school report cards / teacher comments.
- Homework completion habits.
- Desk/backpack organization.
- Forgetfulness / lost items as a child.
- Sitting still / fidgeting / "can't sit still" as a child.
- Interrupting / blurting out.
- Friendships / peer relations at recess.
- Extracurricular focus.
- Parent/guardian observations recorded.

**Rule:** The engine never infers childhood symptoms from adult symptoms. Each piece of childhood evidence must be recalled/attributed by the user as childhood behavior. **Age boundary:** only memories explicitly attributed to before age 12 qualify as childhood evidence. Memories with an explicit age ≥ 12 are **excluded** entirely (never converted to `null`/unspecified). Memories with no stated age are evaluated in context — they qualify only if the user attributed them to childhood behavior.

---

## 6. Functional impairment & multiple-settings (Stage 4)

**DSM-5 criteria:** (a) Several symptoms present in **two or more** settings; (b) **clear evidence of clinically significant impairment** in social, academic, occupational, or other important areas of functioning.

> The two checks above are **DSM-5 diagnostic criteria** and must not be confused with the internal heuristics listed below. The heuristics only grade *how concretely* the criteria are established, not whether the diagnosis is met.

### Impairment domains (any ≥1 must be concretely evidenced)
Work, education, relationships, household/housework, finances, time management, organization, driving, daily routines, emotional consequences.

### Multiple-settings (DSM-5 criterion)
Symptoms must be evidenced in **≥2 settings** (e.g., work + home, school + social). One isolated setting does not meet the cross-situational criterion.

### Impairment completion (internal evidence heuristics)
The stage is treated as complete when the user has provided:
- At least **2 concrete functional-impairment examples** across life, mapping to specific domains; and
- A statement of symptoms appearing in **≥2 settings** (concretely grounded, not just "yes").

These example-counting rules are **evidence-quality heuristics** for the interview, not DSM-5 thresholds. The DSM-5 criteria themselves are: ≥2 settings, and clinically significant impairment — both must be evidenced concretely, not asserted.

If fewer than 2 settings with concrete grounding are provided → `multiple_settings = false`, recorded explicitly.

---

## 7. Focused differential check (Stage 5)

**Not a diagnosis of these conditions.** A flagging step for factors that could *explain or contribute to* ADHD-like symptoms.

### Red-flag probes (screen for presence of factor + plausibility link)
| Factor | What we probe |
| --- | --- |
| Anxiety | Persistent worry, restlessness, muscle tension, sleep tension, racing thoughts about threats. |
| Depression | Persistent low mood, loss of interest/pleasure, fatigue, sleep/appetite change, worthlessness. |
| Sleep problems | Insomnia, fragmented sleep, sleep apnea signs, non-restorative sleep, irregular schedule. |
| Bipolar-spectrum | Periods of abnormally elevated mood/energy, decreased need for sleep, racing thoughts, impulsivity (vs. baseline). |
| Substance/alcohol | Regular use that could affect attention/regulation. |
| Chronic stress / burnout | Prolonged overwhelm, exhaustion, detachment from work. |
| Medical / physical | Thyroid issues, sleep apnea, chronic pain, medications affecting attention. |

### Flagging rule
A factor is **flagged** (Stage 5, by `flagDifferentials`) when:
- The user reports the factor *and*
- It is plausibly linked to at least one reported ADHD-like symptom ("could plausibly contribute to concentration difficulties") — operationalized as: any Stage 2 core answer endorsed at `Sometimes`/`Often`/`Very Often`.

Flagged factors are surfaced **as considerations only** in the report — never as diagnoses.

### Strong alternative explanation (§9b-F two-tier)
The protocol distinguishes a flagged factor (implicit plausible link) from a **strong alternative explanation** (explicit user-tied link):

- **Flagged (partial):** factor reported + plausibly linked via Stage 2 symptom endorsement. Feeds §9b-F as `partially_supported`.
- **Strong alternative:** factor reported AND the user explicitly tied it to ADHD-like symptoms in Stage 5 (`symptom_mentions` non-empty — e.g., "my anxiety makes it hard to focus"). Flags `F_not_better_explained` as `not_supported`.

The engine applies this distinction via `flagDifferentialEvidence` (M6), which enriches the flagged set with `symptom_mentions`-driven `strong` labels. The LLM interviewer only extracts `reported` + `symptom_mentions`; it never decides strong vs. partial.

---

## 8. Contradictory evidence handling

Contradictory evidence is collected **per criterion** (field: `counter_evidence`) and must be surfaced explicitly.

### What counts
- Behaviors that did **not** occur despite the DSM-5 pattern suggesting they might.
- Situational/contextual limits ("only happens when sleep-deprived," "only at work, never at home").
- Alternative explanations ("this started after a medical change," "this only occurs during high stress").
- Strong childhood evidence against (§5 `evidence_against`).
- Strong multiple-settings evidence against ("symptoms only in one setting").

### Engine handling
- Per criterion: `counter_evidence` array is stored if mentioned.
- Aggregated: a `contradictions` list in the report summarizing factors that weaken the ADHD hypothesis.
- These **lower confidence** in the overall assessment but do not zero it out unless they fully negate the core pattern.

---

## 9. Deterministic final evaluation (engine logic, no AI override)

The engine computes a **structured assessment summary** from stored evidence. **This is not a diagnosis.** The engine never says "you have ADHD." It reports which DSM-5 criteria appear met vs. unmet, based on the evidence — and always recommends professional evaluation as an option.

### 9a. Inputs the engine reads (no AI override)

- `inatt_supported` = count of INATT_01..09 with `status = supported`.
- `hyper_supported` = count of HYPERR_01..09 with `status = supported`.
- `onset` = childhood-onset rating from §5 (`strong`/`moderate`/`weak`/`insufficient`/`evidence_against`).
- `duration` = symptom persistence over the ≥6-month timeframe (`met` / `uncertain` / `not_met`).
- `settings` = number of settings with concrete grounding (Stage 4).
- `domains_impaired` = number of impairment domains with concrete examples.
- `contradictions` = count of aggregated contradictory-evidence items (§8: per-criterion `counter_evidence` entries + childhood `evidence_against`). A count of ≥1 prevents the "Consistent" tier (§9d) and is surfaced in §9f notes.
- `differentials_flagged` = count of flagged factors from §7.

### 9b. DSM-5 criteria checklist (attributed to DSM-5; evaluated as evidence, not a diagnosis)

These are the actual DSM-5 ADHD diagnostic criteria, each evaluated **as evidence-supported / partially-supported / not-supported** — never "diagnosed."

| DSM-5 criterion | How the engine reads it | Evidence source |
| --- | --- | --- |
| **A. Symptom count** — ≥5 symptoms from one domain (or combined) | `inatt_supported ≥ 5` OR `hyper_supported ≥ 5` (or both). | Stage 2 (§2 per-criterion status). |
| **B. Persistence / duration** — several symptoms present for ≥6 months | `duration = met` (persistently over the past ~6 months), based on the core-answer timeframe across Stage 2 items. | Stage 2 core answers (§2). |
| **C. Age of onset** — several symptoms present before age 12 | `onset ∈ {strong, moderate}` (heuristic evidence rating). | Stage 3 (§5). |
| **D. Settings** — symptoms present in ≥2 settings | `settings ≥ 2`. | Stage 4 (§6). |
| **E. Clinically significant impairment** | `domains_impaired ≥ 1` with concrete grounding + user-reported impact. | Stage 4 (§6). |
| **F. Not better explained** — disturbance not due to another condition | **Two-tier, informed by** `differentials_flagged` + `flagDifferentialEvidence`: (1) if a **strong alternative explanation** plausibly accounts for the symptoms (user explicitly tied a flagged factor to ADHD-like symptoms via `symptom_mentions`), this criterion is `not_supported`; (2) otherwise, if any factor is flagged, `partially_supported`; (3) if none flagged, `supported`. | Stage 5 (§7), as input only. |

> Each DSM-5 criterion above is reported as **evidence-supported / partially-supported / not-supported**. The `≥5 symptoms`, `≥2 settings`, `onset`, `duration`, and `not better explained` values are **evidence-quality heuristics** standing in for "clear evidence," not a diagnostic determination. The engine **never** states that the user "has" or "does not have" ADHD.

### 9c. Adult symptom pattern (engine-derived)
- **Inattentive pattern** if `inatt_supported ≥ 5`.
- **Hyperactive/impulsive pattern** if `hyper_supported ≥ 5`.
- **Combined pattern** if both ≥5.
- Otherwise: **below symptomatic threshold**.

### 9d. Evidence-consistency summary (for the report — not a diagnosis)

The engine classifies the evidence profile for the report's "Overall assessment" line. "Broadly consistent" requires **all** of: a symptomatic pattern (≥5 in a domain), `onset ∈ {strong, moderate}`, `settings ≥ 2`, `domains_impaired ≥ 1`, `duration = met`, **and** no strong alternative explanation (i.e., `not better explained` not flagged as `not_supported`), **and** zero contradictions (`contradictions = 0`).

- **Consistent with ADHD presentation** — symptomatic pattern present **and** onset `strong`/`moderate` **and** ≥2 settings **and** ≥1 impaired domain **and** `duration = met` **and** "not better explained" not supported against **and** `contradictions = 0`. *(Strongest evidence profile; not a diagnosis.)*
- **Partially consistent** — symptomatic pattern present but one or more of: onset `weak`/`insufficient`; or `settings < 2`; or `domains_impaired = 0`; or `duration = uncertain`; or "not better explained" flagged against; or **≥1 contradiction** (notable contradictions lower confidence — §8).
- **Insufficient evidence** — no symptomatic pattern; or `evidence_against` on onset; or strong evidence against on multiple settings; or `duration = not_met`. Contradictions alone do not cause Insufficient unless they fully negate the core pattern (no symptomatic pattern + `evidence_against` onset), which is already captured above.

### 9e. Recommendation tiers (product wording — never a diagnosis)

| Tier | Evidence profile | Product output |
| --- | --- | --- |
| **Consistent** | Symptomatic + onset + ≥2 settings. | "Your responses are consistent with how ADHD tends to present, and there is evidence of early onset and cross-setting impact. A professional ADHD evaluation may be worthwhile — especially to explore alternative explanations." |
| **Partially consistent** | Symptomatic but onset/settings/impairment limited or uncertain, or notable contradictions. | "Some of your responses are consistent with ADHD, but supporting evidence (early onset, impact across settings, or impairment) is limited or uncertain. A professional evaluation may still be worthwhile to clarify." |
| **Insufficient** | No symptomatic pattern, or evidence against. | "This assessment does not show a pattern consistent with ADHD. If attention, organization, or energy difficulties still meaningfully affect your life, a professional evaluation may be worthwhile to explore other causes." |

**Always add:** "This is not a medical diagnosis and does not replace an evaluation by a qualified clinician."

### 9f. Differential / "not better explained" / contradictory surface
- **Differential check remains flagging only** (§7): factors that plausibly contribute to ADHD-like symptoms. These are never diagnosed here.
- **Not better explained (two-tier):** if a flagged differential was explicitly tied by the user to ADHD-like symptoms (`symptom_mentions`), the report states it as a strong alternative — "X could also explain your symptoms; discuss this with a clinician when interpreting the assessment" — and §9b-F marks the criterion `not_supported`. If flagged but not user-tied, it is a partial consideration only.
- Contradictions are always listed.
- If ≥1 flagged differential exists, the summary adds: "Some factors you mentioned (e.g., sleep problems) could also explain ADHD-like symptoms; discuss these with a clinician."

---

## 10. What the AI MUST NOT do

- Must not claim "you have ADHD" or "you don't have ADHD."
- Must not assign the final recommendation tier (the engine does).
- Must not invent new DSM criteria, thresholds, or scoring.
- Must not fabricate childhood evidence from adult symptoms.
- Must not ask >3 follow-ups per criterion after the core question.
- Must not diagnose or assess the differential conditions.
- Must not show probability/severity numbers implying clinical precision.
- Must not present the evidence-consistency summary as a diagnosis.
- Must not override the engine's deterministic evaluation.

---

## 11. Definition of "Protocol Locked"

This protocol is **locked** (and the gate before M2 is cleared) when:

1. All 18 criterion IDs and their plain-language questions are finalized and map to **distinct** DSM-5 items (no overlap/duplication across items).
2. The per-criterion evidence requirements (§2), bounded follow-up (§3), and completion/rating rules (§4) are fixed.
3. Childhood-onset ratings (§5) are defined, with the DSM-5 onset criterion separated from internal heuristics.
4. Impairment + multiple-settings rules (§6) are defined, with DSM-5 criteria (≥2 settings, clinically significant impairment) separated from internal heuristics.
5. The DSM-5 **duration/persistence (≥6 months)** criterion is defined and its evidence source is fixed.
6. The DSM-5 **"not better explained by another condition"** exclusion is defined, mapped to the differential flagging (§7) as input only, and clearly distinguished from diagnosing those conditions.
7. Differential red-flag probes + flagging rule (§7) are defined (flagging only, not diagnosis).
8. Contradictory evidence handling (§8) is defined.
9. The deterministic final evaluation (§9) — including the DSM-5 criteria checklist (§9b), the adult symptom pattern (§9c), the evidence-consistency summary (§9d), the recommendation tiers (§9e), and the differential/contradictory surface (§9f) — is fully specified and independently verifiable, and never produces a diagnostic claim.

Once locked, implementation (M2 onward) must conform to this document. Any change requires re-locking this protocol.
