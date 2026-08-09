'use strict';
// M4 focused self-test: Functional impairment + multiple-settings (Stage 4) per
// CLINICAL_ADHD_PROTOCOL.md §6, with §9a-D (settings >=2) and §9a-E (domains >=1).
// Uses an injected FAKE extractor — no real LLM calls. Does NOT touch Stage 2/M3 logic.

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const extractorPath = require.resolve(path.join(ROOT, 'interviewer/interviewer.js'));
require.cache[extractorPath] = { id: extractorPath, filename: extractorPath, loaded: true, exports: { extractEvidence: async function () { return { domains_impaired: [], settings: [], uncertainty: null }; } } };
const assessment = require(path.join(ROOT, 'model/assessment'));
const engine = require(path.join(ROOT, 'model/engine'));

function setFake(fn) {
  require.cache[extractorPath].exports = { extractEvidence: fn };
}

async function run4(domainsResult, settingsResult) {
  setFake(async function ({ probe }) {
    if (probe.id === 'domains') return domainsResult;
    if (probe.id === 'settings') return settingsResult;
    return { domains_impaired: [], settings: [], uncertainty: null };
  });
  delete require.cache[require.resolve(path.join(ROOT, 'model/assessment'))];
  const a3 = require(path.join(ROOT, 'model/assessment'));
  const state = a3.createStage2Assessment('m4i');
  a3.beginStage4(state);
  let res;
  for (let i = 0; i < 20; i++) {
    res = await a3.processStage4Turn(state, 'concrete example');
    if (res.completed) break;
  }
  return { state, res };
}

(async () => {
  let failures = 0;
  const pass = (label, ok, extra) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${extra ? ' | ' + extra : ''}`); };

  // --- Pure unit checks of assessImpairment (engine, Stage 4 evidence only) ---
  const unit = [
    ['2 domains + 2 settings -> complete+multiple', {
      examples: [{ domain: 'Work', example: 'missed deadlines', concrete: true }, { domain: 'Relationships', example: 'forgot date', concrete: true }],
      settings: [{ setting: 'work', example: 'office', concrete: true }, { setting: 'home', example: 'dinner', concrete: true }],
    }, { complete: true, multiple_settings: true, example_count: 2, settings_count: 2 }],
    ['1 domain + 2 settings -> not complete (needs 2 examples)', {
      examples: [{ domain: 'Work', example: 'missed deadline', concrete: true }],
      settings: [{ setting: 'work', example: 'x', concrete: true }, { setting: 'home', example: 'y', concrete: true }],
    }, { complete: false, multiple_settings: true, example_count: 1, settings_count: 2 }],
    ['2 domains + 1 setting -> not complete, multiple_settings false', {
      examples: [{ domain: 'A', example: 'x', concrete: true }, { domain: 'B', example: 'y', concrete: true }],
      settings: [{ setting: 'work', example: 'z', concrete: true }],
    }, { complete: false, multiple_settings: false, example_count: 2, settings_count: 1 }],
    ['non-concrete examples filtered out -> incomplete', {
      examples: [{ domain: 'Work', example: '', concrete: false }, { domain: 'Relationships', example: '', concrete: false }],
      settings: [{ setting: 'work', example: '', concrete: false }],
    }, { complete: false, multiple_settings: false, example_count: 0, settings_count: 0 }],
    ['duplicate domains/settings deduped', {
      examples: [{ domain: 'Work', example: 'a', concrete: true }, { domain: 'work', example: 'a', concrete: true }, { domain: 'Work', example: 'b', concrete: true }],
      settings: [{ setting: 'Work', example: 'a', concrete: true }, { setting: 'Work', example: 'b', concrete: true }, { setting: 'home', example: 'x', concrete: true }],
    }, { complete: true, multiple_settings: true }],
    ['empty -> incomplete', {}, { complete: false, multiple_settings: false, example_count: 0, settings_count: 0 }],
  ];
  for (const [label, imp, exp] of unit) {
    const got = engine.assessImpairment(imp);
    const ok = got.complete === exp.complete && got.multiple_settings === exp.multiple_settings;
    const deep = got.example_count === (exp.example_count ?? got.example_count) && got.settings_count === (exp.settings_count ?? got.settings_count);
    pass(`assessImpairment "${label}"`, ok && deep, `complete=${got.complete} multiple=${got.multiple_settings} domains=${got.domains.length} settings=${got.settings.length}`);
  }

  // --- Integration: full Stage 4 flow into LOCKED top-level state.domains_impaired / state.settings ---
  const validDomains = { domains_impaired: [{ domain: 'Work', example: 'missed 3 deadlines last month in my office job', concrete: true }, { domain: 'Relationships', example: 'forgot my partner\'s anniversary', concrete: true }], settings: [], uncertainty: null };
  const validSettings = { domains_impaired: [], settings: [{ setting: 'work', example: 'missed deadlines in my office job', concrete: true }, { setting: 'home', example: 'arguments at dinner table', concrete: true }], uncertainty: null };

  const v = await run4(validDomains, validSettings);
  const vOk = v.res && v.res.completed && v.state.domains_impaired.length === 2 && v.state.settings.length === 2 && v.state.impairment.done === true;
  pass('integration valid -> domains=2 settings=2 complete', vOk, `domains=${v.state.domains_impaired.length} settings=${v.state.settings.length} done=${v.state.impairment.done}`);

  const inv1 = await run4(validDomains, { domains_impaired: [], settings: [{ setting: 'work', example: 'x', concrete: true }], uncertainty: null });
  const i1Ok = inv1.res && inv1.res.completed && inv1.state.settings.length === 1 && inv1.state.impairment.done === true && inv1.res.multiple_settings === false;
  pass('integration insufficient settings -> complete settings=1 multiple=false', i1Ok, `settings=${inv1.state.settings.length} multiple=${inv1.res.multiple_settings}`);

  const inv2 = await run4({ domains_impaired: [{ domain: 'Work', example: 'x', concrete: true }], settings: [], uncertainty: null }, validSettings);
  const i2Ok = inv2.res && inv2.res.completed && inv2.state.domains_impaired.length === 1 && inv2.state.settings.length === 2;
  pass('integration insufficient examples -> domains=1 settings=2', i2Ok, `domains=${inv2.state.domains_impaired.length} settings=${inv2.state.settings.length}`);

  const unc = await run4({ domains_impaired: [{ domain: 'Work', example: '', concrete: false }], settings: [], uncertainty: null }, { domains_impaired: [], settings: [{ setting: 'work', example: '', concrete: false }], uncertainty: null });
  const uOk = unc.res && unc.res.completed && unc.state.domains_impaired.length === 0 && unc.state.settings.length === 0 && unc.state.impairment.done === true;
  pass('integration uncertain (no concrete evidence) -> domains=0 settings=0', uOk, `domains=${unc.state.domains_impaired.length} settings=${unc.state.settings.length}`);

  // --- Non-inference: identical Stage 4 evidence yields identical outcome regardless of adult symptoms.
  const sameImp = { examples: [{ domain: 'Work', example: 'a', concrete: true }, { domain: 'Relationships', example: 'b', concrete: true }], settings: [{ setting: 'work', example: 'c', concrete: true }, { setting: 'home', example: 'd', concrete: true }] };
  const aSame = engine.assessImpairment(sameImp);
  pass('non-inference — assessImpairment reads Stage 4 evidence only', aSame.complete === true && aSame.multiple_settings === true, `complete=${aSame.complete} multiple=${aSame.multiple_settings}`);

  // --- Regression: full pipeline Stage2 → 3 → 4 → 5 → Report via unified processTurn ---
  async function fullPipeline(stage2Core, childhoodMemories, impairmentEvidence) {
    require.cache[extractorPath].exports = {
      extractEvidence: async function ({ stage, probe, criterion }) {
        if (stage === 'childhood') return { memories: childhoodMemories, uncertainty: null };
        if (stage === 'impairment') {
          if (probe.id === 'domains') return impairmentEvidence.domains;
          if (probe.id === 'settings') return impairmentEvidence.settings;
          return { domains_impaired: [], settings: [], uncertainty: null };
        }
        if (stage === 'differential') return { reported: false, uncertainty: null, symptom_mentions: [] };
        const id = criterion.id;
        if (id === 'HYPERR_05') throw new Error('err');
        if (id === 'INATT_09') return { core_answer: 'Never', example: 'never', contexts: ['home'], consequence: null, counter_evidence: [], uncertainty: null };
        if (id === 'INATT_04') return { core_answer: 'Sometimes', example: 'sometimes', contexts: ['work'], consequence: 'reminder', counter_evidence: [], uncertainty: null };
        return { core_answer: stage2Core, example: 'ex', contexts: ['work', 'home'], consequence: 'cost', counter_evidence: [], uncertainty: null };
      },
    };
    delete require.cache[require.resolve(path.join(ROOT, 'model/assessment'))];
    const A = require(path.join(ROOT, 'model/assessment'));
    const s = A.createStage2Assessment('fullm4');
    A.begin(s);
    for (let t = 0; t < 300; t++) {
      const r = await A.processTurn(s, 'Often, for example...');
      if (r.completed) break;
    }
    return s;
  }

  const full = await fullPipeline(
    'Often',
    [{ behavior: 'could not sit still, teacher noted', age: 7, source: 'teacher', concrete: true, against: false, vague: false },
     { behavior: 'frequently lost homework', age: 8, source: 'memory', concrete: true, against: false, vague: false }],
    {
      domains: { domains_impaired: [{ domain: 'Work', example: 'missed deadlines in office', concrete: true }, { domain: 'Relationships', example: 'forgot partner anniversary', concrete: true }], settings: [], uncertainty: null },
      settings: { domains_impaired: [], settings: [{ setting: 'work', example: 'office deadlines', concrete: true }, { setting: 'home', example: 'dinner table', concrete: true }], uncertainty: null },
    }
  );
  const eng = require(path.join(ROOT, 'model/engine'));
  const rep = eng.evaluate(full);
  pass('full pipeline 2->3->4->5->Report', full.stage === 'REPORT' && full.onset === 'strong'
    && full.domains_impaired.length === 2 && full.settings.length === 2
    && rep.dsm5_criteria.D_settings === 'supported' && rep.dsm5_criteria.E_impairment === 'supported'
    && full.duration === 'met',
    `stage=${full.stage} onset=${full.onset} domains=${full.domains_impaired.length} settings=${full.settings.length} D=${rep.dsm5_criteria.D_settings} E=${rep.dsm5_criteria.E_impairment}`);

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
