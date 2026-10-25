# Dhaari — full-stack prototype (v0.2)

A runnable, no-dependency prototype for Dhaari: voice-first career discovery, deterministic eligibility, single-use entitlements, two-organisation milestone attestation, and a tamper-evident trust ledger. The on-chain rules are also written as DRUNIX/Fabric chaincode in Go.

## Run it

```bash
cd dhaari-prototype
npm start            # or: node server.js
```

Open `http://localhost:3000`. Node 18 or newer. No `npm install` needed.

## Test it

```bash
npm test                 # 13 API and logic tests (Node built-in test runner)
npm run test:chaincode   # chaincode business-rule tests (needs Go)
```

## What is real in this prototype

| Area | How it works |
| --- | --- |
| Eligibility | Rules-as-code in `lib/eligibility.js`. Same input, same answer, with a reason for every "no". A missing value (e.g. income) never passes a rule. |
| Trust ledger | `lib/ledger.js`. Each record's SHA-256 hash covers its content and the previous record's hash. Nothing random goes into a hash, so anyone can recompute it. Editing any past record breaks the chain. |
| Verification | `POST /api/verify` recomputes the document hash, compares it to the sealed hash, checks the whole chain and revocation. Try `CRED-AP-0001`. |
| Single-use entitlements | One entitlement per student per scheme. Eligibility is re-checked on the server. |
| Milestones | Funds are approved only after two different attesting organisations confirm. Banks and the authority cannot attest. One organisation cannot confirm twice. |
| Input validation | `lib/validate.js`. Bad values are rejected with field-level messages and nothing is saved. |
| Skill graph | `data/skill-graph.json` maps everyday skills to NCO-2015 occupation unit groups. `lib/skills.js` extracts skills from what a student says and recommends careers with next steps. |
| Facilitator | Real roster from the data store. All counts (students, matches, deadlines within 14 days, next deadline) are computed, not hard-coded. Add students with validation; open any student's pathway. |
| Privacy | The ledger stores student IDs, hashes and consent events. Names, marks and income live in the off-chain store. |

## DRUNIX chaincode

`chaincode/dhaari/` holds the on-chain rules for the DRUNIX network:

- `core/` — framework-free Go: `IssueCredential`, `VerifyCredential`, `RevokeCredential`, `CreateEntitlement`, `AttestMilestone`, `GetEntitlement`. Permissions come from the caller's organisation (MSP ID). Fully unit-tested.
- `cmd/chaincode/` — the Fabric contract adapter (DRUNIX is backward compatible with Fabric v2.5 chaincode). Build it on a machine with normal internet access:

  ```bash
  cd chaincode/dhaari/cmd/chaincode
  go mod tidy && go build
  ```

To deploy it on the DRUNIX test network from Windows, follow `scripts/WINDOWS-SETUP.md` (WSL + Docker Desktop), then run `bash scripts/deploy-drunix.sh`. The script builds DRUNIX, starts its 2-organisation test network, deploys the `dhaari` chaincode and runs an issue-and-verify check. On the test network, Org1 acts as school and scholarship authority, Org2 as training partner.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/bootstrap?student=ID` | Profile, matches, careers, claims, ledger, chain status, roster, facilitator summary |
| POST | `/api/profile?student=ID` | Validated profile update; records a consent event |
| POST | `/api/students` | Facilitator adds a student (name, age, gender, district, class required) |
| POST | `/api/claims` | `{ studentId, opportunityId }` — eligibility check, then a single-use entitlement |
| POST | `/api/milestone` | `{ claimId, orgId }` — one attestation; two different orgs release |
| POST | `/api/verify` | `{ token }` — credential, entitlement or transaction ID |
| POST | `/api/skills/extract` | `{ text }` — skills found in free text |

Errors return `{ "error": "...", "details": [{ "field", "issue" }] }` with a matching HTTP status.

## Known limits (be upfront about these in Q&A)

- **Not yet on a live DRUNIX network.** The local ledger mirrors the chaincode rules; deployment is next.
- **No login yet.** The organisation for an attestation is chosen in the UI. On DRUNIX, it comes from the signer's certificate.
- **Voice** uses the browser's speech API (Chrome works best). BHASHINI integration is planned.
- **Skill extraction** is keyword-based so it is transparent and testable. An LLM can replace `extractSkills` without changing the graph.
- **NCO codes** are 4-digit unit groups; verify them against the official NCO-2015 list before production.
- All students, schemes, organisations and amounts are fictional sample data.

## Reset the demo

Stop the server, delete `data/store.json`, and start again. Sample data is recreated on start.
