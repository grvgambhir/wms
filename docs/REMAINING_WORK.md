# What remains — the work ledger

**Rewritten:** 16 September 2026 · **updated** the same day after REV-076 (team/partner registration)
**Method:** every line below was checked in the code or the running system today. Items are marked
**verified** (I ran the check) or **open question** (needs a decision, not engineering).

---

## 1. Where the product actually is

Working, backend-backed, hand-tested in a browser:

| Area | State |
|---|---|
| Participant registration | Sign in → profile + consents → **My Entries** → **Register** (individual products) → evidence → checkout → status. Real Postgres, token-scoped. |
| Admin Registrations work queue | List with filters/counts/keyset paging, detail with category lineage + status history + money + evidence summary, lifecycle actions with confirm + reason, audited CSV export. |
| Rules | Rule sets/versions, publish with impact, category checker (test a date of birth without registering). |
| Money (our side) | Orders, fees, tax, quota/waitlist, invoices, refunds, reconciliation — all in the database with guarantees as constraints. |
| Accreditation | Desk issue/reissue/revoke, participant pass screen, ACC-03 gates. |
| Competition | Category combination (CMP-03), start lists, roster locks + games-time substitution revalidation (CMP-04). |
| Team / doubles entries | **REV-076:** an athlete creates the team (`POST /v1/me/entries/:entryId/team`), invites, and the invited athlete accepts from their own Invitations screen; category is re-derived and audited. Two real logins, no simulated acceptance. |
| People & roles | Invite, roles, MFA enrolment + guard for privileged routes. |
| Exceptions, Assisted registration, Communications | Backend-backed (`ops` module); Communications composes and logs, but **cannot actually send**. |

Counts today: 121 backend routes, 351 backend tests, 81 admin tests, 116 participant tests; backend
typecheck + build clean. CI workflows exist in all four repos.

---

## 2. Blocking a real registration (product gaps)

### Deferred — client/infra decisions, not engineering. Do not raise proactively; revisit only when asked.

| # | Gap | Effect | Size |
|---|---|---|---|
| 2.2 | **Evidence files are never stored or scanned.** `evidence-storage.ts` is a stub that returns an S3 key; no bucket, no KMS, no antivirus. `scan_status` is written as `clean`. | REG-10 / EVD-02 unmet; medical and para evidence has nowhere real to live. | medium |
| 2.3 | **Payments are a stub provider.** No capture, no SCA/3DS, no callbacks, no reconciliation against a PSP. | Nobody can actually pay. **Blocked on D4.** | large |
| 2.4 | **EOI / pre-registration import for ~15,000 records** does not exist (only the claim half). | The real athlete population cannot be loaded. **Blocked on D8.** | large |
| 2.5 | **Communications cannot send email or SMS.** No SES/provider adapter; SES production access never requested. | Nothing reaches an athlete outside the portal. | medium |

### Active

| # | Gap | Effect | Size |
|---|---|---|---|
| 2.7 | Grade self-selection, screening, review and appeal (REG-04); data-subject rights workflow (PRV-05/06); accreditation depth — photo QC, duplicate review, bulk print, offline packs (ACC-02/04/06). | RFP Musts with no implementation. | medium–large each |

---

## 3. Known bugs and inconsistencies (verified today)

1. ~~Derived category disagrees with the entry~~ — **fixed (REV-078)**: the derivation read the team's
   membership list instead of the entry's approved roster version, and the seed pinned categories to
   bands the rule version does not have. All nine seeded entries now agree.
   ~~Demo scenario 2's script no longer matches the rules fixture~~ — **fixed (REV-081)**: the
   backend fixture was the only place using ten-year bands; it now matches the quota/fee ids and the
   participant mock, and the scenario's recalculation works again.
2. **Reinstate always returns a cancelled entry to `draft`**, even when it was confirmed and paid.
   Needs an OC rule, not a code guess.
3. ~~Reason optional in the backend~~ — **fixed (REV-077)**: the database refuses an admin
   cancel/disqualify/substitute without one.
4. **Restricted evidence count is per athlete and event, not per entry** — `core.protected_evidence_ref`
   is keyed that way, so the screen now labels it as such rather than pretending otherwise.
5. ~~Export audit always `oc_staff`~~ — **fixed (REV-077)**: it records the exporter's own role.
6. **Uptime, p95 and live sessions are not measured at all.** The dashboard now says so instead of
   showing invented figures, but real observability is still missing (see 4.4).
6. **Seeded entries have no status history**, and seeded team members show "confirmed" with "Unpaid".
   Demo-data quality, not a code fault — but it is what a client sees.
7. **Admin has no Italian**: the EN/IT switch in the admin shell is a placeholder app-wide (PLT-02 is
   only satisfied in the participant app).
8. **Participant app still runs on mocks** for auth, events, athlete, documents, payment, Games hub and
   results (`src/data/providers/repositories.ts`).
9. ~~A doubles entry cannot change partner once it has one~~ — **fixed (REV-087)**: the
   `partner_profile_id IS NULL` filter was removed from both lookup queries; accepting a partner
   never touched entry status, order or payment, so replacing one needed no propose/approve
   ceremony. The misleading `partner.request.entry_not_found` 404 goes away with it, since that
   path no longer misfires for "already has a partner".
10. **A confirmed team's roster change updates the category but not the paid order.** After REV-086
    (propose/approve), approving a roster change writes the new category to the entry but does not
    re-price the already-captured order — Basketball's Finance row still reads the original €600.00
    after the entry moved to Men's Team 30–34. Whether a category change after payment should trigger
    an upcharge/refund is a product decision (see §5), not something to guess at in code.
11. ~~A2/A3/A5's real-attempt discovery: `core.waitlist_entry` was seed-only, and `release-offer`/
    `expire-offer` had no reachable caller~~ — **fixed (REV-088)**: `claimQuotaForEntry` now makes
    the entry eligible to join the waitlist on genuine capacity exhaustion (written after the
    failing transaction rolls back, not inside it — the first attempt deadlocked a test by trying
    to write inside it, which is how this was actually caught); a new admin **Waitlist** screen
    calls the already-correctly-staff-gated release/expire endpoints, which is where they were
    always meant to be called from, not the participant's own tab (the "(demo)" release button and
    the client-side auto-expire both 403'd for a real participant — removed).
12. **A claim from the waitlist can still fail to price itself.** If an entry reached the waitlist
    on its very first save (i.e. `saveEntryTx` never got past `QUOTA_FULL`), its category was never
    persisted either — the same rollback undoes both. `claimWaitlistOffer` now creates the missing
    order (REV-089) but does not re-derive the category, so a category-specific fee lookup still
    refuses with `FEE_NOT_CONFIGURED` (checked live: Luca's Basketball claim hit exactly this).
    Category-agnostic products are unaffected. The real fix is unifying where `saveEntryTx` and
    `claimWaitlistOffer` persist `current_roster_version_id`/`current_category_id`, which needs its
    own reviewed change — not safe to improvise alongside the rest of REV-089.
13. ~~A4's evidence approval refused every re-verification~~ — **fixed (REV-090, Codex)**:
    `entrant_attribute_superseded_by_fkey` is now `DEFERRABLE INITIALLY DEFERRED`, checked at
    commit instead of per-statement, so `materializeApprovedAttribute`'s existing UPDATE-then-INSERT
    order is correct. Re-verified live 17 Sep: all three of Daniel's Judo evidence items (belt,
    weigh-in, federation licence) approved cleanly and the entry reached Confirmed, €0.00 variance.
14. ~~A4's refusal → raise-exception → dual-approval chain was only test-covered, never walked
    live~~ — **walked live 17–18 Sep (REV-091, REV-092)**: licence refusal as Luca, belt refusal
    as Ritesh Kumar (Marco has no real Cognito login), each raised and dual-approved 2/2 by two
    genuinely distinct OC logins. All three Judo eligibility sub-cases (weight, belt, licence) are
    now live-verified; A4 has no remaining untested path.
15. **Admin portal had no real identity display or action feedback** — the top-right block was a
    static placeholder and mutating actions gave no confirmation beyond an inline error banner —
    **fixed (REV-091)**: a real `AccountMenu` dropdown (name/email/role/Log out) driven by the
    session, and a toast on every mutating action across the portal (grant/invite, evidence
    review, exceptions, waitlist, roster changes, registration lifecycle, refunds, broadcasts,
    rule publish, accreditation, assisted registration, operations).
16. ~~Pressing Enter/Return on an OTP screen did nothing~~ — **fixed (REV-093)**: `OtpInput` had
    no `onSubmitEditing` wiring; added it, used on sign-up confirm and forgot-password (code and
    password fields).
17. ~~A6 (Para-swimming) was entirely unstarted, blocked on a Cognito account~~ — **walked live
    18 Sep (REV-093)**, as Elena Rossi: pre-seeded entry, S9 para-classification already approved
    with a live restricted-access-log timestamp, clean export PASSed with zero medical content,
    OC detail view confirmed the same from the admin side. **List A (A1–A8) has no remaining
    unverified scenario.**

---

## 4. Before production — infrastructure and operations

| # | Item | State |
|---|---|---|
| 4.1 | **No deployment of any kind** — no environment, no IaC, no restored-backup drill | **Blocked on D3** |
| 4.2 | ~~Service connects as the database owner~~ — **done (REV-080)**: runs as `app_rw`; the owner is only used by migrations, seeds and dev scripts, and development warns if it finds a superuser | done |
| 4.3 | **AWS credentials sit in `wms_backend/.env` and were shared in chat** — rotate | user action |
| 4.4 | ~~No structured logging, request id, metrics or build identity~~ — **done (REV-079)**: JSON logs with request ids, `GET /v1/metrics`, `buildId` on health. Still missing: shipping logs somewhere, alerts, and tracing across services | small |
| 4.5 | Load envelope never run at the real 20k/2k shape (only a local 14k probe and a 20k EXPLAIN exercise) | medium |
| 4.6 | **`wms_backend` is not under version control at all**; the other three repos have 64/103/9 uncommitted files | your call, stated as fact |
| 4.7 | Backups, retention schedule, DPA/ISMS/insurance paper track | **Blocked on D6 — owner still unnamed** |

---

## 5. Decisions only the client/OC can make

| | Decision | Blocks |
|---|---|---|
| **D4** | Payment service provider | 2.3 — payment stays a stub |
| **D8** | EOI data handover (schema + extract) | 2.4 entirely |
| **D3** | Hosting region and provider | 4.1 and all launch readiness |
| **D6** | Paper-track owner (DPA, ISMS, insurance) | the whole compliance track |
| — | SES production access | 2.5 and every email test |
| — | Reinstate policy for paid entries; which category derivation is authoritative | 3.1, 3.2 |
| — | Does an approved roster change re-open the order (upcharge/refund the fee delta) or leave the original payment standing | 3.10 |

---

## 6. Suggested order

1. Evidence storage + scanning (2.2) — needs a bucket decision but not a PSP.
2. Everything else waits on D3, D4, D6, D8 — or pick from section 2: competition admin screens,
   Italian in the admin portal, or REG-04 grade screening.
