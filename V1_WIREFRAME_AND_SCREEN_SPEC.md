# V1 Wireframe and Screen Specification — ADHD Screening Companion

## Purpose

This document defines the screen flow and visual behaviour for the first mobile prototype. It uses the selected UX Pilot direction: clean, calm, minimal, and focused on one question at a time.

It is a private adult ADHD self-screening flow, not a diagnostic product.

## Product Direction

- Mobile-first canvas: 390 × 844.
- Separate English and Persian experiences.
- English is left-to-right; Persian is right-to-left.
- Use an off-white background, black text, thin light-gray borders, rounded answer rows, and one black primary button.
- The product must feel calm and credible, not clinical, gamified, or like a dashboard.
- Do not show charts, scores, ADHD probability, diagnostic labels, medication advice, account controls, or a chat interface.

## Approved Design References

The following UX Pilot screens are the approved visual source for the first prototype. Preserve their restrained black-and-white style, spacing, rounded controls, and RTL treatment.

- Persian welcome and language selection: https://uxpilot.ai/s/fad9195e1d738841917c2133fd61c837
- Persian how-to-answer screen: https://uxpilot.ai/s/a994cb7e02cd3417945c7a72d26fe72a
- Persian question template: https://uxpilot.ai/s/aa49af45d776c9bfb98e5ab46311691a
- Original English question template: https://uxpilot.ai/s/2543d4c2f63e4dc030dd20320fb55a05
- English screen-positive result: `result-screen.html`
- English screen-negative result: `result-negative.html`
- Persian screen-positive result: `result-screen-fa.html`
- Persian screen-negative result: `result-negative-fa.html`

### Privacy-copy constraint

The welcome screen may say that answers stay on the device only when the implemented version genuinely stores no answers outside the device. Until that is confirmed, use the safer wording: “Private and confidential” / «خصوصی و محرمانه».

## Flow Overview

| Screen | Purpose | Primary action |
| --- | --- | --- |
| Language selection | Choose English or فارسی | Continue |
| Welcome | Explain purpose and boundaries | Start |
| How to answer | Explain six-month timeframe and response scale | Begin questions |
| Questions 1–6 | Complete one ASRS question per screen | Next |
| Screen-positive result | Explain that evaluation may be worthwhile | Finish |
| Screen-negative result | Explain that the screen did not show a strong signal | Finish |

## Shared Layout Rules

- The header includes a mirrored back arrow, title, and six-dot progress indicator.
- For Persian, the back arrow and progress direction are mirrored. Question 1 begins from the right.
- Answer rows are full width, have a rounded thin border, and are easy to tap.
- The selected answer has a black outline, bold text, and a small checkmark.
- The primary button is black with white text. It remains unavailable until the user selects an answer.
- Use “Next” / «ادامه» for Questions 1–5 and “See result” / «مشاهده نتیجه» for Question 6.
- Keep “Screening, not a diagnosis” / «غربالگری است، نه تشخیص» visible on the welcome and result screens.

## Language Selection

**Purpose:** Give the user a clean choice between English and Persian before the screening starts.

**Content:**

- Title: “Choose language” / «انتخاب زبان».
- Two large equal options: English and فارسی.
- Primary action: Continue / ادامه.

**Behaviour:** The user selects one language. The selected choice is visually clear. Future V1 screens remain in that language only.

## Welcome Screen

**Purpose:** Set expectations before the assessment begins.

**Content:**

- Product title: ADHD Self-Screening / خودارزیابی ADHD.
- A short explanation that this is an adult self-screening flow.
- A clear statement that it is not diagnosis, crisis support, or a replacement for a clinician.
- Primary action: Start / شروع.

**Design:** No progress dots on this screen. Keep text short and give the primary action visual priority.

## How to Answer Screen

**Purpose:** Explain the response timeframe without adding friction.

**Content:**

- Answer according to the past six months.
- Choose what is closest to usual experience.
- There is no right or wrong answer.
- Estimated time: around five minutes.
- Primary action: Begin questions / شروع پرسش‌ها.

**Design:** Keep this as a calm transition screen. Use no more than one short explanatory paragraph.

## Question Screens

Each of the six questions follows the same structure.

### Header

- Back arrow returns to the previous screen or previous question.
- Title: ADHD Self-Screening / خودارزیابی ADHD.
- Six-dot progress indicator.

### Context row

- “Question X of 6” / «سؤال X از ۶».
- “Help & Example” / «راهنما و مثال» control.

### Question and explanation

- Present the relevant ASRS question from `V1_QUESTION_AND_RESULT_SCRIPT.md`.
- Below it, show a single plain-language explanatory sentence.
- The help control reveals an example without changing the scoring or suggesting an answer.

### Answer selection

- Never / هرگز
- Rarely / به‌ندرت
- Sometimes / گاهی اوقات
- Often / اغلب
- Very Often / بسیار زیاد

### Navigation

- Before selection: primary action is unavailable.
- After selection: primary action is enabled.
- On Question 6, the action moves to the appropriate result screen.

## Result Screens

### Screen-Positive

**Title:** Further evaluation may be worth considering / بررسی تخصصی ممکن است ارزشمند باشد

**Content:**

- Explain that four or more answers fell within the ASRS screening range.
- State clearly that this is not a diagnosis.
- Encourage professional discussion if the difficulties affect daily life.
- Explain that similar difficulties can also have other causes.

**Actions:** Finish / پایان; optional secondary action: Start again / شروع دوباره.

The approved screen uses exactly the same visual structure as the screen-negative result. It changes only the heading and explanatory copy.

### Screen-Negative

**Title:** This brief screen did not show a strong ADHD signal / این غربالگری کوتاه نشانه قوی از ADHD نشان نداد

**Content:**

- Explain that fewer than four answers fell within the ASRS screening range.
- State clearly that this does not rule out ADHD and is not a diagnosis.
- Encourage professional discussion if difficulties significantly affect daily life.

**Actions:** Finish / پایان; optional secondary action: Start again / شروع دوباره.

The result-page browser titles should use the product name or a neutral title such as “ADHD Self-Screening — Screening Result”; do not retain the temporary “MindMirror” title.

## Acceptance Checks

The wireframe is ready for prototype implementation when:

- It can be completed in five to ten minutes.
- English and Persian are genuine LTR/RTL counterparts rather than the same layout with translated strings.
- Every interactive element has an obvious purpose and a comfortable tap target.
- A selected answer, progress state, back action, and next action are always clear.
- The experience never claims a diagnosis, probability, severity rating, treatment plan, or medication recommendation.
- The only decision the user is asked to make after a result is whether professional evaluation may be worth considering.
