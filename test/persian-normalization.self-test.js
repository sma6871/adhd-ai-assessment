'use strict';

const assert = require('assert');
const locales = require('../model/locales');

// --- Issue #2: هرگز frequency mapping ---
const frequencyCases = [
  ['گاهی', 'Sometimes'],
  ['گ‌اهی', 'Sometimes'],
  ['ي‌ک بار', null],
  ['اغلب', 'Often'],
  ['ندرتا', 'Rarely'],
  ['هیچ‌وقت', 'Never'],
  ['هرگز', 'Never'],
  ['هر گز', 'Never'],
  ['هر\u200cگز', 'Never'],
  ['هرگز.', 'Never'],
  ['هرگز!', 'Never'],
  ['هرگز؟', 'Never'],
  [' هرگز ', 'Never'],
  ['هرگز،', 'Never'],
  ['هرگز؟!', 'Never'],
  ['هیچ‌وقت.', 'Never'],
  ['به‌ندرت', 'Rarely'],
  ['به ندرت', 'Rarely'],
  ['بسیار زیاد', 'Very Often'],
  ['بسیار زیاد.', 'Very Often'],
  ['اغلب!', 'Often'],
];

for (const [input, expected] of frequencyCases) {
  assert.strictEqual(locales.classifyFrequency(input), expected, `frequency: ${input}`);
}

// --- Yes/No variants ---
assert.strictEqual(locales.classifyYesNo('خیر'), false);
assert.strictEqual(locales.classifyYesNo('خير'), false);
assert.strictEqual(locales.classifyYesNo('بله'), true);
assert.strictEqual(locales.classifyYesNo('آره'), true);
assert.strictEqual(locales.classifyYesNo('نه'), false);
assert.strictEqual(locales.classifyYesNo('خیر.'), false);

// --- Issue #1: uncertainty detection for یادم نیست / یادم نمیاد ---
const uncertaintyCases = [
  'نمیدونم',
  'نمی‌دانم',
  'یادم نیست',
  'یادم نمیاد',
  'یادم نمی\u200cآید',
  'یادم ندارم',
  'یاد ندارم',
  'یادم نیستم',
  'یادم میاد',
  'یادم نگرفته',
  'یادم نیومده',
  'یادم نیومد',
  'یاد نداشت',
  'یاد نداشتم',
  'یاد نمیاد',
  'یاد نمی\u200cآید',
  'مطمئن نیستم',
];

for (const input of uncertaintyCases) {
  const result = locales.detectUncertainty(input, 'fa');
  assert.ok(result, `uncertainty not detected for: ${input}`);
}

// --- Punctuation robustness: normalizePersian strips common punctuation ---
assert.strictEqual(locales.classifyFrequency('هرگز.'), 'Never');
assert.strictEqual(locales.classifyFrequency('هرگز!'), 'Never');
assert.strictEqual(locales.classifyFrequency('هرگز؟'), 'Never');
assert.strictEqual(locales.classifyFrequency('هرگز،'), 'Never');
assert.strictEqual(locales.classifyFrequency('هرگز.'), locales.classifyFrequency('هرگز'));

// --- Issue #3: broken Persian wording ---
assert.ok(!locales.criterionQuestion('HYPERR_06', 'fa').includes('صبرتن'), 'HYPERR_06 should not contain "صبرتن"');
assert.ok(locales.criterionQuestion('HYPERR_06', 'fa').includes('بدون صبر'), 'HYPERR_06 should contain "بدون صبر"');

console.log('ALL PASS');
