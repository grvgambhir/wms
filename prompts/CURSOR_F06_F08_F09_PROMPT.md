# Task: roster selection, restricted-data governance, communications templates (F06, F08, F09)

The last three audit findings before the backend is feature-complete against the tender.
They are independent of each other — do them in the order below, one migration each, so a
problem in one does not block the others.

Repo: `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_backend`
Plan: `.../wms_participant/context_docs/docs/BACKEND_DB_PLAN.md` §4.4, §4.7, §4.9
Audit: `/Users/gauravgambhir/Desktop/Code_Life/wms/BACKEND_DB_RFP_AUDIT.md` — read **F06, F08, F09 in full**

**Node 22 required.** Run after F07/F11 is merged. Apply migrations to `wms_dev` as well as
the throwaway test database — a test-only run has missed things twice now.

---

## F06 — a member list is not a selected roster

The concrete failure, from the shipped rowing crew: **the roster holds both the original
rower and the replacement, but only the selected subset competes.** Import every member into
today's flat `roster_member` and the reserve silently joins the crew-average age maths;
import only the active ones and you lose the substitute and the original selection. Team
name is dropped either way.

So separate three things the current model conflates:

- **Team** — a durable thing with a name, associated with a product. Membership is reusable.
- **Roster version** — the selection *as it stood* at a point in time. An entry references
  its original and its current version, exactly like `registration_entry.rule_version_id`.
- **Selection** — which members of the team are in *this* version, in which role.

Then: substitution as a **proposal → approval** pair, not an edit (TEA-04 wants fee, refund,
category and accreditation impacts recalculated *before* approval — so the proposed version
must exist unapproved). And invitations / join requests (TEA-01): target team and product,
**hashed** code or token, expiry, inviter, invitee contact, status, and who actually accepted.

Never store an invite token in plaintext — treat it exactly like the refresh tokens in
`core.refresh_token`.

REG-07 also asks for controlled roster publication and privacy; model the visibility, don't
build the UI.

---

## F08 — restricted data is a boundary, not a label

`restricted.*` already exists with its own role and no FK from `core`, and `app_rw` cannot
read it. That part works — verify it still does. What is missing is everything around it:

1. **Classification and ID sources are restricted, but their *outcomes* are operational.**
   The desk needs "para class S6, verified" without reading the medical certificate behind
   it. Define an authorised **redacted projection** — a view or a function granted to a
   specific role — that releases the class and the verification outcome and nothing else.
2. **A para fact must be able to cite its supporting document without granting access to
   it.** `core.entrant_attribute.evidence_id` currently points at `core.evidence_document`;
   for a restricted fact that reference has nowhere valid to go. Model a protected
   evidence-reference relationship that a general reader can see the *existence* of but not
   the contents.
3. **Lawful basis must bind to something real.** Today it is a free-text column with a
   default. Bind it to an approved basis / notice / consent record (`core.consent` exists),
   and add retention **holds** — a legal hold must survive a retention date.
4. **PRV-05 rights requests** need discovery across every component, not just this database,
   plus documented completion evidence. Model the request, the components searched, and the
   completion record. Name in your report which systems are in scope (S3, the IdP, the PSP,
   the mail provider) — that list is the deliverable, not a table.

`ACS-05` also asks for accommodation needs to be *operationally usable* by authorised OC
teams. `restricted.accommodation_need` exists; define the authorised reporting path.

---

## F09 — templates are not translated strings

`core.translation` and `core.locale` exist. They give language variants of a string. OPS-01
asks for something else: **approved reusable templates** with variables, preview, test send,
scheduling, throttling, unsubscribe/transactional classification and delivery status.

- **Template → version → approval.** A version carries the variable contract (which
  placeholders exist, which are required) so a send cannot reference a variable the template
  does not declare. Approved versions are frozen, like every other published thing here.
- **A send snapshots the content it used.** Re-translating a template later must not change
  what a participant was actually sent — same principle as `invoice_line`.
- **Suppression and classification.** Transactional messages ignore unsubscribe;
  marketing ones must not. Model the distinction and per-person suppression, because
  getting it backwards is both a GDPR problem and a deliverability one.
- **Delivery attempts per provider**, so a bounce is attributable and retryable.
- Scheduling: a queued future send with a throttle rate.

`core.broadcast` / `core.delivery` already exist — extend or supersede them, and say which
you chose and why.

---

## Rules for all three

1. **Guarantees in the database.** Constraints and exclusions where possible
   (`quota_not_exceeded`, `line_not_over_refunded` are the house style). Where a rule spans
   rows, use a trigger and say so.
2. **Published things freeze.** Roster versions, template versions, requirement versions —
   all the same rule as `core.rule_child_frozen`.
3. **No hardcoded English.** Refusal and message copy is a `message_key` into
   `core.translation`.
4. Money `bigint` minor units, `timestamptz` UTC, UUIDv7, raw SQL migrations in the house
   style, comments saying *why*.

---

## Prove it

Vitest against real Postgres. At minimum:

- **F06:** a crew with a reserve computes its category from the *selected* members only;
  a substitution proposal exists unapproved and does not change the live roster; approving
  it creates a new version and leaves the original readable; an invite token is not stored
  in plaintext
- **F08:** the redacted projection returns a para class to an authorised role while
  `app_rw` still gets `permission denied` on `restricted.*`; a legal hold prevents deletion
  past a retention date
- **F09:** a send snapshots content, and editing the template afterwards does not change
  what was sent; a transactional message reaches a suppressed recipient and a marketing one
  does not; a send referencing an undeclared variable is refused

`npm test`, `npm run typecheck`, `migrate:up → down → up` clean, and applied to `wms_dev`.

---

## Do NOT

- ❌ Touch money, auth, quota, rules, evidence-requirement or `src/common/*` tables
- ❌ Edit `BACKEND_DB_PLAN.md`, or anything in `wms_domain` / `wms_participant` / `wms_admin` / `wms_api`
- ❌ Integrate a mail/SMS provider — none is chosen. Model the boundary, call nothing.
- ❌ Build UI, endpoints or admin editors. Schema and tests only.

---

## Report back

1. Team / roster version / selection model, and how an entry references original vs current
2. The redacted projection: what it releases, to which role, and what it withholds
3. Which systems belong in a PRV-05 rights search
4. Whether you extended or superseded `broadcast` / `delivery`, and why
5. What the plan should say
6. Anything in F06/F08/F09 you think is wrong — argue rather than build it
7. What you could not verify
