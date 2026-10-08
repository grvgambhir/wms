# Task: configurable evidence requirements and registration policies (F07, F11)

Two audit findings with the same shape: **things that are hardcoded today but the tender
requires the OC to configure**, plus the version history that makes those decisions
defensible later.

Repo: `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_backend`
Plan: `.../wms_participant/context_docs/docs/BACKEND_DB_PLAN.md` §4.4, §4.7
Audit: `/Users/gauravgambhir/Desktop/Code_Life/wms/BACKEND_DB_RFP_AUDIT.md` — read **F07 and F11 in full**

**Node 22 required** (`argon2` segfaults on Node 20). Run after your F04/F05 work is merged.

---

## F07 — evidence

EVD-02 requires per document type: "required/optional logic, sport applicability, issuing
country, issue/expiry date, version, secure upload, malware scanning, reviewer status,
rejection reason and participant resubmission". EVD-04 adds OC-defined formats and
translations, approved waivers, and outstanding/expired reporting.

Today `core.evidence_document` is one row per upload with a status. It cannot express:

- "licence required for **this sport** through Games day"
- "translation required when the issuing country is **X**"
- "medical certificate optional **after an authorised waiver**"
- rejected **version 1** and accepted resubmission **version 2** as the *same obligation*
- which ordinary licences expire before the event

**Model the distinction the audit names:** a *logical document* (the obligation) →
*immutable upload versions* → *review decisions*. An S3 object version is not the issued
document's version, and conflating them loses the resubmission history.

Requirements are **versioned policies with applicability**, not booleans on a product.
Waivers are an approved link to a requirement, not a status.

**Same metadata contract must hold for `restricted.evidence_document`** — medical and para
evidence has the same lifecycle and must not become a second, weaker model.

---

## F11 — registration policy

REG-08 requires "sport-specific minimum/maximum roster, event-entry limits, incompatible-event
rules and deadlines". REG-11 requires "a configurable status lifecycle". NFR-04 requires
configuration for routine workflow changes.

Today `uq_entry_live` enforces one live entry per product. That cannot express:

- "at most three events per athlete"
- "crew of exactly four plus a cox"
- "roster substitutions close 14 days before"
- which **actor** may move an entry between which statuses, under sport-specific prerequisites

`@wms/domain`'s `statusLifecycle.ts` has the transition table in **code**. The tender wants it
configurable and versioned. Do **not** delete or rewrite the code table — model the
configuration alongside it and say in your report how the two should reconcile. Deciding that
is a design call I want to make with you, not have made silently.

Policies are **versioned and scoped** (product / phase), and an evaluation records **which
policy version** it was judged under — same principle as `registration_entry.rule_version_id`.

---

## Rules that apply to both

1. **Guarantees go in the database.** This schema puts them in constraints — `quota_not_exceeded`,
   `line_not_over_refunded`, `refund_needs_two_people`. Where a policy limit can be a constraint
   or an exclusion, make it one. Where it genuinely cannot (a count across rows), say so and
   explain what enforces it instead.
2. **Published configuration is frozen.** Rule versions are frozen once they leave `draft`
   (`core.rule_child_frozen`). Evidence requirements and registration policies are the same kind
   of object: an entry judged under version 3 must still be explainable when version 5 is live.
3. **No hardcoded English.** Refusal and requirement messages carry an i18n key
   (`core.translation`), never a message — PLT-02 is a launch requirement.
4. Money `bigint` minor units, `timestamptz` UTC, UUIDv7 keys, raw SQL migrations in the house
   style with comments saying *why*.

---

## Prove it

Vitest against real Postgres (`test/concurrency.spec.ts` for the pattern). At minimum:

- a requirement applying to one sport does not apply to another
- rejected v1 and accepted v2 are the **same obligation**, and the history survives
- an approved waiver removes a requirement without deleting it
- an expired licence appears in an outstanding/expired query
- an entry violating a roster cardinality is refused
- a policy edit after an entry was judged does **not** change that entry's judgement
- the app role still cannot read `restricted.*`

`npm test`, `npm run typecheck`, `migrate:up → down → up` all clean, and apply the migration
to `wms_dev` too — a throwaway-database-only run has missed things before.

---

## Do NOT

- ❌ Touch money, auth, quota or rule tables, or `src/common/*`
- ❌ Edit `BACKEND_DB_PLAN.md` or anything in `wms_domain` / `wms_participant` / `wms_admin` / `wms_api`
- ❌ Rewrite `statusLifecycle.ts` — report how it should reconcile with configuration
- ❌ Build UI, endpoints or an admin editor. Schema and tests only.

---

## Report back

1. Your model for logical document → version → review, and why
2. How configurable transitions should reconcile with `statusLifecycle.ts`
3. Which limits you made constraints, and which could not be, and what guards those instead
4. What the plan should say
5. Anything in F07/F11 you think is wrong — argue with me rather than build something you
   disagree with
6. What you could not verify
