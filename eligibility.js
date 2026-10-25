'use strict';
// Deterministic rules-as-code eligibility. No AI in this path: same input, same answer, always explainable.

const inr = n => '₹' + Number(n).toLocaleString('en-IN');

function eligible(profile, opp) {
  const r = opp.rules || {}, reasons = [], checked = [];
  // A missing value never passes a rule: unknown income is not "income of zero".
  const num = v => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const age = num(profile.age), income = num(profile.annualIncome), cls = num(profile.classLevel);
  const missing = (label) => reasons.push(`Add your ${label} to check this rule`);
  if (r.minAge !== undefined || r.maxAge !== undefined) {
    checked.push('age');
    if (Number.isNaN(age)) missing('age');
    else {
      if (r.minAge !== undefined && age < r.minAge) reasons.push(`Must be at least ${r.minAge} years old`);
      if (r.maxAge !== undefined && age > r.maxAge) reasons.push(`Must be ${r.maxAge} or younger`);
    }
  }
  if (r.maxIncome !== undefined) {
    checked.push('household income');
    if (Number.isNaN(income)) missing('annual family income');
    else if (income > r.maxIncome) reasons.push(`Annual family income must be ${inr(r.maxIncome)} or below`);
  }
  if (r.minClass !== undefined) {
    checked.push('completed class');
    if (Number.isNaN(cls)) missing('completed class');
    else if (cls < r.minClass) reasons.push(`Must have completed Class ${r.minClass}`);
  }
  if (r.gender !== undefined) { checked.push('gender'); if (profile.gender !== r.gender) reasons.push(`Eligibility is for ${r.gender.toLowerCase()} students`); }
  if (r.state !== undefined) { checked.push('residency'); if (profile.state !== r.state) reasons.push(`Must be a resident of ${r.state}`); }
  return { eligible: reasons.length === 0, reasons, checked: [...new Set(checked)] };
}

module.exports = { eligible };
