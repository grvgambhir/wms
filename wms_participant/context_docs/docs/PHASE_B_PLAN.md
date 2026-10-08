# Phase B — Delivery Plan (Como Lake 2027)

**Written:** 6 September 2026
**Status:** Draft for product-owner approval
**Supersedes:** nothing — this expands `DELIVERY_PLAN_COMO2027.md` §4 "B (Sep–Dec 2026)" from one bullet into an executable plan.
**Evidence base:** `RFP_COMPLIANCE_AUDIT.md` (5 Sep 2026, 108 IDs), plus structural facts re-verified against the running code on 6 Sep 2026 (§1.2).

---

## 0. Read this first — the date problem

| Milestone | Date | Days from today | Source |
|---|---|---|---|
| **Phase A Production Launch** | 17 Sep 2026 | **11** | RFP §6.3 |
| **Ops-Ready Gate** (backend doc) | 30 Sep 2026 | **24** | Backend architecture note |
| **RFP Phase B window** | Sep–Dec 2026 | ~116 | RFP §6.3 (authoritative) |
| Competition Readiness | Jun 2027 | ~298 | RFP |
| Games-time | 17–26 Sep 2027 | ~376 | RFP |

**The plan cannot start at Phase B, because Phase A is not finished.**

The audit's finding is explicit: *"Phase A missing? Yes."* RFP §6.3 Phase A requires identity, sport selection, core rules, payment, confirmations, privacy/security, support and monitoring by 17 Sep 2026. Of those, **real identity verification, production hosting, a PSP/PCI boundary, DPA, MFA, encryption at rest, malware scanning, observability and measured capacity are all absent.**

So this document plans **Phase A completion and Phase B together**, in one dependency-ordered sequence. Treating them as separate tracks would sequence work that cannot be sequenced: you cannot migrate 15,000 EOI records (Phase B) into a database that does not exist (Phase A).

**Consequence to accept explicitly:** 17 Sep 2026 will not be met as a *production* launch on the current codebase. The decision to make is not *whether* to slip it, but *what* is presented on that date and how it is described. §7-R1 covers this.

---

## 1. Where we actually are

### 1.1 The audit's ledger

| Verdict | Count |
|---|---|
| BUILT | **0** |
| BUILT-ON-MOCK | 14 |
| PARTIAL | 59 |
| MISSING | 31 |
| OUT-OF-SCOPE-NOW | 4 |
| **Total** | **108** |

Zero requirements are BUILT because nothing runs on production substrate. That is not a criticism of the work — 14 IDs are genuinely implemented and demonstrable, and the domain engine is real and portable. It is a statement about *substrate*, and substrate is exactly what Phase B installs.

### 1.2 Five structural facts, re-verified 6 Sep 2026

These are the load-bearing problems. Each was confirmed against the code today, not carried over from the audit on trust.

**F1 — Five of six services die on restart.**
Only `mockRegistrationJourneyRepository` persists (to `wms_api/data/db.json`). Accreditation, communications, assisted registration, exceptions and rules are pure in-memory. `mockAccreditationDeskRepository.ts:3` says so in its own comment: *"In-memory only (no persistence) — state resets on restart."* Every badge issued, every broadcast sent, every exception approved vanishes when the process stops.

**F2 — There are two disjoint rule registers.**
Verified by checksum:

| Register | Files | md5 |
|---|---|---|
| **A** (live registration path) | `wms_api/src/data/fixtures/sport-rules.json`, `wms_participant/src/data/mock/fixtures/sport-rules.json` | `50e43f00…` |
| **B** (admin configurator) | `wms_admin/src/data/sport-rules.json`, `wms_api/src/data/fixtures/data-hub/sport-rules.json` | `bdec46a4…` |

They are not drifted copies of one file — they are different shapes with different bands. **The rules an athlete is judged by and the rules an administrator edits are different data.** This is the single most dangerous defect in the product: it is silent, it is invisible in every demo, and it produces wrong eligibility decisions in production.

**F3 — Publishing a rule changes nothing.**
`publishRuleChange` writes a *notice* (`mockRulesRepository.ts:54–64`). It does not mutate the register. The configurator is a document editor whose Save button writes to a changelog.

**F4 — There is no admin authentication at all.**
The admin portal has no login. The header is a hardcoded `Admin_System` / `Superuser Role`. Dual control (RUL-06) compares two strings; an unauthenticated browser can press both approval buttons in sequence. The audit's phrase is fair: *dual control without identity is theatre.*

**F5 — There is no PSP.**
Payment is a hardcoded mock token. PCI scope, SCA/3DS, reconciliation and FatturaPA/SDI all sit behind this one gap.

### 1.3 What is genuinely solid and must be protected

Not everything is scaffolding. Phase B should preserve, not rewrite:

- **`@wms/domain`** — pure TypeScript, zero framework imports, consumed by all four repos. This lifts onto a real backend unchanged. It is the asset.
- **The age engine** — `ageOn` + `findBand` + four strategies are real, tested, and correct.
- **REG-11 status lifecycle** — as of REV-044, every status change in the API routes through one guarded writer with a full attributed audit trail.
- **The repository seam** — UI never touches fixtures or HTTP directly. Swapping mock → real is a constructor change, not a UI rewrite. This is why Phase B is feasible at all.
- **Idempotency keys, integer minor units, UUID identity, restricted-data isolation** — designed in from day one.

---

## 2. Scope — and the split that changes the plan

The 31 MISSING items are **not one kind of work.** Sorting them is the most important planning move in this document, because roughly half cannot be closed by an engineering team at any speed.

### Kind 1 — Software to build (10 IDs)
`PLT-04` MFA · `PLT-08` household/companion profiles · `REG-14` add-on products · `PAY-09` SEPA/bank/wallets · `PAY-10` merchant-of-record model · `SEC-07` PCI boundary · `CMP-03` award-category lineage · `CMP-06` embargo controls · `ACS-05` accommodation needs separate from classification · `TEA-02` team deposits & split payments

### Kind 2 — Infrastructure to provision and prove (6 IDs)
`NFR-01` fault-tolerant hosting, prod/non-prod split · `NFR-03` measured capacity envelope · `NFR-06` observability + synthetic journeys · `SEC-03` WAF/DDoS/SAST/DAST/pen test · `SEC-05` tamper-resistant logs, 12-month retention · `DAT-02` EEA hosting + backup

### Kind 3 — Paper and organisation, not code (15 IDs)
`PRV-01` DPA + controller instructions · `PRV-03` subprocessor disclosure · `SEC-01` ISMS/ISO 27001 · `SEC-04` vulnerability SLA · `SEC-08` personnel screening & training · `NFR-05` change control & release evidence · `ACS-04` accessibility conformance report · `DAT-01` data-ownership controls · `DAT-04` written processing authorisation · `CON-01` ownership/no-lien · `CON-02` DPA flow-down + audit rights · `CON-03` subcontractor/licence/IP continuity · `CON-04` insurance evidence · `CON-06` marketing-use control · `CON-08` governing law artefact

> **This is the plan's biggest single risk.** Kind 3 is ~48% of everything MISSING, it is on the RFP's §9.1 mandatory gate 4, and **no amount of engineering closes any of it.** It needs a named commercial/legal owner starting week 1. If that owner is not appointed, the product can be technically flawless in December and still fail the gate.

The 59 PARTIAL items are mostly depth-completion inside features that already exist. They are distributed across the tracks below rather than listed as a separate workstream.

---

## 3. Track 0 — Decisions that block everything (Week 1, by 13 Sep)

None of these are engineering tasks. All of them stop work downstream if unmade. Every one has a recommended default so that silence does not become a decision.

| # | Decision | Options | Recommended default | Blocks |
|---|---|---|---|---|
| D1 | Backend framework | NestJS vs FastAPI | **NestJS** — the domain package is TypeScript; one language, zero re-implementation of the engine | Track A entirely |
| D2 | Database | Postgres vs MySQL | **Postgres** — JSONB for versioned rule registers, strong constraints | A, D |
| D3 | Hosting region & provider | must be EEA (DAT-02) | **AWS eu-central-1 or eu-south-1** (Milan — closest to Como) | A, E, DAT-02 |
| D4 | PSP | Stripe vs Adyen | **Stripe** — faster SCA/3DS, but confirm FatturaPA/SDI path with an Italian tax adviser | C, SEC-07, PAY-* |
| D5 | Identity / MFA | build vs buy | **Buy** (Auth0/Cognito/Keycloak) — MFA, session, audit for free; PLT-04 is a gate item | A, F4, PLT-03/04 |
| D6 | Paper-track owner | who signs DPA, ISMS, insurance | **Must be named this week** — not an engineering role | All of Kind 3 |
| D7 | 17 Sep commitment | what actually ships | **See §7-R1** | Commercial |
| D8 | EOI data handover | who provides the ~15k records, in what format, when | **Request from WMS/OC in week 1** — migration cannot be built against an unknown schema | Track D |

**D8 is routinely underestimated.** Track D is a named RFP deliverable (REG-13) and it cannot start — not even design — until the source data's shape, quality and PII classification are known. Ask on day one.

---

## 4. The tracks

Each track states its exit criterion as something *observable*, not something asserted.

### Track A — Real substrate
*Turns 14 BUILT-ON-MOCK into BUILT. Everything else depends on this.*

- A1. Postgres schema + migrations, derived from `@wms/domain` models (the models already exist; this is translation, not design)
- A2. Replace the six mock repositories with real implementations behind the **unchanged** repository interfaces
- A3. **Fix F1** — every service persists; kill-and-restart loses nothing
- A4. Participant auth: real email/OTP delivery, real sessions, server-side credentials (retires the literal `123456`)
- A5. **Fix F4** — admin authentication, roles, and real reviewer identity on every approval
- A6. Deploy: prod + non-prod, EEA region, encryption at rest, automated backup with a *restored* proof
- A7. Versioned API (`/v1`), OpenAPI contract generated from the domain package

**Exit:** restart every service under load; no data lost. Two administrators with distinct real accounts are required to approve a high-impact exception, and one cannot approve twice.

### Track B — Rules engine completion
*The audit's second-most-serious gap. Highest correctness risk in the product.*

- B1. **Fix F2** — collapse to one register, one source of truth, served by the API to both portals. Delete the second copy.
- B2. **Fix F3** — publishing mutates the register, creates a new version, and records approver + timestamp + reason
- B3. Configurable reference date (RUL-02) — currently the constant `2027-12-31`
- B4. Missing strategies: **judo** (age + weight + federation + belt), **golf handicap**, **para classification** as a real class engine with expiry, **category combination**, **eligibility exclusions**
- B5. Proficiency grade with evidence, review and appeal (currently a radio button)
- B6. Impact analysis on **every** path — the roster path warns, the admin preview uses a defective local `deriveCategory` that does not exclude the coxswain
- B7. Approver identity on RUL-04/RUL-06 (depends on A5)

**Exit:** all ten §3.2 Masters patterns compute from configuration, not code branches. Editing a band in the admin portal changes what the next athlete is judged by — provably, in one flow.

### Track C — Money, for real
- C1. PSP integration + SCA/3DS + webhooks (idempotency keys already in place)
- C2. PCI boundary documented; no PAN ever transits our systems (SEC-07)
- C3. Reconciliation: settlement vs ledger, with a break report
- C4. FatturaPA/SDI e-invoicing — **Italian regulatory requirement, needs a specialist**
- C5. Team deposits, split payments, unpaid-member tracking (TEA-02)
- C6. Refund dual control (currently one click)
- C7. SEPA / bank transfer (PAY-09)

**Exit:** a real card is charged in a sandbox, reconciled against a settlement file, and produces a compliant Italian invoice.

### Track D — Pre-registration migration (REG-13)
*Blocked on D8.*

- D1. Ingest ~15,000 EOI records; profile the source data before writing any code
- D2. Deduplication with a reviewable match report — never silent auto-merge
- D3. Claim flow: an EOI holder proves identity and takes ownership of their record
- D4. **Rollback** — the migration must be reversible, rehearsed, and timed
- D5. Waitlist automation on migrated quota

**Exit:** full-volume rehearsal in non-prod, then rolled back cleanly, twice.

### Track E — Operations-ready (NFR family)
- E1. Observability: app, infra, API, queue, payment, comms
- E2. Synthetic participant-journey monitors
- E3. Load test to the real envelope — 20,000 athletes, 2,000 concurrent sessions
- E4. RPO ≤ 5 min / RTO ≤ 60 min, **demonstrated by an actual restore**, not a policy document
- E5. Remove the fake telemetry: `paidRegistrations: 14_210` and `'100.00%'` uptime are literals in `wms_admin/src/repositories/MockOperationsRepository.ts:14,49`. `OperationsPage.tsx:274` does qualify them ("demo data illustrative"), but the sidebar badge at `AdminPortalShell.tsx:101` says only **"Live Production Env"**, unqualified, on every screen. Replace with real metrics or qualify the badge.
- E6. Tamper-resistant security logs, 12-month retention (SEC-05)

**Exit:** the numbers on the operations dashboard are measured. A restore is performed from backup within RTO, on the clock.

> **E5 is small work with outsized consequence.** A demo that displays invented uptime under a "Live Production Env" label is the kind of detail that costs credibility in an evaluation. Fix it early and cheaply.

### Track F — Paper track (non-code, owner from D6)
DPA + controller instructions · subprocessor register · EEA hosting attestation · ISMS/ISO 27001 posture · independent penetration test · vulnerability SLA · personnel screening + security training · change control and release evidence · accessibility conformance report + issue log + contact · data-ownership and no-lien artefacts · insurance certificates · subcontractor/licence/IP continuity · marketing-use control · governing-law artefact

**Exit:** RFP §9.1 gate 4 has an evidence pack behind every line.

### Track G — Depth on what already exists (the 59 PARTIALs)
- G1. Evidence pipeline: real file storage, malware scanning, independent review (today it is metadata + self-review)
- G2. Accreditation: photo quality/crop, duplicate detection, bulk production export, print integration, QR, genuine offline lookup (today's "Offline lookup" is an online filter)
- G3. Communications: real email/SMS delivery, templates, delivery receipts
- G4. Accessibility: WCAG 2.2 AA measured with tooling + assistive tech, plus **ACS-05** (accommodation needs modelled separately from sport classification)
- G5. Admin Italian localisation — the control is currently a no-op with `title="Italian localization is not wired yet"`
- G6. Participant depth: relay entry product, household profiles (PLT-08), add-ons (REG-14), real invoices
- G7. Replace remaining fixture literals in Operations KPIs (REG-15)

**Exit:** no screen in either portal shows a value it did not compute.

---

## 5. Sequence

Dependency-ordered. Weeks are relative to 6 Sep 2026.

```
W1  (to 13 Sep)   Track 0 decisions · D8 data request · paper-track owner named
                  ├─ Track F starts (runs the full 4 months, independent)
                  └─ E5 fake-telemetry cleanup (1 day, do it now)

W2–5 (to 11 Oct)  Track A — substrate
                  A1 schema → A2 repositories → A3 persistence → A4/A5 auth → A6 deploy
                  ├─ B1 register collapse (can start immediately — pure data work)
                  └─ D1 EOI profiling (as soon as D8 lands)

W6–9 (to 8 Nov)   Track B rules completion  ║  Track C money  ║  Track D migration
                  (parallel — different people, all unblocked by A)

W10–13 (to 6 Dec) Track E ops-ready · Track G depth
                  Load test, DR rehearsal, migration rehearsal + rollback ×2

W14–16 (to Dec)   Gate evidence assembly · §9.1 re-audit · §9.3 re-walk
```

**Two things start in week 1 and never stop:** Track F (paper) and the audit-driven regression re-walk. Everything else is gated.

**Critical path:** `D1/D2/D3 → A1 → A2 → A3 → A6 → everything`. If Track 0 slips a week, the whole plan slips a week. There is no way to parallelise around an undecided database.

---

## 6. Definition of done

Phase B is complete when, against RFP §9.1:

1. **No requirement is scored on a mock.** Every ID that claims BUILT is backed by production substrate.
2. **Gate 2** — nothing on the critical path is presented as standard when it is unbuilt.
3. **Gate 3** — all ten §3.2 Masters patterns compute from configuration.
4. **Gate 4** — DPA, PCI model, SLA evidence and measured accessibility all exist as artefacts.
5. **All eight §9.3 scenarios run for real**, not as theatre. Today six can be *acted*; scenario 4 is not a judo registration, and scenario 6's "clean export" never loads restricted data.
6. **The compliance audit is re-run adversarially** by someone who did not build it, using the same method: read the code, walk the browser, hit the negatives, kill the services mid-flow.

Point 6 is the real exit criterion. The others are inputs to it.

---

## 7. Risk register

**R1 — The commercial response over-claims the product.** *(Highest.)*
The V1 proposal (31 Aug 2026) marks **98 of 108** IDs as some form of Comply and "Available 17 Sep 2026" — including MFA, malware scanning, FatturaPA/SDI, PCI DSS, DPA, EEA hosting, 40 configurable sports, team deposits and household profiles. The audit's measurement is 0 BUILT. This gap is discovered by any competent technical evaluation, and it is discovered faster than it can be closed.
→ **Owner: product owner, this week.** Decide what 17 Sep presents and how it is described. Options: (a) reposition it as a functional prototype demonstration with a dated delivery plan attached — this document is that plan; (b) descope the claim set to what is provable; (c) negotiate the milestone. Doing nothing selects the worst outcome by default.

**R2 — Kind 3 has no owner.** 15 MISSING IDs, ~48% of the missing set, all on gate 4, none closable by engineers. Unassigned as of today.
→ D6, week 1.

**R3 — F2 reaches production.** Two rule registers means athletes are judged by data nobody is editing. It is invisible in demos and produces wrong eligibility decisions silently.
→ B1 is scheduled in week 2 for this reason, ahead of most of Track A. It is pure data work and needs no substrate.

**R4 — EOI data is late or dirty.** Track D is a named deliverable with a hard gate date and it cannot begin without D8. Fifteen thousand records of unknown provenance will contain duplicates, malformed dates and PII that needs classification before it is touched.
→ Request in week 1. Profile before designing. Budget rework.

**R5 — FatturaPA/SDI is a specialist regulatory integration.** Italian e-invoicing is not a generic payments feature and cannot be estimated by analogy to Stripe.
→ Engage an Italian tax/e-invoicing adviser during Track 0, not during Track C.

**R6 — Capacity is unmeasured, not merely unproven.** 20,000 athletes and 2,000 concurrent sessions have never been tested. A load test in week 12 that fails leaves four weeks to re-architect.
→ Run a thin end-to-end load probe as soon as A6 is up, in week 5, on the real deployment. Find the ceiling early enough to move it.

**R7 — Single point of failure in the delivery itself.** 72 commits across four repositories exist only on one machine. Three repositories have no remote; the participant repository's entire revamp branch has never been pushed.
→ Not scheduled here, per product-owner decision. Recorded because it is a live delivery risk, not a technical opinion.

---

## 8. Recommended first five days

1. **Take the Track 0 decisions** (§3). Eight decisions, all with defaults. A meeting, not a project.
2. **Name the paper-track owner** (D6) and hand them §2 Kind 3 as their backlog.
3. **Request the EOI dataset** (D8) — the longest lead time in the plan.
4. **Fix E5** — remove the invented uptime and capacity numbers from under the "Live Production Env" badge. One day, and it removes the most quietly damaging thing in the demo.
5. **Start B1** — collapse the two rule registers. Pure data work, no substrate needed, and it closes the highest-severity correctness defect in the product.

Items 4 and 5 are the only engineering in week 1, and both are deliberately chosen to need nothing from Track 0.

---

*Sources: `RFP_COMPLIANCE_AUDIT.md` (5 Sep 2026); `RFP_COMO2027.md` (108 IDs, §3.1/§3.2/§9.1/§9.3); `DELIVERY_PLAN_COMO2027.md` §4/§7; `Backend - Registration Phase Requirements & Core Architecture Foundation.md`; Stupa V1 proposal (31 Aug 2026). Structural facts F1–F5 re-verified against the running code on 6 Sep 2026. RFP dates are authoritative where the backend note compresses them.*
