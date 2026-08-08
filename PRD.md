# PRD: AI-Assisted ADHD Screening Companion

## Summary

Create a non-diagnostic self-assessment product that helps adults understand whether their attention, organization, impulsivity, restlessness, or daily-functioning struggles may be worth discussing with a qualified clinician.

The product should feel like a structured clinical conversation, not a generic chatbot and not a casual internet quiz. It should guide the user through evidence-based ADHD screening and, over time, broader neurodivergence and mental-health screening.

The first release must stay intentionally small so it can be finished.

## Product Promise

The product helps users answer one question:

“Is there enough evidence that I should seriously consider a professional ADHD evaluation?”

The product must not answer:

“Do I officially have ADHD?”

The output should help the user understand their own pattern, notice uncertainty, and prepare for a possible appointment with a psychiatrist, psychologist, therapist, or other qualified clinician.

## Clinical Foundations

The product should be grounded in recognized ADHD assessment concepts, including:

- `ASRS` for initial adult ADHD screening
- `DSM-5 / DSM-5-TR` ADHD criteria as the main clinical framework for ADHD symptom areas
- `DIVA-5-style` structured interview principles for deeper ADHD assessment
- Functional impairment assessment across real life domains
- Differential screening for common ADHD lookalikes and comorbidities

Clinical use requirements:

- ASRS-style screening must preserve scoring meaning and should not casually rewrite validated question logic.
- DIVA-5 should be treated as a clinical reference and inspiration, not copied or branded as “official DIVA-5” unless licensing and permission are confirmed.
- DSM-5/DSM-5-TR criteria should guide symptom mapping, but the product should explain results in plain language.
- Any public or commercial version must verify permissions for copyrighted or licensed instruments before including exact wording, scoring, translations, or branding.

## Phase 1: Simple ADHD Screening

Goal: ship a very small, useful first version.

The first release should include:

- Adult ADHD quick screening based on ASRS-style logic
- A short context section about age, current life situation, and main difficulties
- A result such as low, moderate, or high indication for further ADHD evaluation
- A plain-language explanation of what drove the result
- Clear disclaimers that this is screening, not diagnosis

This phase should avoid deeper clinical interview complexity. It should be easy to complete in under 10 minutes.

Success criteria:

- User can finish without feeling overwhelmed.
- User understands whether further ADHD evaluation may be worth considering.
- User does not leave thinking they received a diagnosis.

## Phase 2: Deeper ADHD Assessment

Goal: move from quick screening toward a clinician-useful intake report.

This phase should add:

- Current adult ADHD symptoms mapped to DSM-5/DSM-5-TR symptom areas
- Childhood symptom history, especially before age 12
- Evidence across multiple settings, such as home, school, university, work, and relationships
- Functional impairment across work, study, relationships, finances, time management, household tasks, and emotional consequences
- Follow-up questions that ask for concrete examples, not only ratings

The final report should become useful as preparation for a clinical appointment.

## Phase 3: Differential Screening

Goal: reduce false confidence by checking common ADHD lookalikes and co-occurring issues.

Add screening for:

- Anxiety
- Depression
- Sleep problems
- Substance or alcohol use
- Chronic stress and burnout
- Basic lifestyle and medical factors that may affect attention and energy

The product should not diagnose these conditions. It should explain when another explanation may also be worth exploring.

## Phase 4: Neurodivergence Expansion

Goal: expand beyond ADHD into related neurodivergence screening.

Add autism/ASD screening after ADHD is working well.

Later candidates:

- Dyslexia
- Dyscalculia
- Dysgraphia
- Tics or Tourette-related screening
- Sensory sensitivity patterns

This phase should help users understand whether ADHD alone explains their experience or whether a broader neurodivergence profile may be worth exploring.

## Phase 5: Broader Assessment Platform

Goal: only after earlier phases prove useful, evolve into a broader structured assessment platform.

The long-term idea is a product that can run multiple structured screening flows consistently. This may eventually resemble a workflow engine, but that must not be a first-release requirement.

The workflow-engine idea belongs in the long-term vision, not the first build.

## Report Requirements

Every final report should include:

- Overall screening result
- Main evidence supporting the result
- Main evidence against or weakening the result
- Areas of uncertainty
- Whether professional evaluation is recommended
- A short clinician-friendly summary
- A reminder that this is not a diagnosis

For deeper phases, the report should also include:

- Adult ADHD symptom pattern
- Childhood evidence
- Functional impairment evidence
- Differential-screening notes
- Possible ADHD presentation: inattentive, hyperactive/impulsive, or combined, only as a non-diagnostic indication

## Safety And Trust Requirements

The product must always be careful with mental-health claims.

It must clearly state:

- It is not a medical diagnosis.
- It is not emergency support.
- It does not replace a clinician.
- Results can be incomplete or wrong.
- Similar symptoms can come from other mental-health, sleep, lifestyle, or medical causes.
- A qualified professional is needed for formal diagnosis and treatment decisions.

The product must avoid:

- Saying “you have ADHD”
- Recommending medication
- Giving treatment instructions
- Using scary or absolute language
- Overclaiming accuracy
- Presenting AI judgment as clinical certainty

## Product Tone

The product should feel:

- Calm
- Serious but not cold
- Supportive but not flattering
- Clear about uncertainty
- Respectful of the user’s lived experience
- More like a structured intake conversation than a quiz

The product should not feel:

- Like a diagnosis machine
- Like a generic ChatGPT conversation
- Like a viral personality test
- Like a medical authority pretending to know more than it does

## Explicitly Not In Scope For V1

The first release should not include:

- Full DIVA-style interview
- Autism/ASD screening
- Anxiety/depression/sleep modules
- Clinician dashboard
- Multi-user accounts
- Formal diagnostic claims
- Treatment planning
- Medication recommendations
- Full workflow-engine platform

These are later-phase ideas.

## Assumptions

- First release is private or self-use first.
- V1 is ADHD-only and intentionally small.
- “Atheism tests” was interpreted as autism/ASD tests.
- The document is a PRD from a product and clinical-assessment perspective.
- Technical architecture, database design, AI model structure, and implementation details are intentionally excluded.
