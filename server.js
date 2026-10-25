'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const { append, verifyChain, payloadHash } = require('./lib/ledger');
const { eligible } = require('./lib/eligibility');
const { validateProfile } = require('./lib/validate');
const { loadGraph, extractSkills, recommend } = require('./lib/skills');
const { initialStore } = require('./lib/seed');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const COLORS = ['peach', 'lavender', 'mint', 'blue'];
const DAY = 24 * 60 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

// What is sealed into an entitlement's ledger hash. Status changes later, so it is not part of the seal.
const claimSeal = c => ({ id: c.id, opportunityId: c.opportunityId, studentId: c.studentId, amount: c.amount, date: c.date });
const initials = name => name.split(/\s+/).filter(Boolean).map(x => x[0]).join('').slice(0, 2).toUpperCase();

function createApp({ storePath = path.join(ROOT, 'data', 'store.json'), graphPath = path.join(ROOT, 'data', 'skill-graph.json'), now = () => Date.now() } = {}) {
  const graph = loadGraph(JSON.parse(fs.readFileSync(graphPath, 'utf8')));

  function readStore() {
    try {
      const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      if (data && data.version === 2 && Array.isArray(data.students) && Array.isArray(data.chain)) return data;
    } catch { /* missing or unreadable: start fresh below */ }
    const fresh = initialStore();
    saveStore(fresh);
    return fresh;
  }
  // Write to a temp file then rename, so a crash mid-write never leaves a half-written store.
  function saveStore(data) {
    const tmp = storePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, storePath);
  }
  const db = readStore();

  const findStudent = id => {
    const s = db.students.find(x => x.id === id);
    if (!s) throw new HttpError(404, 'Student not found');
    return s;
  };
  const studentClaims = id => db.claims.filter(c => c.studentId === id);
  const matchesFor = s => db.opportunities.map(o => ({ ...o, ...eligible(s, o), claimed: db.claims.some(c => c.opportunityId === o.id && c.studentId === s.id) }));
  const openMatches = s => matchesFor(s).filter(o => o.eligible && !o.claimed);

  function rosterRow(s) {
    const open = openMatches(s);
    const soon = open.filter(o => new Date(o.deadline).getTime() - now() <= 14 * DAY && new Date(o.deadline).getTime() >= now());
    const status = soon.length ? `${soon.length} deadline${soon.length > 1 ? 's' : ''} within 14 days`
      : open.length ? `${open.length} open match${open.length > 1 ? 'es' : ''}` : 'Needs a check-in';
    return { id: s.id, name: s.name, district: s.district, classLevel: s.classLevel, status, openMatches: open.length, dueSoon: soon.length, initials: initials(s.name), color: s.color };
  }

  function facilitatorSummary() {
    const rows = db.students.map(rosterRow);
    const upcoming = db.opportunities.filter(o => new Date(o.deadline).getTime() >= now()).sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
    return {
      students: rows.length,
      openMatches: rows.reduce((a, r) => a + r.openMatches, 0),
      dueSoon: rows.filter(r => r.dueSoon > 0).length,
      nextDeadline: upcoming ? { id: upcoming.id, title: upcoming.title, deadline: upcoming.deadline,
        qualifying: db.students.filter(s => eligible(s, upcoming).eligible && !db.claims.some(c => c.opportunityId === upcoming.id && c.studentId === s.id)).length } : null
    };
  }

  function bootstrap(studentId) {
    const s = findStudent(studentId || db.students[0].id);
    const matches = matchesFor(s);
    const ledger = db.chain.filter(e => e.subject === s.id).slice().reverse();
    const fields = ['name', 'age', 'gender', 'district', 'classLevel', 'annualIncome', 'category', 'marks', 'skills', 'interests'];
    const filled = fields.filter(f => Array.isArray(s[f]) ? s[f].length : s[f] !== null && s[f] !== undefined && s[f] !== '').length;
    return {
      profile: s,
      opportunities: matches,
      claims: studentClaims(s.id),
      ledger,
      chain: verifyChain(db.chain),
      orgs: db.orgs,
      careers: recommend(graph, s),
      students: db.students.map(rosterRow),
      facilitator: facilitatorSummary(),
      summary: {
        matched: matches.filter(o => o.eligible).length,
        value: matches.filter(o => o.eligible && !o.claimed).reduce((a, o) => a + o.amount, 0),
        verified: ledger.filter(x => x.status === 'Verified').length,
        completeness: Math.round((filled / fields.length) * 100)
      }
    };
  }

  function updateProfile(studentId, input) {
    const s = findStudent(studentId);
    const { value, errors } = validateProfile(input, { partial: true });
    if (errors.length) throw new HttpError(422, 'Some profile details need fixing', errors);
    Object.assign(s, value, { updatedAt: new Date(now()).toISOString() });
    append(db.chain, { type: 'Consent recorded', subject: s.id, detail: 'Student profile updated · consent recorded', status: 'Recorded', payload: { studentId: s.id, fields: Object.keys(value).sort(), at: s.updatedAt } });
    saveStore(db);
    return s;
  }

  function addStudent(input) {
    const required = ['name', 'age', 'gender', 'district', 'classLevel'];
    const { value, errors } = validateProfile(input, { partial: true, required });
    if (errors.length) throw new HttpError(422, 'Some student details need fixing', errors);
    const max = db.students.reduce((m, s) => Math.max(m, Number(s.id.split('-').pop()) || 0), 0);
    const s = { id: `STU-AP-${String(max + 1).padStart(5, '0')}`, state: 'Andhra Pradesh', annualIncome: null, category: 'Prefer not to say', marks: null,
      interests: [], skills: [], language: 'Telugu', ...value, color: COLORS[db.students.length % COLORS.length], updatedAt: new Date(now()).toISOString() };
    db.students.push(s);
    append(db.chain, { type: 'Consent recorded', subject: s.id, detail: 'Student enrolled by facilitator · guardian consent recorded', status: 'Recorded', payload: { studentId: s.id, at: s.updatedAt } });
    saveStore(db);
    return s;
  }

  function createClaim({ studentId, opportunityId }) {
    const s = findStudent(studentId);
    const opp = db.opportunities.find(o => o.id === opportunityId);
    if (!opp) throw new HttpError(404, 'Opportunity not found');
    const result = eligible(s, opp);
    if (!result.eligible) throw new HttpError(422, 'Not eligible yet', result.reasons.map(r => ({ field: 'eligibility', issue: r })));
    if (db.claims.some(c => c.opportunityId === opp.id && c.studentId === s.id)) throw new HttpError(409, 'This entitlement has already been claimed.');
    const claim = { id: `ENT-${String(db.claims.length + 1).padStart(5, '0')}`, opportunityId: opp.id, opportunity: opp.title, studentId: s.id, student: s.name,
      amount: opp.amount, status: 'Application started', date: new Date(now()).toISOString(), singleUse: true, attestations: [] };
    db.claims.push(claim);
    append(db.chain, { type: 'Entitlement created', subject: s.id, detail: `${opp.title} · ₹${opp.amount.toLocaleString('en-IN')} · single-use`, status: 'Verified', ref: claim.id, org: 'org-authority', payload: claimSeal(claim) });
    saveStore(db);
    return claim;
  }

  function attest({ claimId, orgId }) {
    const claim = db.claims.find(c => c.id === claimId);
    if (!claim) throw new HttpError(404, 'Entitlement not found.');
    const org = db.orgs.find(o => o.id === orgId);
    if (!org) throw new HttpError(422, 'Unknown organisation.');
    if (!org.canAttest) throw new HttpError(403, `${org.role}s cannot attest milestones.`);
    if (claim.attestations.some(a => a.orgId === orgId)) throw new HttpError(409, `${org.name} has already attested this milestone. A second, different organisation must confirm it.`);
    if (claim.attestations.length >= 2) throw new HttpError(409, 'This milestone is already verified.');
    const attestation = { claimId, orgId, date: new Date(now()).toISOString() };
    claim.attestations.push({ orgId, org: org.name, date: attestation.date });
    const verified = claim.attestations.length >= 2;
    claim.status = verified ? 'Milestone verified · release approved' : 'Awaiting second attestation';
    append(db.chain, { type: 'Milestone attested', subject: claim.studentId, detail: `${claim.opportunity} · attested by ${org.name} (${claim.attestations.length} of 2)`, status: verified ? 'Verified' : 'Recorded', ref: claim.id, org: orgId, payload: attestation });
    saveStore(db);
    return claim;
  }

  function verify(token) {
    const t = String(token || '').trim().toUpperCase();
    if (!t) throw new HttpError(422, 'Enter a credential, entitlement or transaction ID.');
    const chain = verifyChain(db.chain);
    let entry = db.chain.find(e => e.id === t);
    const ref = entry ? entry.ref : t;
    const cred = db.credentials.find(c => c.id === ref);
    const claim = db.claims.find(c => c.id === ref);
    const doc = cred || (claim && claimSeal(claim));
    if (!doc) return { valid: false, message: 'No matching credential or entitlement was found. Check the ID and try again.', chain };
    if (!entry || !entry.ref) entry = db.chain.find(e => e.ref === ref && (e.type === 'Credential issued' || e.type === 'Entitlement created'));
    const checks = [
      { label: 'Record is anchored on the ledger', ok: !!entry },
      { label: 'Document matches its sealed hash', ok: !!entry && entry.payloadHash === payloadHash(doc) },
      { label: 'Ledger chain is intact', ok: chain.valid }
    ];
    if (cred) checks.push({ label: 'Not revoked', ok: !cred.revoked });
    const valid = checks.every(c => c.ok);
    const orgName = id => (db.orgs.find(o => o.id === id) || {}).name;
    return {
      valid, checks, chain,
      message: valid ? undefined : 'This record failed verification. It may have been altered or revoked.',
      credential: cred
        ? { id: cred.id, kind: 'Credential', holder: cred.holder, title: cred.title, issuer: orgName(cred.issuerOrg), issued: cred.issued, txId: entry && entry.id, hash: entry && entry.hash }
        : { id: claim.id, kind: 'Entitlement', holder: claim.student, title: claim.opportunity, amount: claim.amount, status: claim.status, issued: claim.date, txId: entry && entry.id, hash: entry && entry.hash }
    };
  }

  function body(req) {
    return new Promise((resolve, reject) => {
      let s = '';
      req.on('data', c => { s += c; if (s.length > 1e6) { reject(new HttpError(413, 'Request too large')); req.destroy(); } });
      req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { reject(new HttpError(400, 'Invalid JSON')); } });
      req.on('error', reject);
    });
  }
  function send(res, code, payload) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(payload));
  }

  const routes = {
    'GET /api/bootstrap': (req, url) => [200, bootstrap(url.searchParams.get('student'))],
    'POST /api/profile': async (req, url) => { const input = await body(req); return [200, { ok: true, profile: updateProfile(url.searchParams.get('student') || input.studentId, input) }]; },
    'POST /api/students': async req => [201, { ok: true, student: addStudent(await body(req)) }],
    'POST /api/claims': async req => [201, { ok: true, claim: createClaim(await body(req)) }],
    'POST /api/milestone': async req => [200, { ok: true, claim: attest(await body(req)) }],
    'POST /api/verify': async req => [200, verify((await body(req)).token)],
    'POST /api/skills/extract': async req => {
      const ids = extractSkills(graph, (await body(req)).text);
      return [200, { skills: ids.map(id => graph.skillById.get(id).label) }];
    }
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        const handler = routes[`${req.method} ${url.pathname}`];
        if (!handler) throw new HttpError(404, 'API route not found');
        const [code, payload] = await handler(req, url);
        return send(res, code, payload);
      }
      const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const full = path.resolve(PUBLIC, file);
      if (!full.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
      fs.readFile(full, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' }[path.extname(full)] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
      });
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, details: e.details });
      console.error(e);
      send(res, 500, { error: 'Something went wrong on our side.' });
    }
  });
  return { server, db };
}

if (require.main === module) {
  const PORT = Number(process.env.PORT || 3000);
  createApp().server.listen(PORT, () => console.log(`Dhaari prototype running at http://localhost:${PORT}`));
}

module.exports = { createApp };
