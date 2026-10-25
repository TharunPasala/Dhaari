'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
let state = { profile: null, opportunities: [], ledger: [], claims: [], students: [], careers: [], orgs: [], summary: {}, facilitator: {}, chain: {} };
let currentFilter = 'all';
let studentId = (() => { try { return localStorage.getItem('dhaari.student') || ''; } catch { return ''; } })();

const money = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const dateFmt = d => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortHash = h => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : '');
const orgName = id => (state.orgs.find(o => o.id === id) || {}).name || id;

async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, ...opts });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong'), { details: data.details || [], status: res.status });
  return data;
}
function errorText(e) {
  return e.details && e.details.length ? `${e.message}: ${e.details.map(d => d.issue).join('; ')}` : e.message;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
}

function showView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === name));
  $('#crumbTitle').textContent = ({ home: 'My pathway', opportunities: 'Opportunities', ledger: 'Trust ledger', facilitator: 'Facilitator view', profile: 'Your profile' })[name] || 'My pathway';
  $('#sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'profile') fillProfileForm();
}
function opportunityIcon(o) { return o.type === 'Scholarship' ? '✿' : o.type === 'Apprenticeship' ? '⌘' : o.type === 'Competition' ? '✦' : '✳'; }

function render() {
  const p = state.profile, opps = state.opportunities;
  const open = opps.filter(o => o.eligible && !o.claimed);
  $('#sideName').textContent = p.name;
  $('#sideAvatar').textContent = p.name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
  $('#sideMeta').textContent = `Student · ${p.district}`;
  $('#placeLabel').textContent = `${p.district}, AP`.toUpperCase();
  $('#todayLabel').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
  $('#navMatchCount').textContent = open.length;
  $('#homeOpportunities').innerHTML = open.slice(0, 3).map((o, i) => `<article class="opp-card"><div class="opp-top"><span class="opp-icon ${i === 0 ? 'grant' : i === 1 ? '' : 'apprenticeship'}">${opportunityIcon(o)}</span><span class="deadline-tag">Closes ${dateFmt(o.deadline)}</span></div><h3>${esc(o.title)}</h3><div class="opp-org">${esc(o.org)} · ${esc(o.type)}</div><div class="opp-footer"><span class="opp-amount">${money(o.amount)} <small>potential support</small></span><button class="mini-action" data-claim="${esc(o.id)}">View match →</button></div></article>`).join('') || '<div class="empty-state">Update your profile to see new matches.</div>';
  $('#skillTags').innerHTML = (p.skills || []).slice(0, 4).map(s => `<span class="skill-chip">${esc(s)}</span>`).join('');
  $('#radarAmount').textContent = money(state.summary.value);
  $('#profileCompleteness').textContent = `${state.summary.completeness}%`;
  const matches = state.summary.matched;
  $('#matchSummary').textContent = `${matches} opportunit${matches === 1 ? 'y' : 'ies'} match your profile`;
  $('#matchValue').textContent = `Up to ${money(state.summary.value)} in support`;
  $('#allCount').textContent = opps.length;
  $('#eligibleCount').textContent = open.length;
  $('#claimedCount').textContent = state.claims.length;
  $('#ledgerVerified').textContent = state.summary.verified;
  $('#ledgerEntitlements').textContent = state.claims.length;
  renderCareers(); renderOpps(); renderLedger(); renderEntitlements(); renderFacilitator(); renderStudents($('#studentSearch').value);
}

function renderCareers() {
  $('#careerList').innerHTML = state.careers.map(c => `<article class="career-card"><span class="career-code">NCO ${esc(c.code)}</span><h3>${esc(c.title)}</h3><p>${esc(c.reason)}</p><ul>${c.nextSteps.map(s => `<li>${esc(s)}</li>`).join('')}</ul>${c.missingSkills.length ? `<div class="career-gap">Skill to build next: ${esc(c.missingSkills[0])}</div>` : ''}</article>`).join('') || '<div class="empty-state">Add a few skills to your profile and we will map them to careers.</div>';
}

function renderOpps() {
  let list = state.opportunities.slice();
  if (currentFilter === 'eligible') list = list.filter(o => o.eligible && !o.claimed);
  if (currentFilter === 'claimed') list = list.filter(o => o.claimed);
  if ($('#sortSelect').value === 'amount') list.sort((a, b) => b.amount - a.amount); else list.sort((a, b) => a.deadline.localeCompare(b.deadline));
  $('#opportunityList').innerHTML = list.map(o => {
    const claim = state.claims.find(c => c.opportunityId === o.id);
    const action = o.claimed ? `<button class="outline-button" disabled>Started · ${esc(claim ? claim.id : '')}</button>`
      : o.eligible ? `<button class="primary-small" data-claim="${esc(o.id)}">Start application →</button>`
      : '<button class="outline-button" disabled>Not eligible yet</button>';
    return `<article class="opportunity-row"><span class="row-icon">${opportunityIcon(o)}</span><div class="row-main"><div class="type-label">${esc(o.type)} · ${esc(o.org)}</div><h3>${esc(o.title)}</h3><p>${esc(o.description)}</p></div><div class="eligibility-cell ${o.eligible ? '' : 'no'}"><b>${o.eligible ? '✓ You meet the criteria' : 'Not a match yet'}</b>${o.eligible ? `Closes ${dateFmt(o.deadline)}` : esc(o.reasons[0] || 'Check the criteria')}</div><div class="row-action"><div class="opp-amount">${money(o.amount)} <small>support</small></div>${action}</div></article>`;
  }).join('') || '<div class="empty-state">Nothing here just yet. Your next opportunity may be around the corner.</div>';
}

function renderLedger() {
  const c = state.chain;
  $('#chainStatus').textContent = c.valid ? 'Chain verified' : 'Chain integrity problem';
  $('#chainStatus').classList.toggle('chain-bad', !c.valid);
  $('#chainDetail').textContent = c.valid ? `${c.length} records · head ${shortHash(c.head)}` : `Record ${c.brokenAt + 1}: ${c.reason}`;
  $('#ledgerRows').innerHTML = state.ledger.slice(0, 12).map(r => `<tr><td class="record-cell"><b>${esc(r.type)}</b><small>${esc(r.detail)}</small><small class="ledger-id" title="${esc(r.hash)}">${esc(r.id)} · ${esc(shortHash(r.hash))}${r.org ? ' · ' + esc(orgName(r.org)) : ''}</small></td><td>${dateFmt(r.date)}</td><td><span class="status-pill ${r.status === 'Recorded' ? 'recorded' : ''}">${esc(r.status)}</span></td><td>⌁</td></tr>`).join('') || '<tr><td colspan="4">No records yet.</td></tr>';
}

function renderEntitlements() {
  const attesters = state.orgs.filter(o => o.canAttest);
  $('#entitlementList').innerHTML = state.claims.map(c => {
    const done = c.attestations.map(a => a.orgId);
    const verified = done.length >= 2;
    const buttons = verified ? '<span class="status-pill">Release approved</span>'
      : attesters.filter(o => !done.includes(o.id)).map(o => `<button class="outline-button" data-attest="${esc(c.id)}" data-org="${esc(o.id)}">Confirm as ${esc(o.role.toLowerCase())}</button>`).join('');
    return `<div class="ent-row"><div><b>${esc(c.opportunity)}</b><small>${esc(c.id)} · ${money(c.amount)} · ${esc(c.status)}</small></div><div class="ent-attest">${done.length ? c.attestations.map(a => `<span>✓ ${esc(a.org)}</span>`).join('') : 'No confirmations yet'}</div><div class="ent-actions">${buttons}</div></div>`;
  }).join('') || '<div class="empty-state">Start an application to see its milestones here.</div>';
}

function renderFacilitator() {
  const f = state.facilitator;
  $('#facStudents').textContent = f.students;
  $('#facMatches').textContent = f.openMatches;
  $('#facDue').textContent = String(f.dueSoon).padStart(2, '0');
  $('#studentTotal').textContent = `${f.students} student${f.students === 1 ? '' : 's'}`;
  if (f.nextDeadline) {
    const d = new Date(f.nextDeadline.deadline);
    $('#nextDay').textContent = d.getDate();
    $('#nextMonth').innerHTML = `${d.toLocaleString('en-IN', { month: 'short' }).toUpperCase()}<br>${d.getFullYear()}`;
    $('#nextTitle').textContent = f.nextDeadline.title;
    $('#nextQualify').textContent = `${f.nextDeadline.qualifying} student${f.nextDeadline.qualifying === 1 ? '' : 's'} may qualify`;
  }
}

function renderStudents(filter = '') {
  const rows = state.students.filter(s => (s.name + ' ' + s.id + ' ' + s.district).toLowerCase().includes(filter.toLowerCase()));
  $('#studentList').innerHTML = rows.map(s => `<div class="student-row"><span class="student-avatar ${esc(s.color)}">${esc(s.initials)}</span><span class="student-name"><b>${esc(s.name)}${s.id === state.profile.id ? ' · viewing' : ''}</b><small>${esc(s.id)}</small></span><span class="student-class">Class ${esc(s.classLevel)} · ${esc(s.district)}</span><span class="student-status">${esc(s.status)}</span><button class="student-open" data-student="${esc(s.id)}" aria-label="Open ${esc(s.name)}">↗</button></div>`).join('') || '<div class="empty-state">No students found.</div>';
}

function fillProfileForm() {
  const f = $('#profileForm'), p = state.profile;
  for (const [k, v] of Object.entries(p)) { const el = f.elements[k]; if (el) el.value = Array.isArray(v) ? v.join(', ') : (v ?? ''); }
}

async function refresh() {
  state = await api(`/api/bootstrap${studentId ? `?student=${encodeURIComponent(studentId)}` : ''}`);
  studentId = state.profile.id;
  try { localStorage.setItem('dhaari.student', studentId); } catch { /* storage unavailable */ }
  render();
}
async function switchStudent(id) {
  studentId = id;
  try { await refresh(); showView('home'); toast(`Now viewing ${state.profile.name}'s pathway.`); }
  catch (e) { toast(errorText(e)); }
}

function openModal(html) { $('#modalContent').innerHTML = html; $('#modalBackdrop').hidden = false; }
function closeModal() { $('#modalBackdrop').hidden = true; }
document.addEventListener('click', e => { if (e.target.id === 'doneModal' || e.target.id === 'cancelModal') closeModal(); });

function claimModal(id) {
  const o = state.opportunities.find(x => x.id === id);
  if (!o) return;
  openModal(`<div class="eyebrow">DETERMINISTIC ELIGIBILITY CHECK</div><h2>${esc(o.title)}</h2><p>Your profile meets the sample criteria for this opportunity. Starting creates a single-use entitlement sealed on the ledger.</p><div class="modal-callout"><b>${money(o.amount)} potential support</b><br>Rules checked: ${esc(o.checked.join(', '))}. Your personal details are not put on the shared ledger, only a hash of the entitlement.</div><p style="font-size:9px">Prototype sample only. Not an official application or government benefit.</p><div class="modal-actions"><button class="outline-button" id="cancelModal">Not now</button><button class="primary-small" id="confirmClaim">Create my entitlement →</button></div>`);
  $('#confirmClaim').onclick = () => createClaim(id);
}
async function createClaim(id) {
  const btn = $('#confirmClaim'); btn.disabled = true; btn.textContent = 'Creating secure record…';
  try {
    const r = await api('/api/claims', { method: 'POST', body: JSON.stringify({ studentId, opportunityId: id }) });
    await refresh();
    openModal(`<div class="eyebrow">YOUR NEXT STEP IS RECORDED</div><h2>Nice work, ${esc(state.profile.name.split(' ')[0])}.</h2><p>Funds are released only after two different organisations confirm your first milestone.</p><div class="modal-callout"><b>${esc(r.claim.opportunity)}</b><br>${money(r.claim.amount)} · single-use entitlement<br><span class="claim-id">${esc(r.claim.id)}</span></div><div class="modal-actions"><button class="outline-button" id="goLedger">See milestones</button><button class="primary-small" id="doneModal">Done</button></div>`);
    $('#goLedger').onclick = () => { closeModal(); showView('ledger'); };
  } catch (e) { closeModal(); toast(errorText(e)); }
}

async function attest(claimId, orgId) {
  try {
    const r = await api('/api/milestone', { method: 'POST', body: JSON.stringify({ claimId, orgId }) });
    await refresh();
    toast(r.claim.attestations.length >= 2 ? 'Second confirmation recorded. Release approved.' : `${orgName(orgId)} confirmed. One more organisation needed.`);
  } catch (e) { toast(errorText(e)); }
}

function showVoicePrompt() {
  const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  openModal(`<div class="eyebrow">VOICE-FIRST · TELUGU READY</div><h2>Tell us what you're good at.</h2><p>Speak in English or Telugu, or type. We'll find the skills in what you say. You can edit everything before saving.</p><textarea id="voiceText" class="modal-input" rows="3" placeholder="For example: I fix phones for my neighbours and help at my uncle's shop."></textarea><div class="modal-callout">${supported ? 'Tap the microphone to dictate, or type your answer.' : 'Voice input is not available in this browser. You can type your answer here.'} Audio is processed by your browser for this prototype.</div><div class="modal-actions"><button class="outline-button" id="startMic" ${supported ? '' : 'disabled'}>${supported ? '🎙 Start speaking' : 'Voice unavailable'}</button><button class="primary-small" id="saveVoice">Use my words →</button></div>`);
  $('#startMic').onclick = startRecognition;
  $('#saveVoice').onclick = saveVoiceText;
}
function startRecognition() {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) return;
  const recognition = new R();
  recognition.lang = $('#languageSelect').value.includes('తెలుగు') ? 'te-IN' : 'en-IN';
  recognition.interimResults = false;
  $('#startMic').textContent = 'Listening… speak now';
  recognition.onresult = e => { $('#voiceText').value = e.results[0][0].transcript; $('#startMic').textContent = '🎙 Try again'; };
  recognition.onerror = () => { toast('Could not hear that. Try again or type instead.'); };
  recognition.onend = () => { if ($('#startMic')) $('#startMic').textContent = '🎙 Start speaking'; };
  recognition.start();
}
async function saveVoiceText() {
  const text = $('#voiceText').value.trim();
  if (!text) { toast('Tell us a little about yourself first.'); return; }
  try {
    const { skills } = await api('/api/skills/extract', { method: 'POST', body: JSON.stringify({ text }) });
    if (!skills.length) { toast('We could not spot a skill yet. Try describing what you do in a day.'); return; }
    closeModal(); showView('profile');
    const merged = [...new Set([...(state.profile.skills || []), ...skills])];
    $('#profileForm').elements.skills.value = merged.join(', ');
    toast(`We found: ${skills.join(', ')}. Save your profile to keep them.`);
  } catch (e) { toast(errorText(e)); }
}

async function verify(id) {
  const result = $('#verifyResult');
  result.className = 'verify-result'; result.textContent = 'Checking the proof…';
  try {
    const r = await api('/api/verify', { method: 'POST', body: JSON.stringify({ token: id }) });
    const checks = r.checks ? `<ul class="verify-checks">${r.checks.map(c => `<li>${c.ok ? '✓' : '×'} ${esc(c.label)}</li>`).join('')}</ul>` : '';
    if (r.valid) {
      const c = r.credential;
      result.className = 'verify-result valid';
      result.innerHTML = `✓ Verified ${esc(c.kind.toLowerCase())} · ${esc(c.holder)} · ${esc(c.title)}${c.amount ? ' · ' + money(c.amount) : ''}${c.issuer ? ' · issued by ' + esc(c.issuer) : ''}${checks}`;
    } else {
      result.className = 'verify-result invalid';
      result.innerHTML = `× ${esc(r.message)}${checks}`;
    }
  } catch (e) { result.className = 'verify-result invalid'; result.textContent = errorText(e); }
}

function addStudentModal() {
  openModal(`<div class="eyebrow">FACILITATOR MODE</div><h2>Add a student profile</h2><p>Record guardian consent before adding a student.</p><label class="eyebrow">STUDENT NAME</label><input class="modal-input" id="nsName" placeholder="Preferred name"><label class="eyebrow">AGE</label><input class="modal-input" id="nsAge" type="number" min="10" max="35" value="15"><label class="eyebrow">GENDER</label><select class="modal-input" id="nsGender"><option>Female</option><option>Male</option><option>Prefer not to say</option></select><label class="eyebrow">DISTRICT</label><input class="modal-input" id="nsDistrict" value="${esc(state.profile.district)}"><label class="eyebrow">CLASS COMPLETED</label><input class="modal-input" id="nsClass" type="number" min="1" max="16" value="9"><div id="nsErrors"></div><div class="modal-actions"><button class="outline-button" id="cancelModal">Cancel</button><button class="primary-small" id="saveStudent">Add student</button></div>`);
  $('#saveStudent').onclick = async () => {
    const payload = { name: $('#nsName').value, age: Number($('#nsAge').value), gender: $('#nsGender').value, district: $('#nsDistrict').value, classLevel: Number($('#nsClass').value) };
    try {
      const r = await api('/api/students', { method: 'POST', body: JSON.stringify(payload) });
      closeModal(); await refresh(); toast(`${r.student.name} added as ${r.student.id}.`);
    } catch (e) { $('#nsErrors').innerHTML = `<ul class="field-errors">${(e.details.length ? e.details.map(d => d.issue) : [e.message]).map(m => `<li>${esc(m)}</li>`).join('')}</ul>`; }
  };
}

// Wiring
$$('.nav-item').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
$$('[data-view]').forEach(b => { if (!b.classList.contains('nav-item')) b.addEventListener('click', () => showView(b.dataset.view)); });
$('#menuToggle').onclick = () => $('#sidebar').classList.toggle('open');
$('#modalClose').onclick = closeModal;
$('#modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeModal(); });
$('#filterTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-filter]'); if (!b) return;
  currentFilter = b.dataset.filter; $$('.filter-tab').forEach(x => x.classList.toggle('selected', x === b)); renderOpps();
});
$('#sortSelect').onchange = renderOpps;
document.addEventListener('click', e => {
  const claim = e.target.closest('[data-claim]'); if (claim) return claimModal(claim.dataset.claim);
  const att = e.target.closest('[data-attest]'); if (att) { att.disabled = true; return attest(att.dataset.attest, att.dataset.org); }
  const stu = e.target.closest('[data-student]'); if (stu) return switchStudent(stu.dataset.student);
});
$('#voiceBtn').onclick = showVoicePrompt;
$('#voiceBtnProfile').onclick = showVoicePrompt;
$('#profileForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!$('#consentCheck').checked) { toast('Please confirm consent to save your profile.'); return; }
  const f = e.currentTarget, values = {};
  for (const k of ['name', 'age', 'gender', 'district', 'classLevel', 'annualIncome', 'category', 'marks', 'skills', 'interests']) {
    const el = f.elements[k]; if (!el) continue;
    let val = el.value;
    if (['age', 'classLevel', 'annualIncome', 'marks'].includes(k)) { if (val === '') continue; val = Number(val); }
    if (['skills', 'interests'].includes(k)) val = val.split(',').map(x => x.trim()).filter(Boolean);
    values[k] = val;
  }
  try {
    await api(`/api/profile?student=${encodeURIComponent(studentId)}`, { method: 'POST', body: JSON.stringify(values) });
    await refresh(); showView('home'); toast('Your profile is saved. Matches updated using clear eligibility rules.');
  } catch (err) { toast(errorText(err)); }
});
$('#verifyForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#verifyInput').value.trim(); if (v) verify(v); });
$('#sampleVerify').onclick = () => { $('#verifyInput').value = 'CRED-AP-0001'; verify('CRED-AP-0001'); };
$('#studentSearch').addEventListener('input', e => renderStudents(e.target.value));
$('#addStudent').onclick = addStudentModal;
$('#downloadRoster').onclick = () => {
  const rows = [['ID', 'Name', 'District', 'Class', 'Status'], ...state.students.map(s => [s.id, s.name, s.district, s.classLevel, s.status])];
  const csv = rows.map(r => r.map(v => '"' + String(v).replaceAll('"', '""') + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'dhaari-student-roster.csv'; a.click(); URL.revokeObjectURL(a.href);
  toast('Roster exported as CSV.');
};
$('#remindStudents').onclick = () => toast('Voice reminders are not connected in this prototype. No message was sent.');
$('#deadlineAction').onclick = () => { showView('facilitator'); $('#studentSearch').focus(); };
$('#journeyDetails').onclick = () => openModal(`<div class="eyebrow">YOUR PATHWAY</div><h2>Little steps add up.</h2><p>Discover what you can do, explore real pathways, apply when you are ready, then grow with a verified record you can carry to your next opportunity.</p><div class="modal-callout"><b>You're at Explore.</b> Your profile matches ${state.opportunities.filter(o => o.eligible && !o.claimed).length} sample opportunities.</div><div class="modal-actions"><button class="primary-small" id="doneModal">Got it</button></div>`);
$('#networkDetails').onclick = () => openModal(`<div class="eyebrow">DRUNIX · TRUST LAYER</div><h2>A shared proof, not a shared file.</h2><p>Each record here is sealed with a SHA-256 hash that includes the previous record's hash, so changing any past record breaks the chain. Verification recomputes every hash. On DRUNIX, the same rules run as chaincode across schools, skill partners, authorities, banks and employers.</p><div class="modal-callout">Marks, income and category stay in protected stores. The shared ledger holds hashes and consent events, not a student's private details.</div><div class="modal-actions"><button class="primary-small" id="doneModal">Understood</button></div>`);
$('#bellBtn').onclick = () => toast('You’re all caught up.');

(async () => {
  try { await refresh(); }
  catch (e) {
    if (e.status === 404 && studentId) { studentId = ''; try { await refresh(); return; } catch { /* fall through */ } }
    toast('Could not connect to the Dhaari backend. Refresh the page to retry.');
  }
})();
