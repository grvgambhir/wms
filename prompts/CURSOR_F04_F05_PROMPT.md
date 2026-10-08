# Task: payment allocation and fiscal correctness (F04, F05)

Two findings from the external tender audit. Group orders exist; what is missing is knowing
**whose debt a payment settles** and **what a refund does to tax**.

Repo: `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_backend`
Plan: `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_participant/context_docs/docs/BACKEND_DB_PLAN.md` §4.6
Audit: `/Users/gauravgambhir/Desktop/Code_Life/wms/BACKEND_DB_RFP_AUDIT.md` — read **F04 and F05 in full** before starting

**Run after your auth work is merged.** This touches money tables only; auth touches
`core.person`. Do not run them concurrently.

**Node 22 is required** (`argon2` segfaults on Node 20 — exit 139, no message).

---

## The actual problem

`core.registration_order` belongs to a payer and `core.order_line` carries `entry_id`, so a
captain can pay for twelve entries in one order. Good. But:

- A `payment_intent` settles **an order**, not particular lines. With a €1,200 order and a
  €400 part payment, nothing records which four members are now paid.
- A refund reopens *someone's* balance — the schema cannot say whose.
- Tax lives on the line at capture time, but nothing snapshots the **rate and rule that
  applied**, so re-deriving an old invoice after a VAT change gives a different answer.
- A refund's tax component is undefined: refunding €90 gross from a 22% line must return
  €73.77 net + €16.23 VAT, and the credit note must say so.

TEA-02's "unpaid-member tracking" and PAY-05/PAY-06's reconciliation both sit on this.

---

## Decide these, and write your reasoning in the migration comments

**1. Allocation granularity.** Does a payment allocate to `order_line`, or to a coarser
"member balance"? Lines are precise and make partial payment natural; a balance layer is
fewer rows and closer to how a captain thinks. Pick one, say why, and make the unpaid-member
query a **single query** either way.

**2. Refund direction.** Does a refund allocate to the same lines the payment did, or is it
independent? They differ when two payments covered one line. Whichever you choose, a line's
`paid − refunded` must never go negative, and that must be a **constraint, not a service
check** — the rest of this schema puts guarantees in the database (see `quota_not_exceeded`,
`refund_needs_two_people`).

**3. Fiscal snapshot shape.** An invoice must be reproducible years later, after rates and
rules have changed. Snapshot on the invoice, on the line, or a versioned tax-rule table?
State the trade-off.

**4. Rounding.** Per-line or per-invoice, and how the remainder is distributed. Money is
`bigint` minor units everywhere (§3) — 22% of €90.00 is not a whole cent, and inconsistent
rounding is how a settlement file stops reconciling by a few cents a day.

---

## Build

One migration, timestamped after your auth one, raw SQL in the house style — comments say
*why*, not *what*. Likely tables (your design may differ; justify it):

- `core.payment_allocation` — which payment settled which line/balance, how much
- `core.refund_allocation` — the mirror, with the same non-negative guarantee
- tax snapshot columns or a `core.tax_rule` version table
- a view or documented query for **"which roster members are unpaid"**

Also update `core.refund` if it needs a tax breakdown, and make sure a credit note can carry
net/tax/gross that agree with what it corrects.

---

## Prove it

Vitest against real Postgres (the harness gives each run a throwaway database; see
`test/concurrency.spec.ts` for the pattern):

- €1,200 order, twelve entries, €400 paid → exactly four members read as paid, eight unpaid
- over-refunding a line is **rejected by the database**, not by a service check
- a 22% line refunded in full returns the right net/tax split, and the credit note's
  net + tax = gross
- an invoice re-rendered after the tax rule changes still shows the original figures
- rounding: an amount that does not divide evenly still sums to the order total exactly

`npm test`, `npm run typecheck`, and `migrate:up → down → up` all clean.

---

## Do NOT

- ❌ Touch auth, quota, rules, or `src/common/{idempotency,http,pagination}`
- ❌ Edit `BACKEND_DB_PLAN.md` — report what it should say
- ❌ Modify `wms_participant`, `wms_admin`, `wms_domain`, `wms_api`
- ❌ Integrate Stripe or any PSP — D4 is unmade; model the boundary, call nothing
- ❌ Implement FatturaPA/SDI transmission — that needs an Italian e-invoicing specialist
  (risk R5 in `PHASE_B_PLAN.md`). Leave the columns and say what is unresolved.

---

## Report back

1. Your four decisions and the reasoning
2. What the plan should say
3. Anything in F04/F05 you think is **wrong** — the audit is not automatically right, and I
   would rather argue than have you build something you disagree with
4. What you could not verify
