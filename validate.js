'use strict';
// Input validation for student profiles. Returns clean values plus field-level errors.

const GENDERS = ['Female', 'Male', 'Prefer not to say'];
const CATEGORIES = ['General', 'OBC', 'SC', 'ST', 'EWS', 'Prefer not to say'];
const LANGUAGES = ['Telugu', 'English', 'Hindi', 'Tamil', 'Kannada', 'Urdu'];

function cleanText(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f]/g, ' ').trim();
  return s.length && s.length <= max ? s : null;
}

function int(v, min, max) {
  if (v === '' || v === null || typeof v === 'boolean' || Array.isArray(v)) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function list(v, maxItems, maxLen) {
  if (typeof v === 'string') v = v.split(',');
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.map(x => cleanText(String(x), maxLen)).filter(Boolean))];
  return out.length <= maxItems ? out : null;
}

const RULES = {
  name: v => cleanText(v, 60),
  age: v => int(v, 10, 35),
  gender: v => (GENDERS.includes(v) ? v : null),
  district: v => cleanText(v, 40),
  state: v => cleanText(v, 40),
  classLevel: v => int(v, 1, 16),
  annualIncome: v => int(v, 0, 10000000),
  category: v => (CATEGORIES.includes(v) ? v : null),
  marks: v => int(v, 0, 100),
  interests: v => list(v, 12, 40),
  skills: v => list(v, 15, 40),
  language: v => (LANGUAGES.includes(v) ? v : null)
};

const MESSAGES = {
  name: 'Name is required (up to 60 characters)',
  age: 'Age must be a whole number between 10 and 35',
  gender: `Gender must be one of: ${GENDERS.join(', ')}`,
  district: 'District is required (up to 40 characters)',
  state: 'State is required (up to 40 characters)',
  classLevel: 'Class must be a whole number between 1 and 16',
  annualIncome: 'Annual family income must be a whole number of rupees, 0 or more',
  category: `Category must be one of: ${CATEGORIES.join(', ')}`,
  marks: 'Marks must be a percentage between 0 and 100',
  interests: 'Interests: up to 12 items, each up to 40 characters',
  skills: 'Skills: up to 15 items, each up to 40 characters',
  language: `Language must be one of: ${LANGUAGES.join(', ')}`
};

// partial=true: only validate fields that are present (profile updates).
function validateProfile(input, { partial = false, required = [] } = {}) {
  const value = {}, errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { value, errors: [{ field: '_', issue: 'Body must be a JSON object' }] };
  for (const [field, rule] of Object.entries(RULES)) {
    const present = input[field] !== undefined;
    if (!present) {
      if (!partial || required.includes(field)) {
        if (required.includes(field)) errors.push({ field, issue: MESSAGES[field] });
      }
      continue;
    }
    const clean = rule(input[field]);
    if (clean === null) errors.push({ field, issue: MESSAGES[field] });
    else value[field] = clean;
  }
  return { value, errors };
}

module.exports = { validateProfile, GENDERS, CATEGORIES, LANGUAGES };
