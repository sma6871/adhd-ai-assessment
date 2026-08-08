'use strict';

// Criterion catalog — 18 DSM-5 items, adult-adapted, per CLINICAL_ADHD_PROTOCOL.md §1.
// Each item is a DISTINCT behavior; HYPERR_06/07/08/09 are clinically separate impulsivity manifestations.

const INATTENTIVE = [
  { id: 'INATT_01', dsm: 1, question: 'How often do you have trouble keeping track of small details or making careless mistakes on tasks?', core: 'Careless mistakes; skips steps; misses small details.' },
  { id: 'INATT_02', dsm: 2, question: 'How often do you have difficulty sustaining attention on a task, reading, or lengthy material?', core: 'Difficulty staying focused; mind goes blank.' },
  { id: 'INATT_03', dsm: 3, question: 'How often do you seem to not listen when spoken to directly (as if distracted)?', core: 'Zoning out mid-conversation; misunderstanding when spoken to.' },
  { id: 'INATT_04', dsm: 4, question: 'How often do you start tasks but fail to finish them, even when you intended to?', core: 'Starts but does not complete; leaves final steps undone.' },
  { id: 'INATT_05', dsm: 5, question: 'How often do you have difficulty getting things in order when a task requires organization?', core: 'Disorganized workspace; trouble sequencing steps.' },
  { id: 'INATT_06', dsm: 6, question: 'How often do you avoid, feel reluctant, or put off tasks that take a lot of thought?', core: 'Delays; reluctant to start demanding mental work.' },
  { id: 'INATT_07', dsm: 7, question: 'How often do you lose things that you need for work or daily activities?', core: 'Losing keys/wallet/phone/documents repeatedly.' },
  { id: 'INATT_08', dsm: 8, question: 'How often are you easily distracted by unrelated thoughts or stimuli?', core: 'Mind wanders; distracted by sounds/thoughts.' },
  { id: 'INATT_09', dsm: 9, question: 'How often do you forget daily responsibilities such as errands, appointments, or returning calls?', core: 'Forgetting commitments, deadlines, messages.' },
];

const HYPERACTIVE = [
  { id: 'HYPERR_01', dsm: 1, question: 'How often do you fidget, squirm, or feel restless (e.g., can\'t sit still in meetings)?', core: 'Fidgeting, squirming, inner restlessness.' },
  { id: 'HYPERR_02', dsm: 2, question: 'How often do you feel driven to get up or move around when you should be sitting/staying still?', core: 'Leaves seat, gets up, driven to move.' },
  { id: 'HYPERR_03', dsm: 3, question: 'How often do you feel "on the go" or as if driven by a motor (racing thoughts, can\'t slow down)?', core: 'On-the-go feeling, racing thoughts, motor-driven.' },
  { id: 'HYPERR_04', dsm: 4, question: 'How often do you find it hard to engage in or enjoy quiet or leisure activities?', core: 'Quiet activities feel impossible; must stay active.' },
  { id: 'HYPERR_05', dsm: 5, question: 'How often do you talk excessively or feel the need to fill silence?', core: 'Frequent talking; discomfort with quiet.' },
  { id: 'HYPERR_06', dsm: 6, question: 'How often do you blurt out answers or finish others\' sentences mid-conversation?', core: 'Blurting out, interrupting with speech. Distinct from waiting-turn (07) and intrusion (08).' },
  { id: 'HYPERR_07', dsm: 7, question: 'How often do you have trouble waiting your turn or feel impatient in queues/waiting situations?', core: 'Impatience, can\'t wait turn.' },
  { id: 'HYPERR_08', dsm: 8, question: 'How often do you interrupt or intrude into others\' conversations or activities?', core: 'Interrupting group talks; barging in. Distinct from blurting (06).' },
  { id: 'HYPERR_09', dsm: 9, question: 'How often do you act or speak on impulse in a way you later regret or others find inappropriate (e.g., starting something without planning, or saying something without filtering first)?', core: 'Acts/speaks without forethought; poor impulse control. Distinct from blurting (06) and intrusion (08).' },
];

const CRITERIA = [...INATTENTIVE, ...HYPERACTIVE];

const DOMAINS = {
  inattentive: CRITERIA.filter(c => c.id.startsWith('INATT_')),
  hyperactive: CRITERIA.filter(c => c.id.startsWith('HYPERR_')),
};

const FREQUENCY_VALUES = ['Never', 'Rarely', 'Sometimes', 'Often', 'Very Often'];

// Stage / lifecycle
const STAGES = ['ONBOARDING', 'SCREENING', 'ADULT_SYMPTOMS', 'CHILDHOOD', 'IMPAIRMENT', 'DIFFERENTIAL', 'REPORT'];

// DSM-5 age-of-onset cutoff (years)
const ONSET_AGE = 12;

// Symptom-count threshold for adults (>=17 per DSM-5)
const SYMPTOM_THRESHOLD = 5;

module.exports = {
  CRITERIA, INATTENTIVE, HYPERACTIVE, DOMAINS,
  FREQUENCY_VALUES, STAGES, ONSET_AGE, SYMPTOM_THRESHOLD,
};
