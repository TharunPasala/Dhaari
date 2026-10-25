'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server');
const { append, verifyChain, payloadHash } = require('../lib/ledger');
const { eligible } = require('../lib/eligibility');
const { validateProfile } = require('../lib/validate');

// Fixed clock: 20 Nov 2026, so the 30 Nov deadline is "within 14 days".
const NOW = Date.parse('2026-11-20T00:00:00Z');

async function start() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhaari-'));
  const storePath = path.join(dir, 'store.json');
  const app = createApp({ storePath, now: () => NOW });
  await new Promise(r => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  return { app, call, storePath, stop: () => new Promise(r => app.server.close(r)) };
}

test('ledger: hashes are content-derived and tampering is detected', () => {
  const chain = [];
  append(chain, { type: 'A', subject: 'S1', detail: 'one', status: 'Recorded', payload: { x: 1 }, date: '2026-01-01T00:00:00Z' });
  append(chain, { type: 'B', subject: 'S1', detail: 'two', status: 'Verified', payload: { x: 2 }, date: '2026-01-02T00:00:00Z' });
  const again = [];
  append(again, { type: 'A', subject: 'S1', detail: 'one', status: 'Recorded', payload: { x: 1 }, date: '2026-01-01T00:00:00Z' });
  assert.equal(again[0].hash, chain[0].hash, 'same content gives the same hash');
  assert.equal(chain[1].prevHash, chain[0].hash, 'records are linked');
  assert.equal(verifyChain(chain).valid, true);
  chain[0].detail = 'edited';
  const r = verifyChain(chain);
  assert.equal(r.valid, false);
  assert.equal(r.brokenAt, 0);
});

test('payloadHash ignores key order', () => {
  assert.equal(payloadHash({ a: 1, b: 2 }), payloadHash({ b: 2, a: 1 }));
});

test('eligibility: missing income never passes an income rule', () => {
  const opp = { rules: { maxIncome: 250000 } };
  assert.equal(eligible({ annualIncome: null }, opp).eligible, false);
  assert.equal(eligible({ annualIncome: 0 }, opp).eligible, true);
});

test('validation rejects bad profile values with field messages', () => {
  const { errors } = validateProfile({ age: 'abc', annualIncome: -5, marks: 120, gender: 'X' }, { partial: true });
  assert.deepEqual(errors.map(e => e.field).sort(), ['age', 'annualIncome', 'gender', 'marks']);
});

test('API: bootstrap shows real counts, no inflated numbers', async t => {
  const s = await start(); t.after(s.stop);
  const r = await s.call('GET', '/api/bootstrap');
  assert.equal(r.status, 200);
  assert.equal(r.body.facilitator.students, 4);
  assert.equal(r.body.students.length, 4);
  assert.equal(r.body.chain.valid, true);
  assert.ok(r.body.careers.length > 0);
  assert.ok(r.body.careers.every(c => /^\d{4}$/.test(c.code)));
});

test('API: profile update rejects invalid input and saves nothing', async t => {
  const s = await start(); t.after(s.stop);
  const bad = await s.call('POST', '/api/profile?student=STU-AP-02418', { age: 'abc', annualIncome: -5 });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.details.length, 2);
  const after = await s.call('GET', '/api/bootstrap?student=STU-AP-02418');
  assert.equal(after.body.profile.age, 16);
});

test('API: claims are eligibility-gated and single-use', async t => {
  const s = await start(); t.after(s.stop);
  const ok = await s.call('POST', '/api/claims', { studentId: 'STU-AP-02418', opportunityId: 'opp-02' });
  assert.equal(ok.status, 201);
  const dup = await s.call('POST', '/api/claims', { studentId: 'STU-AP-02418', opportunityId: 'opp-02' });
  assert.equal(dup.status, 409);
  const notEligible = await s.call('POST', '/api/claims', { studentId: 'STU-AP-02418', opportunityId: 'opp-04' });
  assert.equal(notEligible.status, 422);
  const boy = await s.call('POST', '/api/claims', { studentId: 'STU-AP-02391', opportunityId: 'opp-02' });
  assert.equal(boy.status, 422, 'girls-only scheme rejects a male student');
});

test('API: milestone needs two different attesting organisations', async t => {
  const s = await start(); t.after(s.stop);
  const { body: { claim } } = await s.call('POST', '/api/claims', { studentId: 'STU-AP-02418', opportunityId: 'opp-01' });
  assert.equal((await s.call('POST', '/api/milestone', { claimId: claim.id, orgId: 'org-bank' })).status, 403);
  assert.equal((await s.call('POST', '/api/milestone', { claimId: claim.id, orgId: 'org-fake' })).status, 422);
  const first = await s.call('POST', '/api/milestone', { claimId: claim.id, orgId: 'org-school' });
  assert.equal(first.body.claim.status, 'Awaiting second attestation');
  assert.equal((await s.call('POST', '/api/milestone', { claimId: claim.id, orgId: 'org-school' })).status, 409);
  const second = await s.call('POST', '/api/milestone', { claimId: claim.id, orgId: 'org-training' });
  assert.equal(second.body.claim.status, 'Milestone verified · release approved');
  assert.equal((await s.call('POST', '/api/milestone', { claimId: claim.id, orgId: 'org-employer' })).status, 409);
});

test('API: verify recomputes hashes and catches a tampered credential', async t => {
  const s = await start(); t.after(s.stop);
  const good = await s.call('POST', '/api/verify', { token: 'CRED-AP-0001' });
  assert.equal(good.body.valid, true);
  assert.ok(good.body.checks.every(c => c.ok));
  const byTx = await s.call('POST', '/api/verify', { token: good.body.credential.txId });
  assert.equal(byTx.body.valid, true, 'a transaction ID resolves to its credential');
  // Someone edits the marks in the off-chain store: the sealed hash no longer matches.
  s.app.db.credentials[0].fields.marks = 99;
  const bad = await s.call('POST', '/api/verify', { token: 'CRED-AP-0001' });
  assert.equal(bad.body.valid, false);
  assert.equal(bad.body.checks.find(c => c.label.startsWith('Document')).ok, false);
  const missing = await s.call('POST', '/api/verify', { token: 'CRED-NOPE' });
  assert.equal(missing.body.valid, false);
});

test('API: facilitator can add a student, with validation', async t => {
  const s = await start(); t.after(s.stop);
  const bad = await s.call('POST', '/api/students', { name: '', age: 4 });
  assert.equal(bad.status, 422);
  const ok = await s.call('POST', '/api/students', { name: 'Ravi Teja', age: 16, gender: 'Male', district: 'Guntur', classLevel: 10 });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.student.id, 'STU-AP-02438');
  const boot = await s.call('GET', `/api/bootstrap?student=${ok.body.student.id}`);
  assert.equal(boot.body.facilitator.students, 5);
  assert.equal(boot.body.profile.name, 'Ravi Teja');
  assert.ok(boot.body.opportunities.find(o => o.id === 'opp-01').reasons.some(r => r.includes('income')), 'missing income is flagged, not assumed zero');
});

test('API: skill extraction maps free text to graph skills', async t => {
  const s = await start(); t.after(s.stop);
  const r = await s.call('POST', '/api/skills/extract', { text: 'I fix phones for neighbours and keep accounts at my uncle\'s kirana shop' });
  assert.ok(r.body.skills.includes('Phone and electronics repair'));
  assert.ok(r.body.skills.includes('Bookkeeping'));
  assert.ok(r.body.skills.includes('Running a small business'));
});

test('API: facilitator summary counts deadlines within 14 days', async t => {
  const s = await start(); t.after(s.stop);
  const r = await s.call('GET', '/api/bootstrap');
  assert.equal(r.body.facilitator.nextDeadline.id, 'opp-02');
  assert.ok(r.body.facilitator.dueSoon >= 1);
});

test('static files cannot escape the public folder', async t => {
  const s = await start(); t.after(s.stop);
  const res = await fetch(`http://127.0.0.1:${s.app.server.address().port}/..%2fserver.js`);
  assert.notEqual(res.status, 200);
});
