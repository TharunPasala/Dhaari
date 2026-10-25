# Dhaari Demo Guide

This guide explains how to run the Dhaari prototype locally and walk through its main features.

> **Prototype note:** The included data is fictional demonstration data. The local ledger implements hash-chain verification, and the repository includes Go chaincode intended for future DRUNIX-compatible deployment. The prototype is not currently a live production blockchain or scholarship-payment system.

## 1. Requirements

- Node.js 18 or newer
- A modern browser; Chrome is recommended for browser speech input
- Go installed only if you want to run the chaincode tests
- No `npm install` is required for the Node.js prototype because it uses built-in Node.js modules

## 2. Start the application

Open a terminal and change directory to the `dhaari-prototype` project folder:

```bash
cd dhaari-prototype
npm start
```

Alternatively, run:

```bash
node server.js
```

Open this address in your browser:

```text
http://localhost:3000
```

Keep the terminal running while using the application. Stop the server with `Ctrl+C`.

## 3. Suggested demo walkthrough

Use the following flow when presenting Dhaari to a reviewer, professor, or teammate. The exact screen labels may vary with the current UI.

### Step 1: Explore a student profile

- Open the application and inspect the selected student's profile.
- Review the available profile details, skills, interests, and other eligibility information.
- If you update a profile, use fictional sample values only.

**Explain:** The profile provides the information used by the eligibility rules and career-matching logic.

### Step 2: Review career recommendations

- Open the career discovery or recommendations section.
- Review the suggested careers and any associated next steps.
- If voice input is available, try it in a supported browser.

**Explain:** The prototype uses keyword-based skill extraction and a skill graph. Voice support relies on the browser's speech API; BHASHINI integration is planned rather than currently implemented.

### Step 3: Check opportunity eligibility

- Open the opportunities or matching section.
- Review which opportunities the selected student qualifies for.
- Where available, inspect the reasons an opportunity is not eligible.

**Explain:** Eligibility is evaluated by explicit server-side rules. Missing required information does not automatically pass a rule.

### Step 4: Create an entitlement

- Choose an eligible opportunity and start its claim flow.
- Observe the resulting entitlement and status.
- If you try to claim the same opportunity again for the same student, the server should reject the duplicate.

**Explain:** The server checks eligibility again and enforces one entitlement per student per opportunity in the prototype.

### Step 5: Demonstrate milestone attestations

- Open an entitlement's milestone flow, if available in the UI.
- Submit an attestation from one eligible organisation.
- Submit the second attestation from a different eligible organisation.
- Observe the status after each step.

**Explain:** The milestone is marked verified only after two different permitted organisations attest. The current UI lets the user select an organisation, so this is not equivalent to production authentication.

### Step 6: Verify a credential or entitlement

- Open the verification interface.
- Try the sample credential ID `CRED-AP-0001`, if it is present in the current sample data.
- Review the verification result and its individual checks.

**Explain:** Verification checks whether the record matches its sealed hash and whether the local hash chain is intact. A successful local check does not prove that a live blockchain network was used.

### Step 7: Review the facilitator dashboard

- Open the facilitator view.
- Review the student roster, open matches, and upcoming deadlines.
- If you add a student, use fictional data.

**Explain:** The dashboard's summary counts are calculated from the prototype's stored student and opportunity data.

## 4. Run automated tests

From the project root, run the Node.js tests:

```bash
npm test
```

If Go is installed, run the chaincode tests:

```bash
npm run test:chaincode
```

Report the actual output when presenting test results. Do not claim that tests passed unless you have run them successfully in the current version of the project.

## 5. Reset the demo data

The project README states that sample data is recreated when the server starts if `data/store.json` is deleted. To reset the demo:

1. Stop the server.
2. Back up the file first if you need to preserve any local changes.
3. Delete `data/store.json`.
4. Start the server again with `npm start`.

Only do this with the prototype's local demo data. Do not delete production data.

## 6. Troubleshooting

- **Node.js version error:** Check your version with `node --version`; use Node.js 18 or newer.
- **Port already in use:** Stop the other process using port 3000 or adjust the server configuration.
- **Voice input unavailable:** Try Chrome and check browser microphone permissions. Speech support varies by browser and environment.
- **Go tests fail:** Confirm Go is installed and available on your `PATH`.
- **Unexpected demo state:** Stop the server and reset the local sample store as described above.

## 7. Be clear about the current scope

The prototype demonstrates local application flows and business rules. The following should not be presented as completed unless they have separately been implemented and verified:

- Live DRUNIX network deployment
- Production authentication and organisation identity
- BHASHINI voice-service integration
- Real scholarship payments or financial transfers
- Production handling of real student data

## 8. Demo presentation checklist

- [ ] Start the app successfully.
- [ ] Show a student profile and career recommendations.
- [ ] Show eligibility results and reasons.
- [ ] Demonstrate entitlement creation and duplicate-claim protection.
- [ ] Demonstrate two-organisation milestone attestation.
- [ ] Verify a sample credential or entitlement.
- [ ] Show the facilitator dashboard.
- [ ] Run tests and record the actual results.
- [ ] Use only fictional data in screenshots and recordings.
