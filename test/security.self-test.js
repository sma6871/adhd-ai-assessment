'use strict';
// Security self-test: path-traversal containment for session IDs.
// Covers:
//   - The exact PoC (importSession + snapshot with a traversal id) is rejected
//   - All rejection cases (empty, null, undefined, non-string, ../, absolute,
//     nested, backslash, URL-encoded, null bytes, >64 chars, special chars)
//     for BOTH importSession and the /api/session/reset HTTP path
//   - Valid id still round-trips: snapshot -> loadSnapshot -> clearSnapshot
//   - crypto.randomUUID() output is accepted by the validator
//   - clearSnapshot cannot delete a file outside data/

const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const assessment = require(path.join(ROOT, 'model/assessment'));

let failures = 0;
const pass = (label, ok, extra) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${extra ? ' | ' + extra : ''}`); };

// --- Rejection cases for isValidSessionId + importSession ---
const BAD_IDS = [
  ['empty string', ''],
  ['null', null],
  ['undefined', undefined],
  ['number', 123],
  ['object', {}],
  ['array', ['id']],
  ['boolean', true],
  ['../ traversal', '../../../tmp/PWNED'],
  ['deep ../', '../../data/../../tmp/PWNED'],
  ['absolute path', '/etc/passwd'],
  ['absolute /tmp', '/tmp/evil'],
  ['nested path', 'a/b'],
  ['backslash traversal', '..\\..\\evil'],
  ['URL-encoded ../', '%2e%2e%2f'],
  ['null byte', 'a\0b'],
  ['over 64 chars', 'A'.repeat(65)],
  ['dot', 'foo.bar'],
  ['space', 'foo bar'],
  ['quote', 'foo"bar'],
  ['semicolon', 'foo;bar'],
  ['pipe', 'a|b'],
  ['star', 'a*b'],
];

// --- HTTP helper ---
function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1', port, method, path: urlPath,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } : {},
    };
    const req = http.request(opts, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); } catch (e) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// Test: the exact PoC is rejected (importSession returns invalid_format, no file created)
function testPoC() {
  const traversalId = '../../../tmp/PWNED_SECURITY_TEST';
  const pwnedPath = path.resolve(ROOT, 'tmp', 'PWNED_SECURITY_TEST.json');
  // Ensure clean state
  try { fs.unlinkSync(pwnedPath); } catch (e) {}
  try { fs.mkdirSync(path.dirname(pwnedPath), { recursive: true }); } catch (e) {}

  const result = assessment.importSession({ version: 1, session: { id: traversalId, lang: 'en' } });
  pass('PoC: importSession rejects traversal id with invalid_format', result.error === 'invalid_format', `error=${result.error}`);
  pass('PoC: importSession returns no state', result.state === null);

  if (result.state) {
    assessment.snapshot(result.state);
  }
  pass('PoC: no file created outside data/ at expected traversal target', !fs.existsSync(pwnedPath));

  // Also confirm snapshot() itself refuses (defense in depth)
  const dummyState = assessment.createStage2Assessment(traversalId, 'en');
  assessment.snapshot(dummyState);
  pass('PoC: snapshot() refuses traversal id (defense-in-depth)', !fs.existsSync(pwnedPath));

  // Cleanup
  try { fs.unlinkSync(pwnedPath); } catch (e) {}
  try { fs.rmdirSync(path.dirname(pwnedPath)); } catch (e) {}
}

// Test: all BAD_IDS rejected by isValidSessionId
function testValidatorRejectsAll() {
  for (const [label, badId] of BAD_IDS) {
    pass(`validator rejects ${label}`, !assessment.isValidSessionId(badId), `id=${JSON.stringify(badId)}`);
  }
}

// Test: importSession rejects all BAD_IDS
function testImportSessionRejectsAll() {
  for (const [label, badId] of BAD_IDS) {
    const result = assessment.importSession({ version: 1, session: { id: badId, lang: 'en' } });
    pass(`importSession rejects ${label}`, result.error === 'invalid_format', `id=${JSON.stringify(badId)} error=${result.error}`);
  }
}

// Test: valid ids are accepted
function testValidatorAcceptsValid() {
  pass('validator accepts short alphanumeric id', assessment.isValidSessionId('a1b2c3'));
  pass('validator accepts crypto.randomUUID() output', assessment.isValidSessionId('60d25992-6b37-4f87-8a3a-9d9e2e4b6d88'), `len=${'60d25992-6b37-4f87-8a3a-9d9e2e4b6d88'.length}`);
  pass('validator accepts underscores and hyphens', assessment.isValidSessionId('my_session-id_123'));
  pass('validator accepts 64-char id (max boundary)', assessment.isValidSessionId('A'.repeat(64)));
  pass('validator rejects 65-char id (over max)', !assessment.isValidSessionId('A'.repeat(65)));
}

// Test: valid id round-trips through snapshot/loadSnapshot/clearSnapshot
function testValidRoundTrip() {
  const id = 'roundtrip-test-123';
  const state = assessment.createStage2Assessment(id, 'en');
  assessment.snapshot(state);
  pass('snapshot writes to correct location', assessment.snapshotExists(id));

  const loaded = assessment.loadSnapshot(id);
  pass('loadSnapshot returns the state', loaded !== null && loaded.id === id);
  pass('loaded state has correct lang', loaded.lang === 'en');
  pass('loaded state has correct stage', loaded.stage === 'ADULT_SYMPTOMS');

  assessment.clearSnapshot(id);
  pass('clearSnapshot removes the file', !assessment.snapshotExists(id));
  pass('loadSnapshot returns null after clear', assessment.loadSnapshot(id) === null);
}

// Test: clearSnapshot cannot delete a file outside data/
function testClearSnapshotContainment() {
  // Create a temp file outside data/
  const outsidePath = path.join(path.dirname(ROOT), 'PWNED_CLEAR_TEST.json');
  fs.writeFileSync(outsidePath, 'should survive');

  // Attempt traversal id that would resolve to outsidePath
  const traversalId = '../PWNED_CLEAR_TEST';
  assessment.clearSnapshot(traversalId);

  pass('clearSnapshot does NOT delete a file outside data/', fs.existsSync(outsidePath));

  // Cleanup
  fs.unlinkSync(outsidePath);
}

// Test: /api/session/reset rejects invalid ids over HTTP
async function testResetEndpointRejectsAll() {
  const TEST_PORT = 3117;
  process.env.PORT = String(TEST_PORT);
  delete require.cache[require.resolve(path.join(ROOT, 'server'))];
  const server = require(path.join(ROOT, 'server'));
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));

  try {
    for (const [label, badId] of BAD_IDS) {
      const res = await request(TEST_PORT, 'POST', '/api/session/reset', { id: badId });
      // Empty/null/undefined hit "if (!id)" -> 'missing id' (400).
      // All other invalid types reach isValidSessionId -> 'invalid_id' (400).
      // Either way: 400 rejection.
      const rejected = res.status === 400 && (res.body.error === 'missing id' || res.body.error === 'invalid_id');
      pass(`HTTP reset rejects ${label} with 400`, rejected, `id=${JSON.stringify(badId)} status=${res.status} error=${res.body.error}`);
    }

    // Valid id: reset should work (no session exists, but should still return 200)
    const validId = 'reset-valid-456';
    const res = await request(TEST_PORT, 'POST', '/api/session/reset', { id: validId });
    pass('HTTP reset accepts valid id (200 reset:true)', res.status === 200 && res.body.reset === true, `status=${res.status}`);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

// Main
(async () => {
  testPoC();
  testValidatorRejectsAll();
  testImportSessionRejectsAll();
  testValidatorAcceptsValid();
  testValidRoundTrip();
  testClearSnapshotContainment();
  await testResetEndpointRejectsAll();

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
