'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const extractorPath = require.resolve(path.join(ROOT, 'interviewer/interviewer.js'));
const fake = {
  extractEvidence: async function ({ criterion }) {
    const id = criterion.id;
    if (id === 'HYPERR_09') return { core_answer: 'Often', example: null, contexts: [], consequence: null, counter_evidence: [], uncertainty: 'cannot recall' };
    if (id === 'HYPERR_05') throw new Error('simulated parse error');
    if (id === 'INATT_09') return { core_answer: 'Never', example: 'never forget', contexts: ['home'], consequence: null, counter_evidence: ['keeps calendar'], uncertainty: null };
    if (id === 'INATT_04') return { core_answer: 'Sometimes', example: 'sometimes leaves draft', contexts: ['work'], consequence: 'reminder', counter_evidence: [], uncertainty: null };
    return { core_answer: 'Often', example: 'ex ' + id, contexts: ['work', 'home'], consequence: 'cost', counter_evidence: [], uncertainty: null };
  },
};
require.cache[extractorPath] = { id: extractorPath, filename: extractorPath, loaded: true, exports: fake };
const assessment = require(path.join(ROOT, 'model/assessment'));

(async () => {
  const state = assessment.createStage2Assessment('dbg');
  assessment.begin(state);
  console.log('START:', state.pending.cid);
  for (let t = 0; t < 60; t++) {
    const ans = 'yes, often, for example when I...';
    const res = await assessment.processTurn(state, ans);
    const cid = state.pending.cid;
    const rec = state.criteria[cid] || { tries: 0, followups: 0 };
    const move = rec.status !== null ? rec.status : (rec.uncertainty ? 'uncertain' : 'in_progress');
    console.log(`t=${t} pending=${cid} tries=${rec.tries} fol=${rec.followups} core=${rec.core_answer} status=${move}`);
    if (res.completed) { console.log('DONE tier=', res.report.tier); break; }
  }
})().catch(e => { console.error(e); process.exit(1); });
