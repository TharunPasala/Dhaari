'use strict';
// Tamper-evident, hash-chained ledger used as a local stand-in for DRUNIX.
// Every hash is derived only from content, so anyone can recompute and check it.
const crypto = require('crypto');

const GENESIS = '0'.repeat(64);

// Stable JSON: object keys sorted, so the same content always gives the same hash.
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const payloadHash = obj => sha256(canonical(obj));

// The fields that are sealed into an entry's hash.
function sealedFields(e) {
  return { seq: e.seq, id: e.id, type: e.type, subject: e.subject, detail: e.detail,
    status: e.status, date: e.date, ref: e.ref, payloadHash: e.payloadHash, org: e.org, prevHash: e.prevHash };
}
const entryHash = e => sha256(canonical(sealedFields(e)));

// chain is stored oldest-first.
function append(chain, { type, subject, detail, status, ref, payload, org, date }) {
  const prev = chain[chain.length - 1];
  const seq = chain.length;
  const entry = {
    seq, id: `TX-${String(seq + 1).padStart(6, '0')}`, type, subject, detail, status,
    date: date || new Date().toISOString(), ref: ref || null,
    payloadHash: payload === undefined ? null : payloadHash(payload), org: org || null,
    prevHash: prev ? prev.hash : GENESIS
  };
  entry.hash = entryHash(entry);
  chain.push(entry);
  return entry;
}

// Recompute every link. Returns the first broken position, if any.
function verifyChain(chain) {
  for (let i = 0; i < chain.length; i++) {
    const e = chain[i];
    const expectedPrev = i === 0 ? GENESIS : chain[i - 1].hash;
    if (e.seq !== i) return { valid: false, brokenAt: i, reason: 'Sequence number out of order' };
    if (e.prevHash !== expectedPrev) return { valid: false, brokenAt: i, reason: 'Link to previous record is broken' };
    if (entryHash(e) !== e.hash) return { valid: false, brokenAt: i, reason: 'Record content was changed after it was sealed' };
  }
  return { valid: true, length: chain.length, head: chain.length ? chain[chain.length - 1].hash : GENESIS };
}

module.exports = { GENESIS, canonical, sha256, payloadHash, entryHash, append, verifyChain };
