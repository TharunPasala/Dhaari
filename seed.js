'use strict';
// Sample data for the demo. Every name, scheme and amount here is fictional.
const { append } = require('./ledger');

const ORGS = [
  { id: 'org-school', name: 'ZPHS Pedakakani', role: 'School', canAttest: true },
  { id: 'org-training', name: 'Community Skills Network', role: 'Training partner', canAttest: true },
  { id: 'org-employer', name: 'Guntur Digital Services', role: 'Employer', canAttest: true },
  { id: 'org-authority', name: 'Dhaari Demo Foundation', role: 'Scholarship authority', canAttest: false },
  { id: 'org-bank', name: 'Demo Partner Bank', role: 'Bank', canAttest: false }
];

const STUDENTS = [
  { id: 'STU-AP-02418', name: 'Lakshmi Devi', age: 16, gender: 'Female', district: 'Guntur', state: 'Andhra Pradesh', classLevel: 10, annualIncome: 120000, category: 'OBC', marks: 82,
    interests: ['Mobile repair', 'Small business', 'Helping people'], skills: ['Phone troubleshooting', 'Bookkeeping', 'Telugu communication'], language: 'Telugu', color: 'peach' },
  { id: 'STU-AP-02422', name: 'Kavya Reddy', age: 15, gender: 'Female', district: 'Guntur', state: 'Andhra Pradesh', classLevel: 9, annualIncome: 180000, category: 'General', marks: 74,
    interests: ['Drawing', 'Fashion'], skills: ['Stitching', 'Drawing and design'], language: 'Telugu', color: 'lavender' },
  { id: 'STU-AP-02391', name: 'Suresh Kumar', age: 18, gender: 'Male', district: 'Palnadu', state: 'Andhra Pradesh', classLevel: 11, annualIncome: 90000, category: 'SC', marks: 68,
    interests: ['Electrical work', 'Computers'], skills: ['Fan and switch wiring', 'Computer basics'], language: 'Telugu', color: 'mint' },
  { id: 'STU-AP-02437', name: 'Anjali Rao', age: 17, gender: 'Female', district: 'Bapatla', state: 'Andhra Pradesh', classLevel: 10, annualIncome: 350000, category: 'OBC', marks: 88,
    interests: ['Teaching', 'Caring for people'], skills: ['Tuition for younger kids', 'First aid'], language: 'Telugu', color: 'blue' }
];

const OPPORTUNITIES = [
  { id: 'opp-01', title: 'AP Skill Starter Grant', org: 'Dhaari Demo Foundation', type: 'Skill grant', amount: 10000, deadline: '2026-12-15', location: 'Andhra Pradesh', description: 'A starter grant to help rural learners begin an accredited vocational course.', tags: ['Skills', 'Open to all'], rules: { minAge: 15, maxAge: 22, maxIncome: 250000, state: 'Andhra Pradesh' } },
  { id: 'opp-02', title: 'Girls in Trades Scholarship', org: 'Dhaari Demo Foundation', type: 'Scholarship', amount: 15000, deadline: '2026-11-30', location: 'Andhra Pradesh', description: 'Support for young women pursuing a recognised technical or vocational pathway.', tags: ['For girls', 'Technical'], rules: { minAge: 15, maxAge: 22, maxIncome: 300000, gender: 'Female', state: 'Andhra Pradesh' } },
  { id: 'opp-03', title: 'Rural Digital Apprenticeship', org: 'Community Skills Network', type: 'Apprenticeship', amount: 12000, deadline: '2027-01-20', location: 'Andhra Pradesh', description: 'A paid, mentored introduction to device support and digital services.', tags: ['Apprenticeship', 'Digital'], rules: { minAge: 16, maxAge: 24, minClass: 10, state: 'Andhra Pradesh' } },
  { id: 'opp-04', title: 'Young Enterprise Challenge', org: 'District Youth Collective', type: 'Competition', amount: 5000, deadline: '2027-02-10', location: 'All India', description: 'Build a small business idea with a mentor and pitch for seed support.', tags: ['Business', 'Mentorship'], rules: { minAge: 18, maxAge: 25, maxIncome: 400000 } }
];

function initialStore() {
  const credentials = [
    { id: 'CRED-AP-0001', studentId: 'STU-AP-02418', holder: 'Lakshmi Devi', title: 'Class 10 marks record', issuerOrg: 'org-school', fields: { classLevel: 10, marks: 82, year: 2026 }, issued: '2026-10-12T10:30:00.000Z' }
  ];
  const chain = [];
  append(chain, { type: 'Consent recorded', subject: 'STU-AP-02418', detail: 'Profile shared with Dhaari Demo Foundation', status: 'Recorded', org: 'org-authority', payload: { studentId: 'STU-AP-02418', sharedWith: 'org-authority' }, date: '2026-10-09T08:15:00.000Z' });
  append(chain, { type: 'Credential issued', subject: 'STU-AP-02418', detail: 'Class 10 marks record · issuer: ZPHS Pedakakani', status: 'Verified', org: 'org-school', ref: 'CRED-AP-0001', payload: credentials[0], date: credentials[0].issued });
  return {
    version: 2,
    orgs: structuredClone(ORGS),
    students: structuredClone(STUDENTS).map(s => ({ ...s, updatedAt: '2026-10-12T10:30:00.000Z' })),
    opportunities: structuredClone(OPPORTUNITIES),
    claims: [],
    credentials,
    chain
  };
}

module.exports = { initialStore };
