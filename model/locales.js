'use strict';

// Localized presentation text for the deterministic assessment interview engine.
//
// Clinical logic (scoring, completion rules, evidence requirements, DSM-5 mapping)
// in model/engine.js is language-agnostic and UNCHANGED by localization. Only the
// *text the engine asks the user* (questions, follow-ups, probes, frequency options)
// and the result-page tier wording are localized here.
//
// English strings are the canonical sources in model/criteria.js (questions) and
// model/engine.js (prompts). This module supplies Persian (fa) equivalents plus
// shared helpers, so the engine can render identical clinical content in either language.

const ONSET_AGE = 12; // mirrored from criteria.js; used for childhood age wording

// ---- Stage 2: the 18 DSM-5 criteria (§1 adult-adapted plain language) ----
// Keyed by criterion id to mirror CRITERIA in criteria.js.
const criterionQuestions = {
  en: {}, // populated below from criteria.js at runtime is not possible here; EN keeps source-of-truth in criteria.js
  fa: {
    INATT_01: 'چقدر در پیگیری جزئیات ریز یا کردن اشتباهات غیرضروری در کارها دچار مشکل می‌شوید؟',
    INATT_02: 'چقدر در حفظ توجه روی یک کار، خواندن یا مطالب طولانی مشکل دارید؟',
    INATT_03: 'چقدر وقتی مستقیماً با شما حرف می‌زنند، به نظر نمی‌رسد گوش می‌دهید (چون ذهن‌تان در جای دیگری است)؟',
    INATT_04: 'چقدر کارها را شروع می‌کنید اما تکمیل نمی‌کنید، حتی وقتی قصد داشتید؟',
    INATT_05: 'چقدر وقتی یک کار نیازمند سازماندهی است، مشکل دارید چیزها را در جا بگذارید؟',
    INATT_06: 'چقدر از کارهایی که خسته‌کننده یا نیازمند تلاش ذهنی پایدار هستند، می‌دانید یا به تعویق می‌اندازید یا از انجام آن‌ها خودداری می‌کنید؟',
    INATT_07: 'چقدر چیزهایی را که برای کار یا زندگی روزمره نیاز دارید گم می‌کنید؟',
    INATT_08: 'چقدر به راحتی از کاری که قصد انجام آن را داشتید، توسط افکار یا محرک‌های غیرمرتبط منحرف یا هدایت می‌شوید؟',
    INATT_09: 'چقدر مسئولیت‌های روزانه‌تان مثل کارها، قرارها یا پاس‌گو کردن تماس‌ها را فرامی‌خوانید؟',
    HYPERR_01: 'چقدر لرزان یا جسم‌تکان می‌کنید یا احساس بی‌قراری می‌کنید (مثلاً نمی‌توانید آرام بمانید در جلسات)؟',
    HYPERR_02: 'چقدر احساس دارید باید بلند بشوید یا حرکت کنید وقتی باید بنشینید/بمانید؟',
    HYPERR_03: 'چقدر احساس می‌کنید «در حالت تمام‌وقت» هستید یا گویی توسط موتوری پیش می‌رود (افکار سریع، نمی‌توانید آرام بگیرید)؟',
    HYPERR_04: 'چقدر درگیر شدن در یا لذت بردن از فعالیت‌های آرام و سرگرمی مشکل دارید؟',
    HYPERR_05: 'چقدر بیش از حد و اغلب حرف می‌زنید یا احساس نیاز به پر کردن سکوت را دارید؟',
    HYPERR_06: 'چقدر بدون صبر جواب می‌دهید یا جملات دیگران را در وسط گفت‌وگو تکرار می‌کنید؟',
    HYPERR_07: 'چقدر مشکل دارید که منتظر بمانید یا در صف‌ها/موقعیت‌های انتظار، بی‌صبری می‌کنید؟',
    HYPERR_08: 'چقدر دیگران را قطع می‌کنید یا به گفت‌وگو یا فعالیت‌هایشان مزاحمت ایجاد می‌کنید؟',
    HYPERR_09: 'چقدر بدون تفکر عمل یا سخن می‌گویید به گونه‌ای که بعداً پشیمان یا برای دیگران نامناسب‌اندیشیده می‌شوید (مثلاً بدون برنامه شروع کردن، یا گفتن چیزی بدون فیلتر)؟',
  },
};

// ---- Frequency options (§2) ----
const frequencyOpts = {
  en: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'],
  fa: ['هرگز', 'ندرتاً', 'گاهی', 'اغلب', 'بسیار زیاد'],
};
const freqPrompt = {
  en: 'Over the past 6 months, how often does this happen?',
  fa: 'در شش ماه اخیر، این رفتار چقدر اتفاق افتاده است؟',
};

// ---- Follow-up prompts (§3) — warm, conversation-aware phrasing ----
const followups = {
  example: {
    en: 'You mentioned this comes up fairly often. Can you walk me through one concrete recent example — what was going on, what you did, and what happened as a result?',
    fa: 'شما گفتید این مورد اتفاق می‌افتد. می‌توانید یک مثال خاص و اخیر بگویید — چه اتفاقی می‌افتاد، چه کردید و چه شد؟',
  },
  context: {
    en: 'In which situations does this tend to surface — at work, at home, in social settings, or elsewhere?',
    fa: 'این معمولاً در چه شرایطی ظاهر می‌شود — در کار، در خانه، در شرایط اجتماعی یا جاهای دیگر؟',
  },
  consequence: {
    en: 'When this happens, what does it cost you or get in the way of?',
    fa: 'وقتی این اتفاق می‌افتد، چه هزینه‌ای دارد یا مانع چه چیزی می‌شود؟',
  },
  clarify: {
    en: 'Just to make sure I\'m tracking: is this meaningfully different from feeling bored or tired, or something that happens to most people now and then?',
    fa: 'برای اطمینان از اینکه درست متوجه شدم: آیا این مشکل با خستگی یا بی‌حوصلگی معمولی فرق دارد، یا گاهی برای بیشتر مردم هم پیش می‌آید؟',
  },
  default: {
    en: 'Can you say a bit more about that for this item?',
    fa: 'می‌توانید کمی بیشتر در مورد این بند بگویید؟',
  },
  // Gentle preamble used when re-asking the core question after an "I don't know"
  // answer (uncertainty recorded). Keeps the clinical question identical; only the framing softens.
  recast: {
    en: 'No problem. To get a clear picture of this item, I just need a frequency estimate. ',
    fa: 'بدون مشکل. برای درک بهتر این بند، فقط یک تخمین فراوانی نیاز دارم.',
  },
};

// ---- Stage 3: childhood-onset probes (§5, concrete pre-age-12 memories) ----
// Keyed by probe id, mirrors CHILDHOOD_PROBES array order in engine.js.
const childhoodProbes = {
  report_card: {
    en: 'Do you recall any primary-school report cards or teacher comments that mentioned attention, organization, hyperactivity, or impulsivity?',
    fa: 'آیا خاطر دارید که کارنامه‌های درسی یا نظرات معلمانتان در مدرسهٔ ابتدایی دربارهٔ توجه، سازماندهی، هایپراکتیویت یا بی‌صبری ذکر شده بود؟',
  },
  homework: {
    en: 'As a child (under 12), how did you tend to handle homework completion — did you start it, finish it, or leave it unfinished?',
    fa: 'وقتی کودک بودید (زیر ۱۲ سال)، معمولاً چطور تکالیف خانه را تکمیل می‌کردید — شروع می‌کردید، تمام می‌کردید یا رها می‌کردید؟',
  },
  organization: {
    en: 'As a child, was your desk, backpack, or room generally organized, or were small items (pencils, toys, papers) frequently lost or misplaced?',
    fa: 'وقتی کودک بودید، میز، کیف‌پر و اتاق‌تان عموماً منظم بود یا قلم‌ها، اسباب‌بازی‌ها و کاغذها اغلب گم می‌شد یا جاگذاری نمی‌شد؟',
  },
  forgetting: {
    en: 'As a child, did you often forget daily things — like bringing home permission slips, lunches, or school supplies?',
    fa: 'وقتی کودک بودید، اغلب چیزهای روزانه را فرامی‌خوانید — مثل آوردن فرم مرخصی، ناهار یا لوازم‌تحصیلی؟',
  },
  sit_still: {
    en: 'As a child, were you able to sit still and quiet during class or meals, or did you squirm, fidget, or seem "on the go"?',
    fa: 'وقتی کودک بودید، در کلاس یا وقتی غذا می‌خوردید می‌توانستید آرام بنشینید و ساکت باشید، یا می‌لرزیدید، دست و پنجه نرم می‌کردید یا «در حالت تمام‌وقت» به نظر می‌رسیدید؟',
  },
  interrupt: {
    en: 'As a child, did you tend to interrupt, blurt out answers, or have trouble waiting your turn (e.g., in class or with friends)?',
    fa: 'وقتی کودک بودید، اغلب قطع می‌کردید، جواب برمی‌داشتید یا مشکلی در انتظار نوبت داشتید (مثلاً در کلاس یا با دوستان)؟',
  },
  peer_relations: {
    en: 'As a child, how were your friendships and peer interactions at recess — did you play cooperatively, or tended to be overly chummy/intrusive?',
    fa: 'وقتی کودک بودید، چطور بود روابط دوستانه و تعامل با همسالانتان در زمان بازی — همکارانه بازی می‌کردید یا خیلی صمیمی و مزاحمت‌آمیز می‌شد؟',
  },
  extracurricular: {
    en: 'As a child, how did you approach organized activities or sports — could you stick with them, or did you lose interest or dash off quickly?',
    fa: 'وقتی کودک بودید، چطور به فعالیت‌های سازماندهی‌شده یا ورزش برمی‌خوردید — می‌توانستید ادامه بدهید یا به زودی از دستشان می‌رفتید؟',
  },
  parent_obs: {
    en: 'Do you recall any parent/guardian observations from before age 12 about your attention, energy, or self-control — as they were described then?',
    fa: 'یادآوری دارید از مشاهدات (والدین/سرپرست) قبل از ۱۲ سالگی دربارهٔ توجه، انرژی یا خودکنترلی‌تان، همان‌طور که آن زمان توصیف شده بود؟',
  },
};
const childhoodSuffix = {
  en: 'If you recall anything, describe it as specifically as you can (what you remember, roughly what age, and where it came from — e.g., a report card, a teacher, a parent, or your own memory).',
    fa: 'اگر چیزی به یاد دارید، تا جایی که می‌توانید مشخص کنید: چه چیزی به یاد دارید، حدوداً چه سنی بوده و منبع آن (مثلاً کارنامه، معلم، والدین، یا خاطرهٔ خودتان).',
};

// ---- Stage 4: functional impairment & multiple-settings probes (§6) ----
const impairmentPrompts = {
  domains: {
    en: 'Think back over the past 6 months. In which areas of life are attention, focus, organization, or energy difficulties costly if someone were watching closely? For each area you mention, give ONE specific recent example and name the area (e.g., work, relationships, finances, daily routines, organization, driving, school, household, time management, emotional impact).',
    fa: 'به شش ماه اخیر فکر کنید. در چه حوزه‌های زندگی، مشکلات توجه، تمرکز، سازماندهی یا انرژی در صورتی که کسی دقیقاً نگاه می‌کرد، هزینه‌دار یا مزاحمت‌ساز هستند؟ برای هر حوزه‌ای که می‌گویید، یک مثال خاص و اخیر بگویید و نام آن حوزه را بگویید (مثلاً کار، روابط، مالی، روتین روزانه، سازماندهی، رانندگی، مدرسه، خانه، مدیریت زمان، تأثیر عاطفی).',
  },
  settings: {
    en: 'Where do you regularly experience these difficulties? Name AT LEAST TWO specific settings (e.g., work, home, social, school) and give one brief, concrete example of how it shows up in each.',
    fa: 'کجا معمولاً این مشکلات را تجربه می‌کنید؟ حداقل دو محیط خاص بگویید (مثلاً کار، خانه، اجتماعی، مدرسه) و یک مثال کوتاه و صریح از نحوهٔ ظهور در هر کدام بگویید.',
  },
};

// ---- Stage 5: focused differential probes (§7) — flagging only ----
// Keyed by factor id, mirrors DIFFERENTIAL_FACTORS in engine.js. Includes label + probe text.
const differentialFactors = {
  anxiety: {
    label: { en: 'Anxiety', fa: 'اضطراب' },
    probe: {
      en: 'Do you experience persistent worry, restlessness, muscle tension, or racing thoughts about threats? If so, does it seem related to your attention/focus difficulties?',
      fa: 'آیا اضطراب پایدار، بی‌قراری، تنش عضلانی یا افکار سریع دربارهٔ تهدیدها دارید؟ اگر بله، آیا این مرتبط با مشکلات توجه/تمرکز‌تان است؟',
    },
  },
  depression: {
    label: { en: 'Depression', fa: 'افسردگی' },
    probe: {
      en: 'Do you get persistent low mood, loss of interest/pleasure, fatigue, sleep/appetite changes, or feelings of worthlessness? If so, does it seem related to concentration or energy?',
      fa: 'آیا احساس افسردگی، از دست دادن علاقه/لذت، خستگی، تغییرات خواب/اشتهاء یا احساس بی‌ارزشی دارید؟ اگر بله، آیا مرتبط با تمرکز یا انرژی است؟',
    },
  },
  sleep: {
    label: { en: 'Sleep problems', fa: 'مشکلات خواب' },
    probe: {
      en: 'Do you have insomnia, fragmented or non-restorative sleep, signs of sleep apnea, or an irregular sleep schedule? If so, does it seem related to attention or fatigue?',
      fa: 'آیا بی‌خوابی، خواب شکسته یا غیرقابل‌تعویض، علائم آپنهٔ خواب یا برنامهٔ زمان‌بندی نامنظم خواب دارید؟ اگر بله، مرتبط با توجه یا خستگی است؟',
    },
  },
  bipolar: {
    label: { en: 'Bipolar-spectrum', fa: 'طیف دوقطبی' },
    probe: {
      en: 'Have you had periods of abnormally elevated mood/energy, decreased need for sleep, or racing thoughts (distinct from your baseline)? If so, does it relate to impulsivity or restlessness?',
      fa: 'آیا دوره‌های خلق بالا/انرژی بالا، نیاز کمتر به خواب یا افکار سریع (غیر از پایهٔ شما) داشته‌اید؟ اگر بله، مرتبط با بی‌کنترلی یا بی‌قراری است؟',
    },
  },
  substance: {
    label: { en: 'Substance/alcohol', fa: 'مواد/الکل' },
    probe: {
      en: 'Do you use alcohol or substances regularly in a way that could affect your attention or self-regulation?',
      fa: 'آیا به‌طور منظم از الکل یا مواد مصرف می‌کنید به گونه‌ای که می‌تواند بر توجه یا خودکنترلی‌تان تأثیر بگذارد؟',
    },
  },
  stress: {
    label: { en: 'Chronic stress / burnout', fa: 'استرس مزمن / سوختگی' },
    probe: {
      en: 'Are you experiencing prolonged overwhelm, exhaustion, or detachment from work/things? If so, does it relate to focus or executive difficulties?',
      fa: 'آیا درگیر سرریز/استرس طولانی‌مدت، خستگی یا از دست دادن علاقه از کار/چیزها هستید؟ اگر بله، مرتبط با تمرکز یا مشکلات اجرایی است؟',
    },
  },
  medical: {
    label: { en: 'Medical / physical', fa: 'پزشکی / جسمی' },
    probe: {
      en: 'Do you have or suspect any medical/physical condition (e.g., thyroid issues, sleep apnea, chronic pain) or take medications that affect attention? If so, does it relate to your focus/energy?',
      fa: 'آیا بیماری یا وضعیت فیزیکی‌ای دارید (مثل مشکلات غدد یا آپنهٔ خواب، درد مزمن) یا دارویی مصرف می‌کنید که بر توجه تأثیر بگذارد؟ اگر بله، مرتبط با تمرکز/انرژی است؟',
    },
  },
};
const differentialSuffix = {
  en: 'Answer yes/no and, if applicable, briefly note how (if at all) it may relate to the attention/energy/focus difficulties described earlier. This is a flagging screen only — it is not a diagnosis.',
  fa: 'پاسخ بله/خیر بدهید و در صورت امکان، به‌طور خلاصه بنویسید که (در چه صورتی که مرتبط است) چه‌گونه با مشکلات توجه/انرژی/تمرکز گفته‌شده در بالا ربط دارد. این فقط صفحهٔ نمایش علامت است — تشخیص نیست.',
};

// ---- Result-page tier wording (§9e). Mirrors engine.evaluate product wording. ----
const tierText = {
  Consistent: {
    en: 'Your responses are consistent with how ADHD tends to present, and there is evidence of early onset and cross-setting impact. A professional ADHD evaluation may be worthwhile — especially to explore alternative explanations.',
    fa: 'پاسخ‌های شما با نحوهٔ ظهور ADHD سازگار است و شواهدی از شروع علائم در کودکی و تأثیر در چندین محیط وجود دارد. مشاورهٔ حرفه‌ای برای ارزیابی ADHD می‌تواند مفید باشد — به‌ویژه برای بررسی عوامل جایگزین.',
  },
  Insufficient: {
    en: 'This assessment does not show a pattern consistent with ADHD. Still, if attention, organization, or energy difficulties meaningfully affect your life, a professional evaluation may be worthwhile to explore other causes.',
    fa: 'این ارزیابی، الگویی سازگار با ADHD نشان نمی‌دهد. با این حال، اگر مشکلات توجه، سازماندهی یا انرژی به‌طور معناداری بر زندگی‌تان تأثیر می‌گذارند، ممکن است ارزیابی حرفه‌ای برای بررسی دلایل دیگر مفید باشد.',
  },
  'Partially consistent': {
    en: 'Some of your responses are consistent with ADHD, but supporting evidence (early onset, impact across settings, or impairment) is limited or uncertain, or alternative explanations were flagged. A professional evaluation may still be worthwhile to clarify.',
    fa: 'برخی از پاسخ‌های شما با ADHD سازگار هستند، اما شواهد پشتیبانی (شروع علائم در کودکی، تأثیر در چندین محیط، یا ناتوانی) محدود یا نامطمئن هستند یا عوامل جایگزین یادآوری شده‌اند. ارزیابی حرفه‌ای همچنان ممکن است برای روشن‌سازی مفید باشد.',
  },
};

// ---- Result page UI strings ----
const resultUI = {
  en: {
    summaryTitle: 'Assessment Summary',
    summarySection: 'Summary',
    whatWeFound: 'What the assessment found',
    adultPattern: 'Adult symptom pattern',
    patternLabel: 'Pattern',
    supportedLabel: 'Symptoms with clear evidence',
    supportedCount: '{n} of {threshold} in one or both groups met the symptom threshold.',
    onsetLabel: 'Childhood onset',
    onsetSource: 'Based on Stage 3 (concrete pre-age-12 evidence)',
    durationLabel: 'Duration / persistence',
    durationReq: '>= 6 months (DSM-5)',
    settingsLabel: 'Settings',
    settingsReq: '>= 2 (DSM-5)',
    impairmentLabel: 'Functional impairment',
    areasToReview: 'Areas that may deserve further attention',
    alternativeExplanations: 'Alternative explanations noted',
    tiedToSymptoms: ' — reported as related to ADHD-like symptoms',
    contradictions: 'Evidence the ADHD pattern does not cleanly explain',
    limitations: 'Important limitations',
    limitationsText: 'This tool is a self-assessment aid, not a medical device or clinical test. It does not diagnose ADHD. Results depend entirely on what you recalled and shared, and can be incomplete or wrong. Only a qualified clinician can diagnose ADHD.',
    summaryDisclaimer: 'This is not a medical diagnosis and does not replace an evaluation by a qualified clinician.',
    stage2OnlyText: 'Adult-symptom evidence collected. Childhood onset, multiple-settings, impairment, and differential check (Stages 3-5) remain to be completed for a full assessment.',
    detailed: 'Detailed assessment information',
    detailedToggle: 'Show technical details',
    hideDetailed: 'Hide technical details',
    criterionCol: 'Criterion',
    evidenceCol: 'Evidence',
    statusCol: 'Status',
    confidenceCol: 'Confidence',
    dsm5: 'DSM-5 criterion checklist (evidence status)',
    perSymptom: 'Per-symptom evidence',
    notSupported: 'not supported',
    partially: 'partially supported',
    supported: 'supported',
    unsupported: 'unsupported',
    uncertain: 'uncertain',
    noExample: 'no concrete example',
    criterionA: 'A — Symptom count (>=5 in one domain)',
    criterionB: 'B — Persistence (>=6 months)',
    criterionC: 'C — Age of onset (<12)',
    criterionD: 'D — Multiple settings (>=2)',
    criterionE: 'E — Clinically significant impairment',
    criterionF: 'F — Not better explained by another condition',
    patternBelow: 'Below threshold',
    patternCombined: 'Combined',
    patternInattentive: 'Inattentive',
    patternHyperactive: 'Hyperactive/impulsive',
    finishLabel: 'Finish assessment',
    printLabel: 'Print / share',
    saveLabel: 'Save & continue later',
    importLabel: 'Import saved assessment',
    exportLabel: 'Export assessment',
    exportSuccessTitle: 'Assessment saved',
    exportSuccessBody: 'Your assessment has been downloaded. Save this file to continue later.',
    importSuccessTitle: 'Assessment restored',
    importSuccessBody: 'Your saved assessment has been restored.',
    importErrorTitle: 'Could not restore assessment',
    importErrorBody: 'The file is not a valid saved assessment.',
    importConfirmOverwrite: 'A saved assessment already exists. Replace it with the imported file?',
    overwriteBtn: 'Replace',
    cancelBtn: 'Cancel',
    fileTooLargeError: 'File is too large or unreadable.',
  },
  fa: {
    summaryTitle: 'خلاصه ارزیابی',
    summarySection: 'خلاصه',
    whatWeFound: 'یافته‌های ارزیابی',
    adultPattern: 'الگوی علائم بالغین',
    patternLabel: 'الگو',
    supportedLabel: 'علائم با شواهد واضح',
    supportedCount: '{threshold} از {n} مورد در یک یا هر دو گروه به حد آستانه رسیده‌اند.',
    onsetLabel: 'شروع علائم در کودکی',
    onsetSource: 'بر اساس مرحلهٔ ۳ (شواهد خاص پیش از ۱۲ سال)',
    durationLabel: 'مدت / پایداری',
    durationReq: '>= ۶ ماه (DSM-5)',
    settingsLabel: 'محیط‌ها',
    settingsReq: '>= ۲ (DSM-5)',
    impairmentLabel: 'ناتوانی عملکردی',
    areasToReview: 'حوزه‌هایی که ممکن است نیاز به بررسی بیشتر داشته باشند',
    alternativeExplanations: 'عوامل جایگزین یادآوری شده',
    tiedToSymptoms: ' — به‌عنوان مرتبط با علائم شبیه ADHD گزارش شده',
    contradictions: 'شواهدی که الگوی ADHD را به‌خوبی تبیین نمی‌کند',
    limitations: 'محدودیت‌های مهم',
    limitationsText: 'این ابزار یک کمک‌خودارزیابی است، نه دستگاه یا تست بالینی پزشکی و ADHD تشخیص نمی‌دهد. نتایج کاملاً به آنچه به خاطر داشته و به اشتراک گذاشته‌اید بستگی دارد و ممکن است ناقص یا نادرست باشد. فقط یک متخصص صلاح‌وقت می‌تواند ADHD تشخیص دهد.',
    summaryDisclaimer: 'این یک تشخیص پزشکی نیست و جای ارزیابی توسط یک متخصص واجد شرایط را نمی‌گیرد.',
    stage2OnlyText: 'شواهد علائم بالغین جمع‌آوری شده است. علائم کودکی، چندین محیط، ناتوانی عملکردی، و بررسی عوامل جایگزین (مراحل ۳ تا ۵) برای ارزیابی کامل باقی مانده است.',
    detailed: 'اطلاعات ارزیابی فنی',
    detailedToggle: 'نمایش جزئیات فنی',
    hideDetailed: 'پنهان کردن جزئیات فنی',
    criterionCol: 'معیار',
    evidenceCol: 'شاهد',
    statusCol: 'وضعیت',
    confidenceCol: 'اعتماد',
    dsm5: 'چک‌لیست معیارهای DSM-5 (وضعیت شواهد)',
    perSymptom: 'شواهد به ازای هر علامت',
    notSupported: 'پشتیبانی نشده',
    partially: 'تا حدی پشتیبانی شده',
    supported: 'پشتیبانی شده',
    unsupported: 'پشتیبانی نشده',
    uncertain: 'عدم قطعیت',
    noExample: 'بدون مثال خاص',
    criterionA: 'A — شمارش علائم (>=5 در یک حوزه)',
    criterionB: 'B — پایداری (>=6 ماه)',
    criterionC: 'C — سن آغاز (<12)',
    criterionD: 'D — چندین محیط (>=2)',
    criterionE: 'E — ناتوانی بالینی معنادار',
    criterionF: 'F — بهتر توضیح داده نشده توسط شرایط دیگر',
    patternBelow: 'زیر حد آستانه',
    patternCombined: 'ترکیبی',
    patternInattentive: 'بی‌توجهی',
    patternHyperactive: 'هایپراکتیو/بی‌صبری',
    finishLabel: 'اتمام ارزیابی',
    printLabel: 'چاپ / اشتراک‌گذاری',
    saveLabel: 'ذخیره و ادامه در آینده',
    importLabel: 'وارگذاری ارزیابی ذخیره‌شده',
    exportLabel: 'خروجی ارزیابی',
    exportSuccessTitle: 'ارزیابی ذخیره شد',
    exportSuccessBody: 'ارزیابی شما دانلود شد. این فایل را برای ادامه در آینده نگهداری کنید.',
    importSuccessTitle: 'ارزیابی بازگردانده شد',
    importSuccessBody: 'ارزیابی ذخیره‌شده شما بازگردانده شد.',
    importErrorTitle: 'بازگردانی ارزیابی امکان‌پذیر نبود',
    importErrorBody: 'فایل انتخاب‌شده یک ارزیابی ذخیره‌شده معتبر نیست.',
    importConfirmOverwrite: 'یک ارزیابی ذخیره‌شده قبلاً وجود دارد. آن را با فایل وارگذاری جایگزین کنید؟',
    overwriteBtn: 'جایگزین کن',
    cancelBtn: 'لغو',
    fileTooLargeError: 'فایل بیش از حد بزرگ یا غیرقابل خواندن است.',
  },
};

const contradictionPrefixFa = {
  childhood: 'کودکی',
};

function pick(obj, lang, fallback = '') {
  if (!obj) return fallback;
  const side = lang === 'fa' ? 'fa' : 'en';
  return (obj[side] != null) ? obj[side] : (obj.en != null ? obj.en : fallback);
}

// Helpers used by the engine (model/engine.js) and the result-page renderer.
function criterionQuestion(id, lang) {
  if (lang === 'fa') return (criterionQuestions.fa[id] || '');
  return undefined; // EN is the canonical source in criteria.js; engine falls back to criterion.question
}
function frequency(lang) { return pick(frequencyOpts, lang); }
function freqPromptText(lang) { return pick(freqPrompt, lang); }
function followupText(kind, lang) { return followups[kind] ? pick(followups[kind], lang) : ''; }
function recastText(lang) { return followups.recast ? pick(followups.recast, lang) : ''; }
function childhoodQuestionText(id, lang) { return childhoodProbes[id] ? pick(childhoodProbes[id], lang) : ''; }
function childhoodSuffixText(lang) { return pick(childhoodSuffix, lang); }
function impairmentQuestionText(id, lang) { return impairmentPrompts[id] ? pick(impairmentPrompts[id], lang) : ''; }
function differentialQuestion(id, lang) { return differentialFactors[id] ? pick(differentialFactors[id].probe, lang) : ''; }
function differentialLabel(id, lang) { return differentialFactors[id] ? pick(differentialFactors[id].label, lang) : id; }
function differentialSuffixText(lang) { return pick(differentialSuffix, lang); }
function tierRecommendationText(tier, lang) { return tierText[tier] ? pick(tierText[tier], lang) : ''; }
function resultUILabel(key, lang) { const side = lang === 'fa' ? 'fa' : 'en'; return (resultUI[side] || resultUI.en)[key] || ''; }
function resultUILabelMap(key, lang) { const side = lang === 'fa' ? 'fa' : 'en'; return (resultUI[side] || resultUI.en)[key] || resultUI.en[key]; }

// Reverse map: English label -> factor id (so the report's EN label can be localized to FA).
function factorIdByEnLabel(enLabel) {
  for (const id of Object.keys(differentialFactors)) {
    if (differentialFactors[id].label.en === enLabel) return id;
  }
  return null;
}
function localizeDifferentialLabel(enLabel, lang) {
  const id = factorIdByEnLabel(enLabel);
  return id ? differentialLabel(id, lang) : enLabel;
}

// ---- §3a: Criterion short labels (English → Persian) ----
// Maps criterion IDs to short Persian labels for use in report fallback text.
const criterionLabelsFa = {
  INATT_01: 'اشتباهات در جزئیات',
  INATT_02: 'نگهداری توجه',
  INATT_03: 'گوش ندادن فعال',
  INATT_04: 'شروع ولی تکمیل نکردن',
  INATT_05: 'سازماندهی کارها',
  INATT_06: 'اجتناب از کارهای سنگین ذهنی',
  INATT_07: 'گم کردن چیزها',
  INATT_08: 'حواس‌پرتی',
  INATT_09: 'فراموشی مسئولیت‌ها',
  HYPERR_01: 'لرزان یا بی‌قراری',
  HYPERR_02: 'ناتوانی در نشستن',
  HYPERR_03: 'تحریک‌زدگی شدید',
  HYPERR_04: 'از دست دادن لذت از فعالیت‌های آرام',
  HYPERR_05: 'حرف زدن بیش از حد',
  HYPERR_06: 'حرف زدن بدون صبر (برش از جواب)',
  HYPERR_07: 'صبر نکردن نوبت',
  HYPERR_08: 'قطع کردن گفت‌وگو',
  HYPERR_09: 'عمل یا حرف زدن بدون فکر',
};
function criterionLabel(id, lang) {
  if (lang === 'fa') return criterionLabelsFa[id] || id;
  return id;
}

// ---- §3b: English-text detection + Persian fallback for evidence sanitization ----
// Issue #10C: the LLM evidence extractor can return English strings even in the
// FA flow. We detect Latin-heavy text and replace with a language-appropriate
// fallback so no raw English appears in a Persian report.
// Heuristic: a string is "English" if Latin letters outnumber Persian/Arabic letters.
function looksEnglish(text) {
  if (!text) return false;
  var latin = (String(text).match(/[A-Za-z]/g) || []).length;
  var persian = (String(text).match(/[\u0600-\u06FF\u200C\u200D]/g) || []).length;
  return latin > 0 && latin >= persian;
}

// Persian fallback phrases for evidence fields that would otherwise be raw English.
const noEvidenceFallbackFa = 'شاهد خاصی ارائه نشده است';

function sanitizeEvidence(text, lang) {
  if (!text) return null;
  if (lang === 'fa' && looksEnglish(text)) {
    return noEvidenceFallbackFa;
  }
  return text;
}

function sanitizeEvidenceList(arr, lang) {
  if (!arr || !Array.isArray(arr)) return [];
  return arr.map(function (x) { return sanitizeEvidence(x, lang); }).filter(function (x) { return x !== null; });
}

// ---- §3: Persian/Arabic Unicode normalization + canonical answer classification ----
// Issue #3: the LLM is unreliable for simple Persian frequency/yes-no words. This layer
// normalizes the user's raw answer and maps it to the canonical English values the engine
// expects, so classification is deterministic — not LLM-inferred.

// Normalize Persian/Arabic text: unify ی/ي, ک/ك, remove ZWNJ/zero-width chars,
// collapse whitespace, strip surrounding punctuation.
function normalizePersian(text) {
  if (!text) return '';
  return String(text)
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '') // zero-width / directional marks
    .replace(/\u064A[\u0654\u0655]?/g, '\u06CC')   // ی (with/without harakat) → ی
    .replace(/\u0626/g, '\u06CC')                   // ئ → ی
    .replace(/\u06A9/g, '\u0643')                   // ک (Farsi) → ک (Arabic) — they're visually identical
    .replace(/[\u060C\u060D\u061B\u061F\u066A\u066D]/g, ' ')  // Persian punctuation → space
    .replace(/[\u0621\u0622\u0623\u0624\u0625\u0626]/g, m => ({ '\u0621': 'ء', '\u0622': 'آ', '\u0623': 'أ', '\u0624': 'ء', '\u0625': 'إ', '\u0626': 'ئ' }[m])) // normalize hamzas
    .replace(/[.,!?;:'"()[\]{}\\\/]+/g, ' ')        // common Latin punctuation → space (so "هرگز." -> "هرگز")
    .replace(/\s+/g, ' ')                            // collapse whitespace
    .trim();
}

// Canonical frequency values the engine expects (mirrors criteria.js FREQUENCY_VALUES)
var CANONICAL_FREQUENCIES = ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'];

// Persian + English frequency words mapped to canonical values.
// Handles multiple spelling variants (ی/ي, ک/ك, ZWNJ variants).
var FREQUENCY_MAP = {
  'هرگز': 'Never',
  'هر گز': 'Never',
  'هیچ‌وقت': 'Never',
  'هیچوقت': 'Never',
  'هیچ وقت': 'Never',
  'ندرتاً': 'Rarely',
  'ندرتا': 'Rarely',
  'به‌ندرت': 'Rarely',
  'به ندرت': 'Rarely',
  'گاهی': 'Sometimes',
  'گاھی': 'Sometimes',
  'گاهی‌اوقات': 'Sometimes',
  'گاهی اوقات': 'Sometimes',
  'اغلب': 'Often',
  'اکثراً': 'Often',
  'مکررا': 'Often',
  'بسیار زیاد': 'Very Often',
  'بسیارزیاد': 'Very Often',
  'very often': 'Very Often',
  'often': 'Often',
  'sometimes': 'Sometimes',
  'rarely': 'Rarely',
   'never': 'Never',
};

// Pre-normalize frequency map keys so ZWNJ/ی/ک variants in keys match the normalized input.
// Without this, a key like 'به‌ندرت' (with ZWNJ) never matches input 'بهندرت' (ZNWNJ stripped).
var FREQUENCY_MAP_NORM = {};
(function () {
  for (var k in FREQUENCY_MAP) {
    var nk = normalizePersian(k).toLowerCase();
    if (nk) FREQUENCY_MAP_NORM[nk] = FREQUENCY_MAP[k];
  }
})();

// Yes/No words mapped to boolean (for Stage 5 differential probes).
var YES_NO_MAP = {
  'بله': true,
  'آره': true,
  'اَره': true,
  'بلی': true,
  'خیر': false,
  'خير': false,
  'نه': false,
  'نه‌ای': false,
  'no': false,
  'yes': true,
};

// Pre-normalize yes/no map keys (same ZWNJ/ی/ک issue as FREQUENCY_MAP).
var YES_NO_MAP_NORM = {};
(function () {
  for (var k in YES_NO_MAP) {
    var nk = normalizePersian(k).toLowerCase();
    if (nk) YES_NO_MAP_NORM[nk] = YES_NO_MAP[k];
  }
})();

// "I don't know / I'm not sure" variants — used to flag uncertainty.
var UNCERTAINTY_WORDS = [
  'نمی‌دانم', 'نمیدونم', 'نمی‌دونم', 'نمی‌دوم',
  'نمی‌فهمم', 'نا‌مشخص', 'ناشناس', 'نمی‌توانم',
  'نمی‌تونم',
  'یادم نیست', 'یادم نیستم', 'یادم میاد', 'یادم نمیاد',
  'یادم ندارم', 'یادم نگرفته', 'یاد ندارم', 'یادم نیومده',
  'یادم نیومده', 'یادم نیومد', 'یاد نداشتم', 'یاد نداشت', 'یاد نمیاد',
  'یادم نمی‌آید', 'یاد نمی‌آید', 'یاد نمی‌آید',
  'i don', "i don't", "dont know", "dont remember",
  'مطمئن نیستم', 'مطمئنا نیستم',
];

// Try to classify a raw user answer as a canonical frequency.
// Returns 'Never'|'Rarely'|'Sometimes'|'Often'|'Very Often' or null.
function classifyFrequency(text) {
  if (!text) return null;
  const norm = normalizePersian(text).toLowerCase();
  if (!norm) return null;
  if (FREQUENCY_MAP_NORM[norm]) return FREQUENCY_MAP_NORM[norm];
  // Try token matching: split on whitespace and try multi-word keys
  var tokens = norm.split(/\s+/).filter(Boolean);
  // Try exact full-text match first (already done above), then try combinations
  for (var i = 1; i <= tokens.length; i++) {
    var combo = tokens.slice(0, i).join(' ');
    if (FREQUENCY_MAP_NORM[combo]) return FREQUENCY_MAP_NORM[combo];
  }
  return null;
}

// Try to classify a raw user answer as a boolean yes/no.
// Returns true | false | null.
function classifyYesNo(text) {
  if (!text) return null;
  var norm = normalizePersian(text).toLowerCase();
  if (!norm) return null;
  if (norm in YES_NO_MAP_NORM) return YES_NO_MAP_NORM[norm];
  var tokens = norm.split(/\s+/).filter(Boolean);
  for (var i = 1; i <= tokens.length; i++) {
    var combo = tokens.slice(0, i).join(' ');
    if (combo in YES_NO_MAP_NORM) return YES_NO_MAP_NORM[combo];
  }
  return null;
}

// Detect "I don't know" / uncertainty responses (Persian + English variants).
// Returns a human-readable uncertainty note string in the right language, or null.
function detectUncertainty(text, lang) {
  if (!text) return null;
  var norm = normalizePersian(text).toLowerCase();
  if (!norm) return null;
  for (var i = 0; i < UNCERTAINTY_WORDS.length; i++) {
    var w = normalizePersian(UNCERTAINTY_WORDS[i]).toLowerCase();
    if (norm.indexOf(w) !== -1) {
      return lang === 'fa'
        ? 'کاربر گفته است «' + text.trim() + '» — عدم قطعیت یا عدم یادآوری.'
        : 'User indicated "' + text.trim() + '" — uncertainty / unable to recall.';
    }
  }
  return null;
}

module.exports = {
  criterionQuestion, frequency, freqPromptText, followupText, recastText,
  childhoodQuestionText, childhoodSuffixText,
  impairmentQuestionText, differentialQuestion, differentialLabel, differentialSuffixText,
  localizeDifferentialLabel, factorIdByEnLabel,
  tierRecommendationText, resultUILabel, resultUILabelMap,
   criterionLabel, looksEnglish, sanitizeEvidence, sanitizeEvidenceList,
   contradictionPrefixFa,
  normalizePersian, classifyFrequency, classifyYesNo, detectUncertainty,
  CANONICAL_FREQUENCIES,
  ONSET_AGE,
};
