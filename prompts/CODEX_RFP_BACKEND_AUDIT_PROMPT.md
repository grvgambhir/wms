# Task: adversarially audit a backend + database plan against the RFP tender document

You are auditing an unimplemented backend/database design **before** any code is written against it.
A defect you find now costs one edit. The same defect found after implementation costs weeks.

Work on this machine. Read the real files. **Do not reason from any document's own prose about what
the codebase or the RFP contains — open both and check.**

---

## The one question you are answering

> **Per the RFP tender document, is this backend and database plan solid — or will it fail to deliver
> requirements the tender makes mandatory?**

This is a *requirements-coverage* audit, not a SQL-syntax audit. A previous pass already covered DDL
executability, concurrency and performance. Your job is the tender: every "Must", every mandatory
gate, every §3.x characteristic and §9.x scenario — can this schema actually deliver it, or does it
structurally prevent it?

---

## Files

**The plan under audit**
```
/Users/gauravgambhir/Desktop/Code_Life/wms/wms_participant/context_docs/docs/BACKEND_DB_PLAN.md
```

**The tender documents — THE AUTHORITY. Read the PDFs, not only the markdown.**
```
/Users/gauravgambhir/Desktop/Code_Life/wms/wms_participant/context_docs/RFP WMS Como2027 Software Final.pdf
/Users/gauravgambhir/Desktop/Code_Life/wms/wms_participant/context_docs/IMGA Software RFP Ver 1.1 Final.pdf
```

`docs/RFP_COMO2027.md` in the same tree is a **derived summary of 108 requirement IDs**. It is a useful
index, but it is a second-hand reading. **Where it and the PDF differ, the PDF wins** — and if you find
a place where the summary has dropped or softened a tender obligation, that is itself a finding.

**Supporting context**
```
…/context_docs/docs/PHASE_B_PLAN.md          the delivery plan this schema serves (Track A)
…/context_docs/docs/REVISIONS.md             REV-045/046/047 — decisions and their reasoning
/Users/gauravgambhir/Desktop/Code_Life/RFP_COMPLIANCE_AUDIT.md
      an adversarial audit of the RUNNING product: 0 BUILT / 14 BUILT-ON-MOCK / 59 PARTIAL /
      31 MISSING of 108 IDs. Tells you which requirements are already weak.
…/context_docs/V1_Turnkey … Proposal Response by Stupa_V1_31.08.2026.md
      the COMMERCIAL response. It marks 98/108 as some form of Comply. Where the schema cannot
      deliver something the proposal promised, say so explicitly — that is commercial exposure.
```

**The codebase the schema claims to be derived from**
```
/Users/gauravgambhir/Desktop/Code_Life/wms/wms_domain/domain/models/         ~23 domain models
/Users/gauravgambhir/Desktop/Code_Life/wms/wms_domain/features/rules/engine.ts
/Users/gauravgambhir/Desktop/Code_Life/wms/wms_domain/features/registration/statusLifecycle.ts
/Users/gauravgambhir/Desktop/Code_Life/wms/wms_api/src/                      temporary backend + fixtures
/Users/gauravgambhir/Desktop/Code_Life/wms/wms_participant/app/(participant)/  15 built screens
/Users/gauravgambhir/Desktop/Code_Life/wms/wms_admin/src/pages/                7 built screens
```

The last two matter: **if a screen ships today and the schema cannot store what it displays, that is a
regression the plan would introduce.**

---

## Already fixed — do NOT re-report these

An earlier pass found and corrected these. They are closed. Re-reporting them wastes the audit:

1. `core`, `ops`, `audit` schemas were never created — added
2. `core.order` used the reserved keyword `ORDER` — renamed `core.registration_order`
3. `audit.activity_log` PK omitted the partition key and had no partitions — fixed
4. Roles `app_rw` / `restricted_rw` were never created — added
5. Six forward foreign-key references — migration order pinned in §4.0.4
6. `REVOKE UPDATE ON rule_version` contradicted "publishing closes the previous range" — replaced with an
   immutability trigger; close-then-insert order pinned
7. `UNIQUE` on nullable columns permitted duplicates — `NULLS NOT DISTINCT`
8. `waitlist_entry.position NOT NULL` made the `'eligible'` state unstorable — nullable + CHECK + `updated_at`
9. No `fee` table (price varies by product × category × grade × time) — `core.fee` added
10. No pre-registration schema — `core.pre_registration` + `pre_registration_match` added
11. No proxy-consent / partner-request schema — added

**Verify each fix is actually correct and complete** — a wrong fix is worth reporting. But do not
re-raise the original defect.

---

## Five findings already raised, NOT yet fixed — verify, correct, and extend each

Treat these as **hypotheses to test**, not as truths. Confirm, refute, or sharpen each one, and say
which. Then keep hunting: these came from one pass and are certainly not everything.

**A. `rule_version` models age bands only — six of the ten RFP §3.2 Masters patterns cannot be configured.**
The rule row is `strategy | reference_date | bands | exclude_roles | rounding`. Four patterns are pure
age math and work. Judo (age + weight + federation + belt), golf handicap, para classification with
expiry, proficiency review, category combination and eligibility exclusions have **no columns anywhere**.
§9.1 gate 3 requires all ten. Check whether `jsonb bands` can absorb them honestly or whether this needs
real structure — and say which, with reasoning.

**B. `registration_order.entry_id NOT NULL` forces exactly one order per entry.**
PAY-03 (team/corporate/split payments) and TEA-02 (team deposits, unpaid-member tracking) require one
order spanning many entries. `order_line` is already shaped for it. Confirm against the tender's exact
wording and propose the minimal correct relationship.

**C. RUL-03 impact analysis and RUL-05 notification/acknowledgement have no table.**
The tender requires impact analysis before a rule change, no silent reclassification, and participant
notification with acknowledgement. `category_audit` records the outcome; nothing records the *analysis*
or the *notification*. Check what the tender actually demands be retained and by whom.

**D. No VAT, promo codes, or credit notes — and the order CHECK actively blocks tax.**
`CHECK (total_minor = subtotal_minor - discount_minor)` is an arithmetic identity that any VAT line
violates. PAY-01 requires taxes, waivers, promo codes, packages. FatturaPA/SDI requires VAT breakdown
and credit notes for refunds. Work out what Italian e-invoicing actually needs stored and whether the
money schema can carry it.

**E. PLT-02 bilingual and ACS-05 accommodation needs are unsupportable.**
Every human-readable string (`sport.name`, product `name`, band names inside `bands` jsonb, broadcast
`subject`/`body`) is a single-valued column; `person` has no locale. PLT-02 is a launch Must and asks
for more languages **without code changes**. Separately, ACS-05 requires accommodation needs stored
*separately from sport classification*; the only related store lumps them with para classification —
the exact split ACS-05 forbids.

---

## Method — non-negotiable

1. **Read the tender PDFs first**, and build your own list of mandatory obligations. Do not start from
   the 108-ID summary; use it to cross-check yourself afterwards.
2. **For every obligation, trace it into the schema.** Name the table and column that satisfies it, or
   state that none does.
3. **Every finding must carry hard evidence** — a quoted tender clause (with section/page) AND a
   `file:line` in the plan or the codebase. A finding you cannot anchor both ways is not a finding.
4. **Try to refute your own findings before reporting them.** For each, ask: is this already handled
   elsewhere in the plan? Is it explicitly and legitimately scoped to Phase C or later? Would it
   genuinely matter for ~20,000 athletes and ~50,000 entries? Drop what does not survive.
5. **Distinguish three things** and never blur them:
   - *structurally impossible* — the schema prevents it; needs redesign
   - *missing but additive* — a later migration adds it without disturbing anything
   - *present but wrong* — modelled, but modelled incorrectly
6. **State your uncertainty.** If you could not read a PDF, could not find a clause, or are inferring,
   say so on that finding. **An unverified finding must be labelled unverified — never presented as
   confirmed.** Silence about what you could not check is the worst possible outcome of this audit.
7. Do not pad. Twelve real findings beat forty speculative ones.

## Scope note

The plan deliberately excludes competition management — draws, schedules, start lists, results
(`gameshub`, `match`) — because the RFP places those in **Phase C (Jan–Jun 2027)**, not Phase B.
Do not report those as gaps. **Do** report anything Phase B needs *now* in order for Phase C to be
possible later without a destructive migration.

---

## Output

**1. Verdict.** One paragraph: per the tender, is this plan solid enough to start building against?
One of — *safe to build*, *safe after fixing the blockers*, or *needs redesign first* — and why.

**2. Findings**, most severe first. For each:
```
[SEVERITY: blocker | high | medium]  [TYPE: structurally-impossible | missing-additive | present-but-wrong]
TITLE        one line
TENDER       the obligation, quoted, with section/page
PLAN         file:line in BACKEND_DB_PLAN.md — what it says today
WHY IT FAILS the concrete mechanism, not a restatement
EVIDENCE     file:line in the codebase, or the tender quote that settles it
FIX          the minimal correct change — DDL where it helps
CONFIDENCE   0-100% + one line on what drives it (read it / inferred it / could not verify)
```

**3. On findings A–E.** For each: CONFIRMED / REFUTED / PARTIALLY CORRECT, with your reasoning and the
corrected version if it was partly wrong.

**4. Coverage table.** Requirement family (PLT, REG, PAY, ACC, CMP, OPS, NFR, PRV, SEC, ACS, DAT, CON,
RUL, EVD, TEA) → does the schema support it fully / partly / not at all → the one-line reason.

**5. What you could not check.** Files you could not open, clauses you could not locate, judgements you
had to infer. Be explicit. This section is mandatory and must not be empty unless you genuinely
verified everything.
