# V1 Product Spec — ADHD Screening Companion

## Purpose

Create a private, self-use tool that helps an adult answer one practical question:

> “Based on a short, structured ADHD screening, would it make sense for me to seek a professional ADHD evaluation?”

It is a screening and reflection tool—not a diagnostic, treatment, or medication service.

## V1 Definition

**Audience:** You, initially.  
**Time required:** 5–10 minutes.  
**Outcome:** A clear next-step recommendation with a calm explanation.

The V1 should feel more focused and trustworthy than a generic AI chat, while remaining simple enough to finish quickly.

## User Journey

1. **Welcome and boundaries**
   - Explain what the tool can and cannot do.
   - State clearly that it does not diagnose ADHD or replace a clinician.
   - Include a brief urgent-support message for someone in immediate danger.

2. **Adult ADHD screening**
   - Present a short, validated adult ADHD screening flow based on the ASRS framework.
   - Ask questions in clear, plain language.
   - Let the user answer quickly without needing to write long explanations.

3. **Optional short context**
   - Ask only a few follow-up questions when useful, such as whether these difficulties meaningfully affect work, study, relationships, daily responsibilities, or time management.
   - Do not attempt a full childhood-history interview, DSM criterion assessment, or differential diagnosis in V1.

4. **Result**
   - Give one of three plain-language outcomes:
     - **Lower indication:** This brief screening does not show a strong indication for further ADHD evaluation at this time.
     - **Some indication:** Some responses may be worth discussing with a qualified professional, especially if they affect daily life.
     - **Stronger indication:** The responses suggest that a professional ADHD evaluation could be worthwhile.
   - Explain the result using the user’s answered patterns, without claiming certainty.
   - Offer a simple next step: save the result for personal reflection or consider discussing it with a qualified clinician.

## Clinical Foundation and Boundaries

- Use the **Adult ADHD Self-Report Scale (ASRS)** as the screening foundation.
- The broader product roadmap may later use:
  - **DSM-5 / DSM-5-TR** as the clinical framework for symptom and impairment mapping.
  - A **DIVA-5-informed** deeper interview approach, subject to proper permission and clinical review.
- V1 must not present itself as DIVA-5, replicate licensed material without permission, or claim that it has completed a clinical diagnostic assessment.
- Preserve the meaning of validated screening questions and scoring; any adapted wording must be clinically reviewed before public use.
- Avoid statements such as “You have ADHD,” “You do not have ADHD,” or recommendations about medication or treatment.

## Product Principles

- **Fast before comprehensive:** Finish one useful flow before adding more tests.
- **Structured before conversational:** The experience follows a defined screening journey; it is not an open-ended chatbot.
- **Clear before clever:** Use calm, direct language and explain uncertainty.
- **Private by default:** Treat responses as sensitive personal information.
- **Evidence-based without pretending to be clinical care:** Refer people to professionals when screening indicates it may help.

## Explicitly Out of Scope for V1

- Formal diagnosis or diagnostic claims
- Full DSM-5 assessment
- DIVA-5-style childhood interview
- Autism/ASD, anxiety, depression, OCD, bipolar, sleep, substance-use, or learning-difference screenings
- Clinician dashboards, accounts, sharing, payments, or public launch requirements
- A general workflow engine or multi-condition platform
- Medication, treatment, or crisis counselling

## Success Criteria

V1 is successful when you can complete it yourself in under 10 minutes and it:

- feels easy to understand and emotionally safe;
- gives a result that is neither vague nor overconfident;
- clearly distinguishes screening from diagnosis;
- makes the next step obvious;
- is useful enough that you would use it again or show it to one trusted tester.

## Relationship to the fast-track plan

**V1 = the ASRS screening foundation.** This screener is preserved verbatim and reused as **Stage 1** of the larger Structured ADHD Assessment Companion.

- A screen-negative result is a valid endpoint; the user is not forced to continue.
- A screen-positive result offers to continue into the deeper, evidence-based assessment.
- The next product step is `FAST_TRACK_ADHD_ASSESSMENT_PLAN.md`: a five-stage structured ADHD assessment (adult symptoms → childhood history → functional impairment → focused differential check → evidence-based report), ADHD-only, ~50–75 minutes. It is intentionally **not** a general assessment platform or workflow engine.

## Next Product Step After This Spec

1. Use `V1 product spec.md` + `V1 product spec.md` to lock the ASRS wording/scoring. *(Done — see `index.html` and `V1_QUESTION_AND_RESULT_SCRIPT.md`.)*
2. Validate V1 with a tiny 3-person usability test (the V1 gate).
3. Then proceed to `FAST_TRACK_ADHD_ASSESSMENT_PLAN.md` Stage 2–5 + report.

That next step is a structured ADHD assessment — not a workflow engine, full platform architecture, or an open-ended clinical interview.
