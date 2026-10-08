# Task: invoicing, refunds and promotions on the backend

Repo: `wms_backend`. **Backend only** — the admin Finance screen is wired later, by the
`wms_api` retirement task. Do not edit `wms_admin` or `wms_participant`.

You already built the order and payment path (`registration-mutations.ts`), so this is the
same money, continued: what happens *after* capture.

---

## What exists and what is missing

Tables are all present: `core.invoice`, `invoice_line`, `invoice_series`,
`invoice_tax_summary`, `refund`, `refund_allocation`, `promotion`, `order_promotion`,
`tax_rule`. Nothing reads or writes most of them. The admin Finance page runs on
`wms_api`'s in-memory mock.

Read each table's constraints before designing — several rules are already enforced there and
must not be re-implemented in TypeScript:

- `core.refund_needs_two_people` — a refund needs two distinct people. This is dual control
  for money and it is the rule someone under pressure would most like to bypass. Let the
  constraint refuse; do not pre-check and report your own message.
- `line_not_over_refunded` — the sum of allocations cannot exceed the line.
- `core.roll_up_order_totals`, `core.split_inclusive`, `core.proportional_tax_split`,
  `core.tax_on_net` — the money arithmetic lives in SQL. Do not compute totals in TypeScript.

## Invoice numbering is the part that is easy to get wrong

`invoice_series` exists because **invoice numbers must be gapless and sequential per series**
— that is a legal requirement for Italian invoicing, not a preference. Two things follow:

- A number is allocated **inside the transaction that creates the invoice**, and a rolled-back
  invoice must not burn a number. `max(number)+1` read outside the lock will collide under
  concurrency; a plain sequence will leave gaps on rollback. Read what the table gives you and
  use it; if it does not solve this, say so rather than choosing one of the two broken options.
- An issued invoice is **immutable**. A correction is a credit note, not an edit. If the schema
  does not enforce that, report it — do not add an `UPDATE` path.

`invoice_tax_summary` exists because an invoice states tax **per rate**, not one total. VAT at
22% and an exempt line cannot be collapsed into a single figure.

## FatturaPA is deliberately not in scope

Italy requires electronic invoices through the SDI exchange. Transmission is deferred (it needs
the OC's tax adviser and a registered intermediary — decision D4 is still open). So:

**Model the invoice so the data FatturaPA needs is captured**, and stop there. Do not build
XML generation and do not call any external service. If a required field has no home in the
schema, list it — that list is the useful deliverable for the tax conversation.

## Refunds and promotions

- Refund: request → second approver → allocation against specific lines → the entry's status
  moves through the guarded REG-11 writer, not by hand. A refund that changes an entry's
  status by direct write is the same defect REV-044 closed.
- The PSP refund call goes through the existing `payment-provider.ts` seam with the stub. Same
  **external** idempotency mode as capture — a refund charged twice is worse than a capture
  charged twice.
- Promotions: `promotion` + `order_promotion`. Apply at order level, recompute totals through
  the SQL roll-up, and make sure a promotion cannot take a line below zero.

## Reporting

OPS-04 wants configurable reports with filters, saved views and export, with access controls
**and export audit**. Build the read side — a keyset-paginated, filterable settlement/order
query — and **log every export with who ran it and what filter** (the audit is the requirement;
the CSV is the easy part).

`@Roles('finance', 'oc_admin')` on everything here. A refund endpoint reachable by `oc_staff`
is a finding, not a convenience.

## Tests

- A refund approved by the same person twice is refused **by the constraint**.
- Concurrent invoice creation produces **no duplicate and no gap** in a series — run it as real
  concurrent transactions.
- A rolled-back invoice does not consume a number.
- Over-refunding a line is refused.
- Tax summary splits two rates correctly; `gross = net + tax` at every level.
- A promotion cannot drive a line negative.
- An export writes an audit row naming the actor and the filter.
- `oc_staff` is refused on refund endpoints.

## Definition of done

Run all three from `/Users/gauravgambhir/Desktop/Code_Life/wms` and paste the output:
`npm run test:backend`, `npm run typecheck:backend`, `npm run build:backend`.
Also run `npm run plan:drift` — if you add a table, update `BACKEND_DB_PLAN.md` in the same
change. Three times in this project a table was designed, reviewed, recorded as done, and never
migrated; that script exists because of it.

Then drive one order end to end with `curl`: capture → invoice → partial refund with two
approvers → credit note. Paste the responses and the resulting totals.

**Coordinate before running the suite** — another agent is in this repo and
`test/globalSetup.ts` writes the throwaway database URL to one shared file.
