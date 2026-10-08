# Task: load the demo data into the real schema

The backend has 68 tables and **no data**. `wms_api` has a complete, working demo dataset
that drives every shipped screen. Port it, so the participant and admin apps can be
demonstrated against the real database instead of a JSON file.

This is the step that turns the schema from furniture into a product.

Repo: `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_backend`
Fixtures: `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_api/src/data/fixtures/data-hub/` (19 files)
Plan: `.../wms_participant/context_docs/docs/BACKEND_DB_PLAN.md`

**Node 22 required.** Run after F06/F08/F09 is merged, so every table exists.

---

## What this is not

Not a migration. Seed data is **not** schema, and it must never live in `migrations/`. Put it
in `seeds/` with its own runner (`npm run seed`, `npm run seed:reset`), safe to run repeatedly.

Not a rewrite of the fixtures either — `wms_api` keeps working until the apps are cut over.
Read them, do not move or edit them.

---

## Step 1 — map before you load

The fixtures were written for the old single-quota, age-only-rules, one-order-per-entry
model. The schema has moved. **Produce a mapping table before writing any loader**, and
report anything you cannot place:

| Fixture file | Target table(s) | Fields with no home | Fields the schema needs that the fixture lacks |
|---|---|---|---|

Places the shapes are known to differ — check each, do not assume:

- `quotas.json` is one quota per (product, category). The schema has **`quota_pool` +
  `entry_quota_consumption`**. Decide what pool structure the demo data implies — at minimum
  a product pool; a nested sport cap would demo the feature better. Say what you chose.
- `sport-rules.json` has `strategy` + `bands`. The schema has **`rule_dimension`** rows.
  Age becomes one dimension with the matching aggregation (`individual` → `self`,
  `youngest-member` → `min`, `crew-average` → `mean` + `excludeRoles`, `relay-aggregate` →
  `sum`). A rule version needs `content_hash` and an impact analysis before it can go
  `active` — seed it as a published version properly, do not bypass the constraint.
- `orders.json` / `payments.json` predate net/tax/gross, allocations and invoices. Give the
  demo at least one **paid** order with allocations so `roster_member_balance` shows
  something real, and one **part-paid team order** so the unpaid-member query has an answer.
- `team-rosters.json` is a flat member list. F06 splits team / roster version / selection.
  The rowing crew with a reserve is the interesting case — seed it so the reserve is *in the
  team* but *not in the selected version*, because that is the bug F06 exists to prevent.
- `documents.json` / `evidence.json` predate requirement → obligation → upload → review.
- `accreditations.json` now needs `valid_from` / `valid_until`.

Where a fixture field has no home, **report it — do not invent a column.**

---

## Step 2 — the loader

- Idempotent: `npm run seed` twice leaves the same rows. Use deterministic ids derived from
  the fixture ids, not fresh uuids each run.
- Ordered by dependency, reusing §4.0.4's order.
- Refuses to run when `NODE_ENV=production`.
- `seed:reset` truncates the seeded tables and reloads — it must not drop schema.
- Passwords for seeded people go through the **existing** auth path (`argon2-options.ts`),
  never a literal hash.
- Restricted rows load through the restricted role, not `app_rw`.

---

## Step 3 — prove the demo actually works

Tests (Vitest, real Postgres) asserting the seeded data supports the shipped journeys:

- the tennis singles athlete has an entry, a fee, a paid order and an invoice
- the basketball team's category comes from the **youngest selected** member
- the rowing crew's category is the **average excluding the cox**, and **excluding the
  reserve** — if the reserve changes the answer, the F06 split is not seeded correctly
- the waitlisted athlete sits behind a full pool, and the pool that binds is the narrow one
- the para athlete's restricted evidence exists and `app_rw` cannot read it
- one athlete has an accreditation with a validity window that has not expired

Then check it end to end yourself: `npm run dev`, log in as the seeded participant
(`AUTH_SEED_*` in `.env.example`), and confirm `GET /v1/auth/me` returns them. Say in your
report whether you did this.

---

## Do NOT

- ❌ Put seed data in `migrations/`
- ❌ Modify `wms_api`, `wms_domain`, `wms_participant`, `wms_admin`
- ❌ Edit `BACKEND_DB_PLAN.md` — report what it should say
- ❌ Touch `src/registration/*` — repositories are being written in parallel
- ❌ Add columns to make a fixture fit. If it does not fit, that is a finding.
- ❌ Bypass a constraint to get data in. If the seed cannot satisfy `active_needs_impact_analysis`
  or `quota_not_exceeded`, the seed is wrong, not the constraint.

---

## Report back

1. The mapping table, including everything with no home
2. What pool structure you gave the demo, and why
3. Anything you had to invent because the fixtures do not carry it (dates, tax rates, roles)
4. Whether the live login worked
5. What the plan should say
6. What you could not verify
