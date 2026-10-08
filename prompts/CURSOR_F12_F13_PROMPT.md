# Task: restore shipped participant fields the new schema would drop (F12, F13)

An external tender audit found that the backend schema drops data the **already-shipped**
participant app displays and saves. These are regressions against working behaviour, not new
features — a migration in this state would silently lose live data.

Repo: `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_backend`
Plan:  `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_participant/context_docs/docs/BACKEND_DB_PLAN.md`
Audit: `/Users/gauravgambhir/Desktop/Code_Life/wms/BACKEND_DB_RFP_AUDIT.md` (findings F12, F13)

---

## Step 1 — find out what actually ships. Do not start from the audit.

The audit names two screens. **Verify independently** and report anything it missed:

- `wms_participant/app/(participant)/my-accreditation.tsx` — the participant's pass
- `wms_participant/app/(participant)/profile.tsx` — profile & consent

Trace each rendered/saved field back through its hook and repository to the domain type in
`wms_domain/domain/models/` (`accreditation.ts`, `athlete.ts`, `consent.ts`). Then check
`wms_api/src/data/` fixtures for fields the screens read but the models under-declare.

**Produce a table before writing any SQL:** field → domain type + line → where it is used in
the UI → does `BACKEND_DB_PLAN.md` §4.1 / §4.8 have a column for it → verdict (present /
missing / renamed).

Known starting points, to confirm not to trust:
- `Accreditation` carries `validFrom`, `validUntil`, `qrValue`, `accessLevel`, `registrationId`.
  `core.accreditation` has `zones[]` and `qr_secret` but no validity window.
- `AthleteProfile` carries `phone`, `passportNumber`, `emergencyContact {name, relationship,
  phone}`, `profileImageUri`, `profileImageKey`. `core.person` has none of these.

---

## Step 2 — one migration adding what is genuinely missing

New file in `migrations/`, timestamp after `1700000003000_platform.sql`. Raw SQL, matching the
house style in the existing migrations (comments explain *why*, not *what*).

**Two judgement calls you must get right, not just apply:**

**1. `passportNumber` does NOT belong in `core.person`.** PRV-04 classifies identity documents
as restricted data, and `BACKEND_DB_PLAN.md` §4.7 puts restricted data in its own schema with
its own role and no foreign key back to `core` — so a `SELECT *` on a person can never leak it.
Putting a passport number in `core.person` defeats that boundary on day one. Model it in
`restricted`, with `lawful_basis` and `retain_until` like its siblings there. Say in the
migration comment why it sits there.

**2. `emergencyContact` is one contact today, and the RFP does not cap it at one.** Decide
between inline columns and a `core.emergency_contact` table, and **write your reasoning in the
migration comment**. Either can be right; an undocumented choice is not.

Everything else — accreditation validity window, phone, image key — is a straightforward
column add.

Also add: the `down` migration, and indexes only where a query actually needs one.

---

## Step 3 — prove it

Add tests in `test/` (Vitest, real Postgres — the harness gives each run a throwaway database):

- every field from your Step 1 table now has a home, asserted by round-tripping a real row
- an accreditation with `valid_until` in the past is distinguishable from a current one
- the ordinary app role **cannot** read whatever you placed in `restricted` (pattern:
  `test/concurrency.spec.ts`, the `SET LOCAL ROLE app_rw` block — note it must be inside a
  transaction, `SET LOCAL` silently does nothing outside one)

`npm test` and `npm run typecheck` must be green, and `migrate:up` → `down` → `up` clean.

---

## Do NOT

- ❌ Touch `migrations/1700000004000_quota_pools.sql` or anything quota-related — that is being
  rewritten in parallel and will conflict
- ❌ Edit `BACKEND_DB_PLAN.md` — report what it should say and I will fold it in
- ❌ Modify `wms_participant`, `wms_admin`, `wms_domain` or `wms_api`
- ❌ Add columns "while you are there" for fields nothing ships yet — this task is regressions
  only. Anything else you notice goes in the report, not the migration.

---

## Report back

1. The Step 1 table, including anything the audit missed
2. Your reasoning on the two judgement calls
3. What the plan should say, so it can be updated to match
4. Anything you could not verify
