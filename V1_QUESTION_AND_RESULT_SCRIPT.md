# V1 Question and Result Script — ADHD Screening Companion

## Purpose

This document defines the user-facing wording for the first version of the ADHD screening flow: the welcome, instructions, six screening questions, answer options, results, and safety boundaries.

V1 is a private self-screening tool for adults. It helps a person decide whether seeking a professional ADHD evaluation may be worthwhile. It does not diagnose ADHD, rule it out, recommend treatment, or replace a clinician.

## Product Decisions

- Audience: adults aged 18 and over; private self-use initially.
- Duration: five to ten minutes.
- Screening foundation: the official six-question Adult ADHD Self-Report Scale, Version 1.1 (ASRS v1.1) Screener.
- Languages: separate English and Persian flows, not two languages on the same question screen.
- English is the canonical instrument wording.
- Persian is a working translation for this private prototype. It must not be described as a validated Persian ASRS version until it has been sourced or reviewed by a qualified bilingual mental-health professional.
- Result: screen-positive or screen-negative only. Do not show probability, severity, confidence, or a diagnosis.

## Language Selection

**Title**

Choose language / انتخاب زبان

**Options**

- English
- فارسی

The selected language controls the entire questionnaire layout, including text direction. English is left-to-right; Persian is right-to-left.

## Welcome

### English

**Title:** ADHD Self-Screening

This is a short self-screening check-in for adults aged 18 and over.

It uses the Adult ADHD Self-Report Scale (ASRS v1.1) Screener. It can help you decide whether a professional ADHD evaluation may be worth considering.

It cannot diagnose ADHD, rule it out, replace a clinician, or explain every reason someone may struggle with focus, organisation, restlessness, or procrastination.

**Primary action:** Start

### Persian

**Title:** خودارزیابی ADHD

این یک غربالگری کوتاه برای بزرگسالان ۱۸ سال به بالا است.

این ابزار از پرسشنامه غربالگری ASRS v1.1 استفاده می‌کند و می‌تواند کمک کند تصمیم بگیرید که آیا بررسی تخصصی ADHD ارزش پیگیری دارد یا نه.

این ابزار تشخیص ADHD نمی‌دهد، آن را رد نمی‌کند، جای متخصص را نمی‌گیرد و همه علت‌های احتمالی مشکلات تمرکز، نظم، بی‌قراری یا اهمال‌کاری را توضیح نمی‌دهد.

**Primary action:** شروع

### Safety note

Show this discreetly on both language versions:

If you are in immediate danger or thinking about harming yourself, contact local emergency services or a crisis-support service now. This screening is not crisis support.

اگر در خطر فوری هستید یا به آسیب رساندن به خود فکر می‌کنید، همین حالا با اورژانس محلی یا خدمات حمایت در بحران تماس بگیرید. این ابزار برای کمک در بحران نیست.

## How to Answer

### English

**Title:** How to answer

Please answer based on how you have felt and behaved over the past six months. Choose the answer closest to your usual experience. There is no right or wrong answer.

**Primary action:** Begin questions

### Persian

**Title:** نحوه پاسخ‌دادن

لطفاً هر سؤال را بر اساس احساس و رفتار خود در شش ماه گذشته پاسخ دهید. گزینه‌ای را انتخاب کنید که به تجربه معمول شما نزدیک‌تر است. پاسخ درست یا غلطی وجود ندارد.

**Primary action:** شروع پرسش‌ها

## Answer Options

Use these five options for every question.

| English | Persian |
| --- | --- |
| Never | هرگز |
| Rarely | به‌ندرت |
| Sometimes | گاهی اوقات |
| Often | اغلب |
| Very Often | بسیار زیاد |

## Six Screening Questions

Display only the applicable language version in the user interface. The English question wording below is the canonical ASRS v1.1 text. The Persian wording is a working translation for the private prototype.

| # | English ASRS v1.1 question | Persian working translation |
| --- | --- | --- |
| 1 | How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done? | بعد از انجام بخش دشوار یک کار، چند وقت یک‌بار در تمام کردن جزئیات نهایی آن مشکل داری؟ |
| 2 | How often do you have difficulty getting things in order when you have to do a task that requires organisation? | چند وقت یک‌بار در مرتب و سازمان‌دهی کردن کارهایی که نیاز به نظم دارند مشکل داری؟ |
| 3 | How often do you have problems remembering appointments or obligations? | چند وقت یک‌بار قرارها یا تعهداتت را فراموش می‌کنی؟ |
| 4 | When you have a task that requires a lot of thought, how often do you avoid or delay getting started? | وقتی کاری به فکر زیادی نیاز دارد، چند وقت یک‌بار شروع آن را به تعویق می‌اندازی یا از شروع کردنش اجتناب می‌کنی؟ |
| 5 | How often do you fidget or squirm with your hands or feet when you have to sit down for a long time? | وقتی لازم است مدت طولانی بنشینی، چند وقت یک‌بار دست‌وپاهایت بی‌قرار می‌شوند یا وول می‌خوری؟ |
| 6 | How often do you feel overly active and compelled to do things, like you were driven by a motor? | چند وقت یک‌بار احساس می‌کنی بیش از حد فعال هستی و انگار موتوری تو را به حرکت وادار می‌کند؟ |

## Help and Example

Each question includes a compact “Help & Example” / «راهنما و مثال» control. It gives a short plain-language explanation only; it must not lead the user toward a particular answer.

Example for Question 1:

- English: “This refers to when the difficult parts are done and only minor tasks remain.”
- Persian: «منظور زمانی است که بخش‌های دشوار کار تمام شده و فقط کارهای جزئی باقی مانده است.»

## Official Scoring Rule

- Questions 1–3 count as a positive screen response when answered Sometimes, Often, or Very Often.
- Questions 4–6 count as a positive screen response when answered Often or Very Often.
- Four or more positive screen responses produces a screen-positive result.
- Fewer than four positive screen responses produces a screen-negative result.

Do not display the number of positive responses to the user.

## Result: Screen-Positive

### English

**Title:** Further evaluation may be worth considering

Four or more responses fell within the ASRS screening range. This does not mean that you have ADHD. It means your answers are consistent enough with common adult ADHD symptoms that a qualified professional evaluation may be useful—especially if these difficulties affect your work, study, relationships, daily responsibilities, finances, driving, or wellbeing.

Other factors, including anxiety, depression, sleep problems, stress, substance use, and physical health conditions, can cause similar difficulties. A clinician can consider the full picture.

**Primary action:** Finish

### Persian

**Title:** بررسی تخصصی ممکن است ارزشمند باشد

چهار یا بیشتر از پاسخ‌های شما در محدوده غربالگری ASRS قرار گرفتند. این به این معنا نیست که حتماً ADHD دارید. اما پاسخ‌ها به اندازه‌ای با الگوهای رایج ADHD در بزرگسالان هم‌خوانی دارند که بررسی توسط متخصص می‌تواند مفید باشد—به‌خصوص اگر این مشکلات بر کار، تحصیل، روابط، مسئولیت‌های روزمره، امور مالی، رانندگی یا حال عمومی شما اثر می‌گذارند.

عوامل دیگری مانند اضطراب، افسردگی، مشکلات خواب، استرس، مصرف مواد یا برخی مشکلات جسمی نیز می‌توانند علائم مشابه ایجاد کنند. متخصص می‌تواند همه این عوامل را کنار هم بررسی کند.

**Primary action:** پایان

## Result: Screen-Negative

### English

**Title:** This brief screen did not show a strong ADHD signal

Fewer than four responses fell within the ASRS screening range. This result does not rule out ADHD and is not a diagnosis. If concentration, organisation, restlessness, procrastination, or related difficulties are significantly affecting your life, speaking with a qualified professional can still be worthwhile.

**Primary action:** Finish

### Persian

**Title:** این غربالگری کوتاه نشانه قوی از ADHD نشان نداد

کمتر از چهار پاسخ شما در محدوده غربالگری ASRS قرار گرفتند. این نتیجه ADHD را رد نمی‌کند و تشخیص پزشکی نیست. اگر مشکلات تمرکز، نظم، بی‌قراری، اهمال‌کاری یا مسائل مرتبط تأثیر قابل توجهی بر زندگی شما دارند، صحبت با یک متخصص همچنان می‌تواند مفید باشد.

**Primary action:** پایان

## Attribution and Review Requirement

Include the official ASRS v1.1 copyright notice and citation wherever the instrument is used. The official Harvard guidance states that use of the six-question screener is free and does not require formal permission or approval, provided the copyright notice and requested citation are included.

- Instrument: Adult Self-Report Scale-V1.1 (ASRS-V1.1) Screener © World Health Organization.
- Official source: https://www.hcp.med.harvard.edu/ncs/asrs_2025.php
- Required citation: Kessler RC, Adler L, Ames M, et al. The World Health Organization Adult ADHD Self-Report Scale (ASRS): a short screening scale for use in the general population. *Psychological Medicine*. 2005;35:245–256.

Before any public use, have the Persian translation reviewed by a qualified bilingual mental-health professional or replace it with a verified validated translation.
