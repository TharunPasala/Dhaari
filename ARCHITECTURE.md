# Dhaari Architecture

## 1. Overview

Dhaari is a full-stack prototype for voice-first career discovery and student opportunity matching. It combines a student-facing interface, a facilitator dashboard, deterministic eligibility checks, skill-based career recommendations, entitlement management, credential verification, and a tamper-evident hash-chained ledger.

**Prototype status:** The local application implements the ledger logic and core business rules. The project includes Go chaincode designed for a DRUNIX-compatible Hyperledger Fabric environment, but the README states that it has not yet been deployed to a live DRUNIX network.

## 2. High-Level Architecture

```text
Student / Facilitator
        |
        v
Browser UI (public/)
        |
        v
Node.js HTTP Server (server.js)
        |
        +--> Profile validation (lib/validate.js)
        |
        +--> Eligibility rules (lib/eligibility.js)
        |
        +--> Skill extraction and career matching (lib/skills.js)
        |          |
        |          v
        |     Skill graph (data/skill-graph.json)
        |
        +--> Entitlements and milestone attestations
        |
        +--> Hash-chained ledger (lib/ledger.js)
        |
        v
JSON prototype data store (data/store.json)

Separate chaincode implementation:
chaincode/dhaari/
        |
        +--> Core business rules (Go)
        +--> Fabric-compatible chaincode adapter
        |
        v
Target DRUNIX / Fabric-compatible test network (deployment planned)
```

## 3. Main Components

### Frontend: `public/`

Contains the browser interface for students and facilitators. The prototype supports viewing a student profile, exploring eligible opportunities and career suggestions, managing claims, reviewing ledger entries, and verifying records. Voice input uses the browser's speech API where supported.

### HTTP API: `server.js`

Implements the Node.js HTTP server and API routes. It coordinates profile updates, student creation, eligibility checks, entitlement creation, milestone attestations, credential verification, and skill extraction.

### Validation: `lib/validate.js`

Validates profile input and returns field-level errors. Invalid profile data is rejected before it is saved.

### Eligibility engine: `lib/eligibility.js`

Evaluates opportunity requirements using explicit rules. Missing information does not automatically satisfy a requirement, and the engine can return reasons why a student is not eligible.

### Skill matching: `lib/skills.js` and `data/skill-graph.json`

Extracts skills from user-provided text using keyword-based matching and maps skills to occupation groups and career recommendations. The current approach is transparent and testable; it is not an advanced language model.

### Local persistence: `data/`

Stores prototype data in JSON files. The server reads and writes the local store. The sample students, opportunities, organisations, and amounts are fictional demonstration data.

### Trust ledger: `lib/ledger.js`

Creates a hash-chained record history using SHA-256. Each record incorporates its content and the previous record's hash, making changes to earlier records detectable when the chain is verified. This local ledger should not be described as a live blockchain.

### Go chaincode: `chaincode/dhaari/`

Contains framework-independent Go business rules and a Fabric-compatible chaincode adapter. The intended next step is to test and deploy these rules on a DRUNIX-compatible network, following the repository's deployment documentation.

## 4. Main Data Flows

### A. Profile update

1. The browser sends profile fields to the Node.js API.
2. The server validates the submitted values.
3. Valid fields are applied to the student's profile.
4. A consent-related event is appended to the local ledger.
5. The updated store is saved.

### B. Career recommendations

1. The server loads the skill graph.
2. Skills are extracted from available profile information and text.
3. The graph maps relevant skills to occupation groups.
4. Career recommendations and suggested next steps are returned to the interface.

### C. Opportunity eligibility and entitlement

1. The server finds the student and requested opportunity.
2. The eligibility engine evaluates the requirements.
3. If the student is ineligible, the API returns reasons and does not create the entitlement.
4. If eligible, the server checks for an existing claim for the same student and opportunity.
5. A new single-use entitlement is saved and a corresponding ledger entry is appended.

### D. Milestone attestation

1. An organisation submits an attestation for an entitlement.
2. The server checks that the organisation is allowed to attest.
3. Duplicate attestations from the same organisation are rejected.
4. The milestone is marked verified after two different eligible organisations attest.

In the current prototype, organisation identity is selected in the UI rather than derived from an authenticated organisational certificate. Production deployment requires stronger identity and authorisation controls.

### E. Credential or entitlement verification

1. The API looks up the supplied identifier.
2. It recomputes the document payload hash.
3. It checks the stored sealed hash and verifies the full ledger chain.
4. Credential revocation is checked when applicable.
5. The API returns the verification checks and result.

## 5. API Surface

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/bootstrap?student=ID` | Returns profile, opportunities, claims, ledger status, careers, roster, and facilitator summary |
| `POST` | `/api/profile?student=ID` | Validates and updates a profile |
| `POST` | `/api/students` | Adds a student after validation |
| `POST` | `/api/claims` | Checks eligibility and creates a single-use entitlement |
| `POST` | `/api/milestone` | Records an organisation's milestone attestation |
| `POST` | `/api/verify` | Verifies a credential, entitlement, or transaction identifier |
| `POST` | `/api/skills/extract` | Extracts skills from supplied text |

## 6. Technology

- **Frontend:** HTML, CSS, and browser JavaScript
- **Backend:** Node.js built-in HTTP server
- **Prototype persistence:** JSON files
- **Ledger hashing:** SHA-256 hash chain
- **Chaincode:** Go, with a Fabric-compatible adapter
- **Voice input:** Browser speech API where supported
- **Target blockchain environment:** DRUNIX-compatible Fabric test network (deployment not yet completed)

## 7. Security, Privacy, and Limitations

- The current prototype does not provide user login or production-grade authentication.
- Organisation selection in the UI is not equivalent to verified organisational identity.
- The local JSON store and ledger are for demonstration and are not production infrastructure.
- Voice input depends on browser support; BHASHINI integration is planned, not implemented.
- Skill extraction is keyword-based.
- Occupation codes should be validated against the official NCO-2015 source before real-world use.
- All included student, scheme, organisation, and amount data should be treated as fictional sample data.
- Before public release, inspect the repository for personal information, secrets, and unintended local data files.

## 8. Next Steps

1. Run the existing Node.js tests with `npm test`.
2. Run the Go tests with `npm run test:chaincode` on a machine with Go installed.
3. Add automated CI to run tests on each push and pull request.
4. Authenticate users and derive organisational permissions from trusted credentials.
5. Deploy and test the chaincode on a DRUNIX-compatible test network.
6. Evaluate the skill graph and recommendations with relevant users and domain experts.
7. Review privacy, consent, accessibility, and security requirements before any real student deployment.
