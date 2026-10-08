# D4 — Payment service provider: decision brief

**Written:** 11 September 2026
**Status:** For product-owner decision
**Blocks:** the payment stub in `wms_backend/src/registration/payment-provider.ts`, and with it
every PAY-* requirement, refunds, and the finance reconciliation work.
**Plan reference:** `PHASE_B_PLAN.md` Track 0, D4 — recorded there as *"Stripe — faster
SCA/3DS, but confirm FatturaPA/SDI path with an Italian tax adviser."*

That entry is a leaning, not a decision. This brief is written to close it.

---

## 0. What is actually being decided

Three things get conflated and they are separate, with different owners:

| | What it is | Who decides |
|---|---|---|
| **Acquiring** | who takes the card payment and settles the money | this brief |
| **E-invoicing (FatturaPA / SDI)** | the legal invoice sent to the Italian exchange system | the OC's tax adviser — **not the PSP** |
| **Tax determination** | which VAT rate applies to an entry fee, per payer | tax adviser, informed by the OC's legal setup |

**Neither Stripe nor Adyen transmits invoices to SDI.** Assuming the PSP handles it is the most
common and most expensive misunderstanding in an Italian project, because it is discovered
late. The schema already anticipates the split: `core.invoice`, `invoice_series`,
`invoice_tax_summary` are ours, and no PSP writes to them.

So D4 is narrower than it looks: **who acquires the card payment.**

---

## 1. What this event asks of a PSP

Not generic e-commerce. The shape matters more than the feature list.

- **~14,000 athletes**, most registering inside a few weeks of opening — a spike, not a
  baseline. Registration opens 17 Sep 2026; the Games are 17–26 Sep 2027.
- **Money is collected up to twelve months before delivery.** This is the single most
  important fact in this brief. See §3.
- **International payers, Italian merchant.** SCA/3DS applies to EEA cards; non-EEA cards
  behave differently and the failure modes differ.
- **Refunds and cancellations are routine**, not exceptional — withdrawals, category changes,
  waitlist releases, team dissolutions.
- **EEA data residency** (DAT-02) constrains where payment data is processed and stored.
- **One event, then a long tail** — reconciliation, refunds and disputes continue well past
  the closing date (RFP §6.3 Phase F runs to 31 Dec 2027).

---

## 2. Stripe vs Adyen — the structural differences

Pricing is deliberately omitted. Published rates change, negotiated rates differ from
published ones, and for this volume the difference between the two is unlikely to decide it.
Get quotes; do not decide on list prices, and do not take any number in this brief as current.

**Stripe** is self-serve and developer-first. Onboarding is days. SCA/3DS handling, retries and
the hosted payment surfaces are mature and require little of us. Its documentation and test
surface mean the integration behind our seam is small. For a single event with a fixed deadline
and one engineering team, this is the significant advantage.

**Adyen** is enterprise: direct acquiring, multi-acquirer routing, finer control over
authorisation rates, stronger unit economics at sustained high volume. Onboarding is a sales
process with commercial minimums and takes weeks. Its advantages compound over years of steady
volume — which is not this event's shape.

**The honest summary:** Adyen's strengths are real and are optimisations for a business that
processes continuously. Ours processes intensely, once, against a fixed date, with a deadline
already at risk. Stripe's advantage here is time-to-integrated and the small size of the
integration, and that is the constraint that actually binds.

---

## 3. The risk nobody plans for: reserves on deferred delivery

**Collecting money twelve months before the service is delivered is, to a PSP's risk team, a
high-risk pattern.** It is the profile of event and travel businesses that fail before
delivering, leaving the acquirer liable for chargebacks. The standard response is a **rolling
reserve** — a percentage of settlement withheld for a period — or a delayed payout schedule.

Combine that with a new merchant account and a sudden spike of thousands of transactions in
days, and an automated risk review is likely rather than possible. Both providers do this.

**The consequence is cash-flow, not technical.** The OC may not be able to spend registration
income when it expects to. That is a finance-planning fact that has to reach whoever is
budgeting the event, and it is not a reason to choose one provider over the other — it is a
reason to raise it with both, in writing, before signing.

**Mitigation, and it must happen early:** disclose the event, the timeline and the delivery
date to the PSP during onboarding; provide the OC's standing, the event's contractual basis
and insurance; agree the reserve terms in the contract rather than discovering them after the
first spike. A PSP told in advance underwrites this routinely. A PSP surprised by it freezes
funds first and asks afterwards.

---

## 4. What our architecture already decided

`payment-provider.ts` is an injectable seam with a deterministic stub, and the idempotency key
is committed as `in_progress` **before** the call leaves (`external` mode). Two consequences:

- **The choice is reversible.** Switching providers later is one implementation of one
  interface, not a rewrite. This lowers the cost of being wrong, and it is a reason not to
  spend months on the decision.
- **Nothing is blocked in the meantime** — the stub answers, the flow is tested end to end,
  and `chargeCount: 1` on replay is already proven.

What we should **not** do is let the stub drift into looking like a real integration. The
longer it stands in, the more its shape is assumed. That is the actual cost of leaving D4 open.

---

## 5. Recommendation

**Stripe**, on time-to-integrated and the reversibility of the seam — unless the OC already has
an Adyen relationship or an acquiring arrangement through a banking partner, in which case that
relationship outweighs everything in §2 and the answer is to use it.

Confidence: **moderate**. It follows from the event's shape and our architecture, both of which
are established. It does not account for the OC's existing banking relationships or negotiated
terms, which are unknown here and could reasonably change the answer.

---

## 6. Questions that must be answered by someone other than engineering

**For the OC / WMS:**

1. Is there an existing acquiring relationship, or a banking partner expecting this business?
2. Which legal entity is the merchant of record, and in which country is it established?
3. Who is the OC's Italian tax adviser, and have they been engaged? (This gates FatturaPA, and
   it is on the critical path — see §0.)
4. What is assumed about when registration income becomes spendable? (§3 — ask before, not
   after.)
5. Are entry fees the only thing being charged, or do accommodation, merchandise or transport
   follow? Multiple product types with different VAT treatment change the tax work
   substantially, though not the PSP choice.

**For the tax adviser:**

6. Do participant entry fees require FatturaPA transmission to SDI, and does the answer differ
   for Italian-resident and foreign athletes?
7. Which VAT rate applies to an entry fee, and does an athlete's residence change it?
8. Which registered intermediary will transmit to SDI, and what format do they need from us?
   (Our schema captures the data; someone must carry it.)
9. What are the invoice numbering and retention obligations? — `invoice_series` exists because
   numbering must be gapless and sequential per series, and that constraint comes from tax law,
   not from us.

Questions 3 and 8 are the ones with the longest lead time. Ask them first, even before the PSP
is chosen: the e-invoicing path is independent of the acquiring decision and is more likely to
be the thing that slips.
