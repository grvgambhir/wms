# Testing guide — what to click, and what should happen

Written so you can test the product yourself, step by step, without asking anyone what a screen
is meant to do.

**Two lists, and they answer different questions:**

- **List A — the demo (RFP §9.3).** The eight scenarios the OC will ask us to show *live, using
  a real environment rather than slides*. This is a fixed script; it is not the product.
- **List B — the full product.** Everything registration has to deliver for real athletes, in
  lifecycle order. Much of it never appears in a demo and all of it has to work.

Each step says **where**, **what to do**, and **what you should see**. Where a step cannot work
yet, it says so and why — a step marked blocked is a fact to verify, not an excuse.

> **Last walked through: 17 September 2026.** Steps marked ✅ **verified 16/17 Sep** were clicked
> in a browser against the running system on that date, not assumed. Anything not marked that way
> is still written from the code.

### What changed since the last edition (read this, it changes what you will see)

| Change | What it means when you test |
|---|---|
| **A confirmed team's roster changes go through an OC approval** | A2/A3's "Save roster & revalidate" on an already-confirmed team now reads **Propose to organiser** and does exactly that — nothing changes until **Admin → Work queues → Team roster changes** approves it. Saving directly used to 422 (`ILLEGAL_STATUS_TRANSITION`). |
| **The waitlist is real now, and OC-driven** | A quota-full registration actually joins a waitlist (used to crash the `/waitlist` screen). Releasing an offer and expiring one are OC actions — **Admin → Work queues → Waitlist** — not participant self-service; the old "(demo)" release button on the participant screen is gone. |
| **Admin → Work queues → Registrations** is new | Every entry is searchable and filterable, with a detail page (category lineage, status history, money, evidence summary) and the lifecycle actions. The old "Registration lifecycle (governance)" demo panel on Operations is gone. |
| **Ending an entry now needs a reason** | Cancel / Disqualify / Mark substituted open a confirm dialog and refuse an empty reason — and the *database* refuses it too, not just the screen. Reinstate asks for an optional reason. |
| **Operations numbers are real** | Paid entries, live entries, outstanding balance, funnel and work queues are counted from the database. Live sessions and uptime are **not measured** and the screen says so instead of showing invented figures. The incident rehearsal is still a demo. |
| **Basketball bands are five-year** | 30–34 · 35–39 · 40–49 · 50+ — the backend fixture used to carry ten-year bands, which broke A2's recalculation. |
| **Teams and partners are real** | An athlete creates the team, invites, and the invited athlete accepts from their own **Invitations** screen. Nothing is auto-accepted any more, so team scenarios need **two logins**. |
| **The service runs as `app_rw`** | The application connects with least privilege. Migrations, seeds and `dev:clear-entries` use the owner connection (`DATABASE_OWNER_URL` in `wms_backend/.env`). Nothing changes in how you run the commands from the root. |
| **Every response carries a request id** | `X-Request-Id` on the response and `requestId` in any refusal body. **Quote it when you report a bug** — it is the fastest way to find the matching log line. |

---

## Before you start

```bash
cd /Users/gauravgambhir/Desktop/Code_Life/wms && npm run dev
```

Three things start: backend `:3050`, admin `:5173`, participant `:8081`.
If a port is busy, `npm run dev:clean` first.

**Is the backend actually up, and which build is it?**

```bash
curl -sS http://localhost:3050/v1/health
```

`{"ok":true,...,"buildId":"…","db":"ok"}` — `buildId` identifies the build (it comes from
`npm run build`; a source tree that was never built reports `null`). `/v1/ready` adds "migrations
are at the latest version". If you are signed in as an OC user, `/v1/metrics` shows what this
process has served: requests, status classes, per-route timings.

**When something goes wrong, copy the request id.** Every response has `X-Request-Id`, and every
refusal body repeats it as `requestId`. With that id the matching log lines can be found in one
search; without it, a report is "it failed sometime this afternoon".

## Which account for which scenario — read this first

Entries are scoped to the signed-in person now. The backend refuses one athlete's entry to
another, in SQL, and that refusal is correct — `wms_api` used to serve it to anyone because it
had no authentication at all. The consequence for testing: **to see Daniel Harper's data you
have to be Daniel Harper.**

| Scenario | Sign in as | Ready? |
|---|---|---|
| **A1** Swimmer | `ggmbr27+daniel@gmail.com` | ✅ — you create the swimming entry in the scenario |
| **A2** Basketball captain | same | ✅ — Men's Team 35–39 already exists |
| **A3** Rowing crew | same | ✅ — Coxed Four, Category C already exists |
| **A5** Tennis doubles | same | ✅ — replace-partner gap fixed 17 Sep (REV-087); invite now succeeds even when Marco is already the partner |
| **A7** Quota / waitlist | `ggmbr27+luca@gmail.com` | ✅ — walked end to end 17 Sep (REV-089); Men's Team 35–39 is already at capacity, no reconfiguration needed |
| **A8** Operations | `gaurav.gambhir@stupaanalytics.com` (`oc_admin`) | ✅ |
| **A4** Judo *(Stretch)* | Daniel + two OC accounts | ✅ fully live 17–18 Sep: accepted case (a) confirmed and paid (REV-090); licence and belt refusal cases raised and dual-approved 2/2 by two distinct real OC logins (REV-091, REV-092). All three eligibility sub-cases proven, nothing left untested. |
| **A6** Para-swimming *(Stretch)* | `ggmbr27+elena@gmail.com` | ✅ fully live 18 Sep (REV-093): pre-seeded Para Swimming entry, S9 para-classification already approved with a restricted-access-log timestamp, clean export PASSed with zero medical/para content, OC detail view confirmed the same restricted-count-only view. |

**All eight List A scenarios (A1–A8) are now live-verified.** No account is still needed.

`ggmbr27+luca@gmail.com` is **optional**. Luca is Daniel's doubles partner — you only need to be
him if you want to test the *accept* side of a partner invitation. Everything else in A5 works
from Daniel's side.

| You are | Go to | Sign in as |
|---|---|---|
| An athlete | http://localhost:8081 | `ggmbr27+daniel@gmail.com` — **this is Daniel Harper** |
| The OC | http://localhost:5173 | `gaurav.gambhir@stupaanalytics.com` (holds `oc_admin`) |

**`wms_api` is gone.** It was deleted on 14 Sep 2026. Everything — participant and admin —
now runs on `wms_backend` (`:3050`) against real PostgreSQL. `npm run dev` starts **three**
processes, not four, and nothing loses its data on restart any more. That was F1 in the Phase B
plan, and it is closed.

If an older note in this guide (or in a prompt) tells you a screen is "on the shim", it is out
of date — say so and I will fix it.

**What this changed for testing, and it is the thing to understand before judging any screen:**
the shim had **no authentication at all**. It served any participant's data to anyone who
asked. `wms_backend` scopes every read to the signed-in person, in SQL.

So after the cutover some screens correctly show **less** than they used to. That is not a
regression — the old behaviour was a leak. Before reporting "it stopped showing X", check
whether X belonged to the account you are signed in as.

## How to read the RFP references

Every step carries the requirement it proves, like `REG-02` or `PAY-04`. Those ids are the
RFP's own, and you can look each one up in `wms_participant/context_docs/docs/RFP_COMO2027.md`:

| Prefix | Section | Subject |
|---|---|---|
| `RUL` | §3.1 | Rules, reference dates, impact analysis, exceptions |
| `EVD` | §3.3 | Evidence and documents |
| `TEA` | §3.4 | Teams, pairs, partners |
| `PLT` | §4.1 | Platform, identity, participant experience |
| `REG` | §4.2 | Registration, entries, eligibility |
| `PAY` | §4.3 | Fees, payments, financial control |
| `ACC` | §4.4 | Accreditation and credentials |
| `CMP` | §4.5 | Competition, schedule, results |
| `OPS` | §4.6 | Communications, administration, reporting |
| `PRV` / `SEC` / `ACS` / `DAT` | §5 | Privacy, security, accessibility, data |

`§9.3` is the scripted demonstration — the eight scenarios in List A, quoted from the RFP.

**Why this matters when you test.** These ids are what the OC scores the bid against. "The
category looked right" is an opinion; "REG-02 verified — three DOBs, three bands, reference
date 31 Dec 2027" is evidence. Report findings against the id and they go straight into the
compliance schedule (RFP Appendix A).

---

# List A — the eight demo scenarios (RFP §9.3)

Six are *Core* (must work), two are *Stretch*. Run them in this order; each is self-contained.

> **The one number behind all of this: 31 December 2027.**
> Masters sport does not band you by how old you are today. It bands you by how old you *will
> be* on a fixed reference date — for these Games, 31 Dec 2027. So age = `2027 − birth year`
> for anyone whose birthday falls on or before 31 December, which is everyone. Every sample
> below is worked out that way, and the reference date is the thing most likely to be wrong in
> a system that looks correct.

**Where the bands come from — this changed on 13 Sep 2026.** They used to live in
`sport-rules.json`. **All three of those files are now deleted**, and both apps read one
register in Postgres (`core.rule_set` / `rule_version` / `rule_dimension`). That was F2 — the
rules an athlete was judged by and the rules an admin edited were different data. They are now
the same data, and the admin configurator can change a band that the athlete then sees.

> **Before you start List A, reseed.** The dev database currently has 6 rule versions and
> **0 dimensions** — no bands at all — so every category will read "Rule not found". Fix it with
> `npm run seed:reset` from the `wms` root (it seeds too, and runs on Node 22 — from a Node 20
> shell inside `wms_backend` it segfaults with exit 139).
>
> **Since 14 Sep 2026 the reset keeps your logins.** It truncates `core.person`, but first it
> saves every Cognito-linked person and their role grants, and puts them back after seeding:
> `ggmbr27+daniel` stays linked to Daniel Harper, and your OC account keeps its roles. The last
> line of output says how many were kept. Entries, consents and contacts are still reset — that
> is the point of a reset.
>
> **Testing accounts live in `wms_backend/.env`**, so even an empty database gets them:
> `SEED_OC_ADMINS=<cognito sub>:<email>` for admins, `SEED_LOGIN_LINKS=daniel:<sub>,elena:<sub>`
> for logins that should land on a demo athlete. Adding Elena = one entry on that line.
>
> **Re-testing one person's date of birth:** `npm run dev:clear-entries -- <email>` from the `wms`
> root removes only that person's entries (and their orders, payments, invoices, quota places).
> Profile, DOB, consents and login stay; the DOB becomes editable again. Local database only.
>
> **You rarely need a reset to retry a scenario.** A cancelled / withdrawn / substituted entry goes
> back to draft from admin `/operations` → **Reinstate**. A confirmed entry: withdraw in the
> participant app first, then Reinstate. Date-of-birth tests need a user with **no** entries.

**Bands after reseeding:**

| Sport | How it bands | Bands |
|---|---|---|
| Swimming (individual) | your own age | 25–29 · 30–34 · 35–39 · 40–44 · 45–49 · 50–54 · 55–59 · 100+ |
| Tennis (doubles) | **youngest** player | 30–34 · 35–39 · 40–44 · 45–49 · 80+ Open |
| Basketball (team) | **youngest** player | 30–34 · 35–39 · 40–49 · 50+ |
| Rowing (coxed four) | crew **average, coxswain excluded** | A 27–35 · B 36–42 · C 43–49 · D 50–54 · E 55–59 |
| Swimming (relay) | **sum** of all ages | 100–119 · 120–159 · 160–199 · 200–239 · 240–279 · 280+ |

---

## A1. Swimmer, individual entry

**RFP:** §9.3 scenario 1 · **REG-02** (age + category from DOB and reference date) · **RUL-02** (reference date is configurable, Como = 31 Dec 2027) · **EVD-03** (medical evidence restricted) · **PAY-02** (EUR + SCA/3DS) · **PLT-02** (EN + IT incl. validation and receipts) · **ACS-01** (WCAG 2.2 AA)

*Category calculated against 31 Dec 2027, medical evidence, payment, in EN and IT.*

> **What this is really testing.** An athlete's category is not a thing they pick — the system
> derives it from their date of birth. Get the reference date wrong and thousands of people
> compete in the wrong category, and nothing on screen looks broken.

> ✅ **Walked end to end on 16 Sep 2026** as `ggmbr27+daniel@gmail.com`: register → medical
> certificate required → upload → OC approves → checkout unlocks → pay with the retry switch on →
> "2 gateway attempts, 1 charge" → **Confirmed**, and the entry appears in the admin Registrations
> queue as Swimming · 40–44 · Confirmed · Approved · Paid €65.00. Three defects were found and
> fixed on the way (REV-082) — if you are testing an older build, this scenario stops at evidence.
>
> **Re-checked 17 Sep 2026** — the OC-approve step (step 7) still unlocks checkout correctly:
> Daniel's medical certificate reads **Approved**, access-logged today, and the athlete's own gate
> reads "Approved · checkout unlocked". If your OC account cannot approve, check it holds an OC
> role (`gaurav.gambhir@stupaanalytics.com` is `oc_admin`) — a plain participant account gets a
> correct *Forbidden*, not a bug.

1. `:8081` → sign in.
2. **Profile → Consents.** A seeded demo athlete has **no consents**, and registration is correctly
   refused without them ("Grant the required consents in your profile first"). Grant the three
   required ones once; after a `seed:reset` you grant them again.
3. **Register → Swimming · 100m Freestyle** → the entry is created and the rule check shows
   calculation method, reference date **31 Dec 2027**, banding age and category.
4. **Check the category against the table.**
5. **Different dates of birth:** a date of birth locks once an entry exists, so use
   **admin → Sport Rules Engine → Category checker** for samples (a)–(d) — it runs the same active
   rule and registers nothing. `npm run dev:clear-entries -- <email>` frees a real athlete's date of
   birth if you want to test it on the participant side.

| | Date of birth | Age on 31 Dec 2027 | Category you must see |
|---|---|---|---|
| **(a)** | `1985-03-15` | 42 | **40–44** |
| **(b)** | `1992-06-01` | 35 | **35–39** |
| **(c)** | `1975-11-20` | 52 | **50–54** |

6. **Then the one that catches the real bug — sample (d): `1987-12-20`.**
   Today (Sep 2026) that person is **38**, which would be the 35–39 band. On 31 Dec 2027 they
   are **40**, which is **40–44**. **You must see 40–44.** If you see 35–39, the system is
   banding on today's date instead of the reference date — the exact defect this scenario
   exists to catch, and one that would look perfectly normal to everyone.
6. **Eligibility evidence** → **Medical certificate · REQUIRED**, in the restricted section with
   its access log. Click **Mock upload PDF** — the gate moves to *Review pending* on its own.
7. **The OC approves it** — `:5173` → **Work queues → Evidence review**. The row reads
   *Daniel Harper · Swimming · 100m Freestyle · **RESTRICTED** · Uploaded*. **Start review** →
   **Approve**. (Rejecting asks for a reason from a list; the backend refuses one without.)
   The athlete's screen then reads **"Approved · checkout unlocked"**. ✅ verified 16 Sep, entirely
   through the two portals — no API calls.

   > Medical data is legally separate from ordinary registration data (PRV-04). It lives in its
   > own place, behind its own permission, and does not travel with an ordinary export.
8. **Checkout** → leave **"Simulate first-attempt timeout, then retry with the same key"** ticked →
   **Pay €65.00** → "Payment confirmed — charged once · 2 gateway attempt(s), 1 charge" → receipt
   and **Confirmed** on the status screen (PAY-04).
9. **Switch the language to Italian** and walk the same screens. Every label, error and receipt
   must be Italian. One English string is a finding.

   > The event is in Italy. PLT-02 makes bilingual a launch requirement, not a nice-to-have —
   > a refusal reason an Italian athlete cannot read is the same as no reason at all.

9. **The organiser side of the same entry** — `:5173` → **Registrations** → open it. ✅ verified
   16 Sep: status history reads `Created → Draft` · `Draft → Pending evidence` ·
   `Pending evidence → Pending payment (evidence_approved)` · `Pending payment → Confirmed (paid)`;
   category original/current/derived agree; money shows €65.00 settled of €65.00 due; restricted
   evidence appears as a **count only**. Operations then shows one more paid entry and variance €0.00.

**What proves it:** three DOBs gave three bands, (d) used the reference date and not today, the
medical document is restricted, the athlete's own screen unlocked only after the OC approved, and
the Italian pass had no English left.

## Admin rule publish → participant impact (cross-portal)

**RFP:** RUL-03 (impact analysis before committing) · RUL-04 (original category preserved) · RUL-05 (participants notified)

1. `:5173` → **Sport Rules Engine**. The bands shown are the ones in the database, not a file.
2. Change **Calculation Strategy** (e.g. Youngest Member → Crew Average), then **Publish Rule
   Register**. Publishing with nothing changed does nothing — change something first.
3. An **Impact Analysis** overlay must list every affected entry *before* anything is committed:
   who, from which category to which, and the banding age behind it — plus the version bump.
4. **Confirm & Publish**, then open the participant app → **Change impact** and acknowledge.

✅ **verified 16 Sep** (steps 1–3): the overlay read "1 of 1 active registration(s) will be
reclassified · v2.1 → v2.2 · Men's Doubles 35–39 → Men's Doubles 40–44 (band age 39 → 40)". Cancel
at that point leaves everything untouched.

**Category checker** (same screen, bottom): enter a date of birth and see the category the active
rule gives, with nothing registered. ✅ **verified 16 Sep** — `1994-06-10` on Basketball · Men's
Team returned **Men's Team 30–34**, banding age 33 on 2027-12-31. Use it whenever you want to test
a date of birth without creating an athlete.

## A2. Basketball captain, team

**RFP:** §9.3 scenario 2 · **REG-03** (youngest-member category with **immediate revalidation**) · **REG-12** (fee/category/quota impact **shown before commitment**) · **RUL-04** (original category, current category, reason, approver, timestamp) · **TEA-03** (rules applied at member and team level)

*Adding a younger player recalculates category, capacity and price — with a warning and audit.*

> **What this is really testing.** A team competes in the band of its **youngest** member — so
> one new player can move the whole team down a category. That changes who they play, what
> they pay, and which quota they consume. The athlete must be told *before* it happens, and the
> system must record that it happened.

> ✅ **Walked end to end on 17 Sep 2026** as `ggmbr27+daniel@gmail.com`. Daniel's confirmed
> **Como Lakers Masters** team (`:8081` → **My Entries** → Basketball → **Team**) is fixed. Two
> defects found and fixed on the way (REV-086) — if you are testing an older build, "Save roster &
> revalidate" fails with `ILLEGAL_STATUS_TRANSITION` and the flow stops at step 3.

1. `:8081` → **My Entries** → **Basketball → Men's Team** → **Team** in the sidebar (or **My
   Entries → Basketball → View → Team**). The active roster is captain **Daniel Harper** (age 42)
   plus Andrea Conti (41), Matteo Ricci (40), Marco Rossi (39), Paolo Gallo (38) — youngest **38**
   → **Men's Team 35–39**, €120.00.
2. **Add the younger player** → **Add Luca to roster**. Luca Bianchi is 33 — live recalculation
   shows **Men's Team 35–39 → 30–34**, fee **€120.00 → €135.00**, and a warning explaining why,
   all before anything is committed.
3. The entry is already **Confirmed** (in the real flow, paid), so the button reads **Propose to
   organiser**, not "Save" — a confirmed team's roster cannot be overwritten directly, only
   proposed. Click it → **"Proposed. Nothing on this entry changes until the organiser reviews
   and approves it."** Check **My Entries**: category is still 35–39.
4. `:5173` → **Work queues → Team roster changes**. The row reads *Como Lakers Masters ·
   Basketball · Men's Team · captain Daniel Harper · Men's Team 35–39 → Men's Team 30–34*, with an
   accreditation warning for the incoming athlete. **Approve**.
5. Back on `:8081` → **My Entries**: Basketball now reads **Men's Team 30–34**. That's the audit —
   who proposed it, who approved it, and the before/after category — recorded as the approval
   itself, not a UI-only warning.

## A3. Rowing crew — average age excluding the coxswain

**RFP:** §9.3 scenario 3 · **REG-03** (average-age formula, revalidation after roster change) · **REG-06** (crew entries incl. non-playing roles — the coxswain is one) · **TEA-04** / **CMP-04** (controlled substitution, category revalidated)

> **What this is really testing.** The coxswain steers; they do not row. So they are excluded
> from the crew's average age. This is the single most-cited rule in the RFP and the easiest to
> get silently wrong, because including them produces a perfectly plausible number.

> ✅ **Walked end to end on 17 Sep 2026** as `ggmbr27+daniel@gmail.com`. Daniel's confirmed
> **Lario Masters Coxed Four** (`:8081` → **My Entries** → Rowing → **Team**) is fixed, same defect
> and fix as A2 (REV-086) — substitution recalculated correctly, but nothing could actually be
> saved on a confirmed crew until the propose/approve path was wired in.

1. `:8081` → **My Entries** → **Rowing → Coxed Four** → **Team**. Crew: Daniel Harper (46),
   Alessandro Neri (45), Stefano Romano (44), Enzo Marino (43) rowing, **Fabio Sala** (30) as
   **coxswain, excluded from average**.
2. **Do the arithmetic yourself, once.** (46 + 45 + 44 + 43) ÷ 4 = **44.5** → floor **44** →
   **Category C (43–49)**, €110.00. Screen shows exactly this — "Average of 4 member(s), excluding
   1 (raw 44.5)". Had Fabio been counted, the average would be 40.6 — a whole category out, from
   someone who isn't racing.
3. **Substitute Enzo Marino → Gianni Moretti** (age 36, the seeded reserve). New average
   (46 + 45 + 44 + 36) ÷ 4 = **42.8** → **Category B (36–42)**, fee €110.00 → €125.00. The warning
   and the pending audit line both appear before anything is committed.
4. The entry is **Confirmed**, so the button reads **Propose to organiser**, not "Save". Click it
   → **"Proposed…"**. **My Entries** still reads Category C — the original entry is untouched
   until an OC approves; that *is* "not an overwrite".
5. `:5173` → **Work queues → Team roster changes** → the row shows *Lario Masters Coxed Four ·
   Rowing · Coxed Four · captain Daniel Harper · Category C (43–49) → Category B (36–42)*. **Approve**.
6. `:8081` → **My Entries**: Rowing now reads **Category B (36–42)**.

## A5. Tennis — grade by event, doubles youngest player, partner invite

**RFP:** §9.3 scenario 5 · **REG-04** (proficiency/grade selection) · **REG-03** (youngest-member) · **REG-07** / **TEA-01** (partner finder, invitations)

> **What this is really testing.** Two separate ideas. First, *grade* (competitive vs social) is
> chosen **per event**, not once per athlete — the same person can play one event competitively
> and another socially. Second, a doubles pair is banded by its **younger** player, so changing
> partners changes the category.

> ✅ **Fixed and verified live 17 Sep (REV-087).** The invite used to 404 — `partner.service.ts`'s
> `invitingDoublesEntry`/`loadInvitingEntry` both required `entry.partner_profile_id IS NULL`, true
> only before a first partner is ever accepted, and Daniel's seeded tennis entry already has Marco.
> The refusal was also a raw, misleading key (`partner.request.entry_not_found` — a 404, when the
> true reason was "already has a partner"). Neither query needed the filter — accepting a partner
> never touches entry status, order or payment, so replacing one is a direct update, no
> propose/approve ceremony needed. Removed the filter; re-invited from Daniel's confirmed tennis
> entry and got **"Invitation sent — waiting for their answer"** instead of a 404. Acceptance still
> needs a second login in any case: nothing is auto-accepted. Two smaller things on that screen,
> still present: the signed-in athlete appears in their own candidate list, and Marco Rossi appears
> twice.

1. **Sport entry** → Tennis. Select a **different allowed grade for each event** you enter.
2. **Partner finder** → invite a partner → **they** sign in, open **Invitations**, and accept.
3. Check the pair's category:

   | | You | Partner | Youngest age | Category |
   |---|---|---|---|---|
   | **(a)** | `1985-03-15` (42) | `1988-11-02` (39) | 39 | **Men's Doubles 35–39** |
   | **(b)** | `1985-03-15` (42) | `1980-06-18` (47) | **42** (you) | **Men's Doubles 40–44** |

   ✅ **Verified 17 Sep without registering anything** — `:5173` → **Sport Rules Engine** →
   **Category checker**, sport entry **Tennis · Men's Doubles**, two members. (a) gave **Men's
   Doubles 35–39**, banding age 39. (b) gave **Men's Doubles 40–44**, banding age 42 — the same
   rule engine the entry itself calls, just without the blocked invite in the way.
4. **Swap from partner (a) to partner (b).** The category must move from 35–39 to 40–44, and
   the price with it.

   > Note what (b) demonstrates: the younger player is now *you*. The rule is not "the partner
   > decides" — it is "the youngest decides", whoever that turns out to be.

## A7. Quota fills → waitlist → offer expires → payment retries safely → reconcile

**RFP:** §9.3 scenario 7 · **REG-09** (quotas, waitlists, automatic offers, **expiry timers**, oversell prevention) · **PAY-04** (prevent duplicate charges, idempotent orders/callbacks, auto-reconcile) · **PAY-07** (settlement and **variance** reporting)

The hardest of the eight, and the most valuable.

> **What this is really testing.** Places are finite. When thousands of people press the button
> at the same moment, the system must never sell the same place twice — and when someone drops
> out, the place must genuinely come back, not vanish. Then the money has to agree with the
> registrations, to the cent.

> ✅ **Walked end to end live on 17 Sep (REV-089), both portals, real accounts** —
> `ggmbr27+luca@gmail.com` registering into Basketball · Men's Team, a category already at
> capacity (60/60) in the real seed, no quota reconfiguration needed.
>
> **Two real defects found and fixed on the way.** Neither was "the waitlist doesn't work" — the
> join/offer/expire/claim mutations were already correct. Nothing could ever *reach* them for a
> real athlete:
> 1. **No code path ever created a `core.waitlist_entry` row.** Only the seed script did. A real
>    registration hitting a full pool got refused and that was the end of it — `/waitlist` then
>    correctly had nothing to show, which is what produced the "Waitlist data is unavailable"
>    error a plain empty state should have been. Fixed in `claimQuotaForEntry`: on genuine
>    capacity exhaustion the entry becomes waitlist-`eligible`, written only *after* the failing
>    attempt's own transaction has rolled back — writing it inside that transaction deadlocked a
>    test for over a minute the first time this was tried (a second connection's row insert
>    waiting on a lock the failing transaction held, while that transaction waited on the insert
>    to finish before it could roll back and release it).
> 2. **`release-offer`/`expire-offer` are correctly OC-only, but nothing OC-side ever called
>    them.** The participant screen's "Release a place to me (demo)" button and its
>    auto-expire-on-timeout effect both called these two endpoints anyway, and both read
>    **Forbidden** — confirmed live, twice, including in a race where the auto-expire effect fired
>    mid-claim and clobbered the claim's own result. Fixed: new admin **Work queues → Waitlist**
>    screen calls the same endpoints from the OC session they were always meant to run from;
>    both participant-side calls removed (the countdown reaching zero now just re-fetches — a
>    local timer cannot mutate anything itself, it asks for whatever the OC has since done).
>
> **One known remaining gap**, logged as REMAINING_WORK.md §3.12: an entry that reaches the
> waitlist on its very first save (category never persisted — the same rollback undoes that too)
> can fail to claim with `FEE_NOT_CONFIGURED` if its product's fee is category-specific. A
> category-agnostic product claims cleanly. Re-deriving the category at claim time needs its own
> reviewed change, not something to improvise alongside the fix above.

1. Pick a product already at capacity — no reconfiguration needed; Basketball Men's Team 35–39
   is 60/60 in the seed. Register into it (**Team** → add a member landing in that band, or a
   fresh account whose own age does). **This category is full · Join the waitlist** appears in
   place of the old crash.
2. **Join the waitlist** → `:8081` **My Entries → Waitlist** reads *"You're on the waitlist ·
   position #N"*.
3. `:5173` → **Work queues → Waitlist** → the row shows the athlete, sport/product and position.
   **Release a place** → reserves it and starts a 20-second offer timer.

   > ⚠️ Do **not** look for a release/expire action on the participant screen — those two are
   > correctly staff-only. The demo shortcut that used to put a "(demo)" button there always
   > read Forbidden; it has been removed.
4. **Let one offer expire without claiming.** `:5173` → **Waitlist → Expire unclaimed offer** —
   the participant screen reads **"Offer expired… no charge was made… your place is
   retained"** and, on **Back to waitlist**, rejoins **at the back of the line** (a fresh
   position number, not the one it had), not silently holding its old place.

   > An expired offer that silently keeps the place held is the failure here — the place is
   > gone from everyone, including the person who was offered it. ✅ verified 17 Sep.
5. **Release again, and this time claim before the timer runs out.** Checkout shows the entry's
   real fee (not a placeholder). Leave **"Simulate first-attempt timeout, then retry with the
   same key"** ticked → **Pay**.
6. **Exactly one charge.** Not two, not zero. ✅ mechanism verified in A1 and reused here, 17 Sep.

   > This is what an idempotency key is for. The browser sends the same key on the retry, so the
   > server recognises it as *the same payment*, not a second one.
7. **Finance → variance must be €0.** ✅ verified live 17 Sep — €0.00.

   > If registrations and money disagree by even one entry, one of them is lying and you cannot
   > tell which from inside either screen.

## A8. Operations — incident and workaround

**RFP:** §9.3 scenario 8 · **OPS-03** (role-based dashboards and work queues) · **CMP-07** (monitor feeds, flag failed imports, manual fallback) · **§7.5 / Appendix B** (SLA evidence)

> **What this is really testing.** Things will break during the Games. The RFP does not ask for
> a system that never fails; it asks for one where a failure is detected, worked around, and
> *evidenced* against the SLA afterwards.

1. `:5173` → **Operations**.
2. **Simulate feed failure** → the results interface reads `Feed STALE · no import for 6m`.
3. **Open S1 Incident** → *Active Incidents* goes 0 → 1.
4. **Apply documented workaround** → "Safe workaround active — manual results entry" plus the SLA
   evidence line: acknowledged in 3 min (target ≤ 5 ✓), workaround in 22 min (target ≤ 30 ✓).
5. **Feed restored — resolve incident** → incidents back to 0, feed healthy.

✅ **verified 16 Sep** — all four steps, in that order.

**What is real and what is rehearsed, say it plainly if asked:** the KPI tiles, funnel and work
queues are counted from the database; the incident itself, the change freeze and the activity log
are a scripted rehearsal with no monitoring system behind them. Uptime and live sessions are not
measured at all and the screen says so.

## A4. Judo — multi-dimension + dual approval *(Stretch)*

**RFP:** §9.3 scenario 4 · **REG-05** (weight, belt/grade, licence/membership as rule dimensions) · **RUL-06** (exceptions with reason codes + **dual approval**) · **EVD-01** (belt/grade and federation licence as evidence types)

> **What this now tests.** Judo derives age, verified numeric weight and verified enum belt together;
> a separate verified, unexpired federation licence is a blocking eligibility prerequisite. A
> participant declaration stays as ordinary evidence until an OC approves it and materializes the
> verified, Judo-scoped attribute.

### Prepare the deterministic A4 data

```sh
npm run db:up
npm run migrate
npm run seed:reset
```

The reset publishes **Judo · Men's −81 kg** (€85) with its active three-dimension rule. Daniel
Harper passes (`80.4 kg`, `2dan`, licence through `2028-01-01`); Marco Rossi fails the belt rule
(`2kyu`); Luca Bianchi's licence expires on `2027-12-30`. These are Judo-scoped facts only.

### Participant path — evidence first

1. **Register** → **Judo · Men's −81 kg** → start the draft. An evidence-required but currently
   ineligible product can start as a draft so the athlete has an entry to support; save still
   refuses an ineligible category.
2. **Eligibility evidence** → **Ordinary evidence**. Upload each placeholder PDF with these inputs:

   | Requirement | Input | Declaration retained with the upload |
   |---|---|---|
   | Weigh-in | `80.4` | `weight_kg: 80.4` |
   | Belt certificate | `2dan` (or `2kyu`) | `belt_rank` |
   | Federation licence | `2028-01-01` (or `2027-12-30`) | `federation_licence: active`, expiry |

   Malformed numeric/date input is disabled before upload. The participant sees the ordinary
   evidence wait state; an OC must **Start review** then **Approve** each item.
3. An OC approval creates a versioned `core.entrant_attribute` with `status=verified`, Judo sport
   scope, OC verifier, expiry (where relevant), and the evidence obligation as provenance. It
   supersedes a prior current fact; it never mutates the evidence upload.
4. Save the sport entry. The localized failures are `eligibility.judo.weight`,
   `eligibility.judo.minimum_belt`, and `eligibility.judo.federation_licence`. On
   `CATEGORY_NOT_ELIGIBLE`, choose **Raise as exception**; the UI says **“Exception raised ·
   awaiting dual approval (0/2)”**.

### Endpoint and refusal contract

| Operation | Endpoint | Result / refusal |
|---|---|---|
| Upload declaration | `POST /v1/evidence/:evidenceId/uploads` | `200`; matching Judo declaration required |
| OC review / approve | `POST /v1/evidence/:id/review`, `POST /v1/evidence/:id/decisions` | `200`; approval alone writes the fact |
| Raise a refusal | `POST /v1/registration-entries/:entryId/exceptions` | `201`; server recomputes current facts and stores message keys |
| Raise while eligible | same | `422 ENTRY_NOT_BLOCKED` |
| Raise another athlete's entry | same | `404 REGISTRATION_ENTRY_NOT_FOUND` |
| Save an unmet category | `PUT /v1/registration-entries/:entryId` | `422 CATEGORY_NOT_ELIGIBLE` |
| Repeat OC signer | `POST /v1/exceptions/:id/approve` | `409 DUPLICATE_SIGNATURE` |

There is one live `pending`/`approved` refusal per `(entry_id, rule_version_id)` at the database
level. A fresh participant idempotency key returns that same case id; a rejected case can be raised
again after new evidence.

### OC dual approval

1. `:5173` → **Exceptions** → refresh and select the raised case. Its checks contain the
   server-derived failed keys, never a client-supplied reason.
2. Reviewer A approves: **1 / 2** and still pending. The same signer receives
   `409 DUPLICATE_SIGNATURE`; a different OC signer makes it **2 / 2** and approved.

### Verification record — 17 Sep 2026

- `test/judo-exception.spec.ts`: **5/5** — eligible refusal, each weight/belt/expired-licence key,
  ownership hiding, same-id repeat raise, queue visibility, and two distinct approvals.
- `test/evidence.spec.ts`: **10/10** — the added Judo case proves no fact exists before approval,
  then verifies all three resulting Judo facts and their provenance.
- Full backend: **48 files / 372 tests passed**; domain build, backend typecheck and build passed.
  Admin: **21 files / 88 tests passed**. Participant: **19 suites / 118 tests passed**.

Browser preflight is not falsely recorded as a completed A4 journey. The participant app has real
Cognito auth (`EXPO_PUBLIC_DEMO_AUTH=false`); its visible result with the available fixture/local
seed passwords was **“Could not sign in. Check your email and password. Please try again in a
moment.”** The existing OC browser session visibly showed **“Exception Review Queue”** and
**“Dual approval required — 0 / 2 signatures”**, but it was its old mock fallback queue, not the
freshly seeded case. Re-run the five browser steps with Daniel's current Cognito credential and two
OC identities; do not treat that fallback as evidence of this feature.

> ❌ **Browser re-run done 17 Sep, real Daniel credential — found a real, reproduced bug.**
> Registration and evidence upload work exactly as described above: Judo appeared in **Register**
> (Masters 40–44 / −81 kg / 2nd Dan or above), the entry created cleanly (€85.00), and all three
> ordinary evidence items (weigh-in `79.5`, belt `2dan`, federation licence) uploaded and reached
> **Uploaded · Pending review**. **Every Approve after Start review then failed** — *"The review
> action was refused"*, `422 REFERENCE_INVALID` — for all three document kinds, not just one.
>
> Root cause, reproduced directly against Postgres:
> `materializeApprovedAttribute` (`src/evidence/evidence.service.ts`) runs `UPDATE
> core.entrant_attribute SET superseded_by = <new row's id>` **before** that new row is inserted.
> `superseded_by` is a real, non-deferrable FK to the same table, so the UPDATE fails the moment
> there is a prior verified row to supersede — which there always is here, since Daniel's Judo
> attributes are pre-seeded as `verified` for the "accepted" demo case. Reversing the two
> statements does not fix it either — it trips a *different* constraint instead, the partial
> unique index `entrant_attribute_current` (both rows briefly "current" for the same key). Neither
> statement order works with the FK as it stands. No automated test caught this because none of
> them re-approve an attribute a fixture had already seeded as verified — every real athlete's
> *second* eligibility check does exactly that. Scoped as
> `prompts/CODEX_JUDO_REVERIFY_FK_BUG_PROMPT.md` (fix: make the FK `DEFERRABLE INITIALLY
> DEFERRED`, keep the existing statement order).
>
> ✅ **Fixed (REV-090, Codex) and re-verified live 17 Sep, same session.** Migration
> `1700000032000_defer_entrant_attribute_superseded_fk.sql` applied. Walked the accepted case (a)
> end to end as Daniel, no gaps: **Register** → Judo entry created (Masters 40–44 / −81 kg / 2nd
> Dan or above, €85.00) → uploaded all three ordinary evidence items → `:5173` Evidence review →
> **Approve** succeeded on all three (no more `REFERENCE_INVALID`) → checkout read **"Evidence
> status: Approved"** → **Pay €85.00** → *"Payment confirmed — charged once · 2 gateway
> attempt(s), 1 charge"* → registration status **CONFIRMED**, lifecycle Draft → Pending evidence →
> Pending payment → Confirmed, **€0.00 variance**.
>
> Refusal cases (b)/(c) and the raise-exception → dual-approval chain are still only verified via
> `judo-exception.spec.ts`, not walked live — Daniel's own Judo entry is now confirmed and paid,
> so a live refusal needs a second athlete (Marco or Luca's seeded belt/licence values, or any
> fresh account declaring a low belt / expired licence at upload time).
>
> ✅ **Licence-refusal case walked live 17 Sep, same session (REV-091), as Luca.** Registered
> **Judo · Men's −81 kg**, uploaded weigh-in `80.4` and belt `2dan` (both passing) plus federation
> licence `2027-12-30`. All three approved cleanly at `:5173` Evidence review (no
> `REFERENCE_INVALID` — REV-090's fix holds on a second, independent entry). Save then refused
> with **"A current verified Judo federation licence is required"**
> (`eligibility.judo.federation_licence`) exactly as documented above. **Raise as exception** →
> "Exception raised · awaiting dual approval (0/2)". At `:5173` Exceptions: Reviewer A approve →
> 1/2; the same signer clicking again was correctly refused ("You have already signed this
> exception. Dual approval needs a second, different reviewer.") — matches the `409
> DUPLICATE_SIGNATURE` contract. A genuinely different OC — a fresh account,
> `gaurav.gambhir+oc2@stupaanalytics.com`, invited and role-granted through People & Roles for
> this — signed as the second reviewer → **"Exception approved — 2/2 signatures · Pending User +
> OC Two"**. The belt-rank refusal key (`eligibility.judo.minimum_belt`, Marco's seeded `2kyu`)
> is the one sub-case still not walked live.
>
> ✅ **Belt-refusal case walked live 18 Sep (REV-092), as Ritesh Kumar** (Marco has no real
> Cognito login, so used a different pre-existing participant instead). Registered **Judo ·
> Men's −81 kg**, uploaded weigh-in `80.4` and licence `2028-01-01` (both passing) plus belt
> `2kyu` (the failing value). All three approved cleanly. Save refused with **"This category
> requires a verified 2nd dan belt or above"** (`eligibility.judo.minimum_belt`). **Raise as
> exception** → 0/2 → Reviewer A (`gaurav.gambhir+oc2@stupaanalytics.com`) → 1/2 → a genuinely
> different second OC (`gaurav.gambhir@stupaanalytics.com`) → **2/2, Exception approved**, the
> REV-091 toast confirming it. The raised case also carried `eligibility.cannot_evaluate`
> alongside the belt key — **investigated, not a bug**: Judo's `belt_rank` rule dimension only
> defines the passing enum band (`2dan+`), so any other code cannot resolve to any band at all,
> which is exactly what that key means (`wms_domain/features/rules/engine.ts`). All three Judo
> eligibility sub-cases (weight, belt, licence) are now live-verified — A4 has no remaining
> untested path.

## A6. Para-swimming — restricted evidence, clean export *(Stretch)*

**RFP:** §9.3 scenario 6 · **EVD-03** (medical/classification: least-privilege, restricted exports) · **PRV-04** (separate and restrict sensitive evidence, log access/export) · **CMP-01** (start-list export by class) · **REG-05** (para classification as a dimension)

> **What this is really testing.** A para athlete's sport class has to reach the competition
> system — but the *medical evidence* behind it must not. The same record, two audiences,
> different visibility.

1. **Sport entry** → Para swimming. Capture the **sport class** (e.g. S8) and its evidence.
2. Sign in as an ordinary OC role. The medical detail must **not** be visible.
3. Produce the **competition export**.
4. **Open the export and read it.** It must contain the **class** (competition needs it) and
   **no medical data**.

   > This is a negative check — you are looking for something that must be *absent*. Those are
   > the checks people skip, and leaked medical data is not a bug you get to fix quietly.

> ✅ **Walked live 18 Sep (REV-093), as Elena Rossi.** `/my-entries` showed the pre-seeded
> **Para Swimming · 100m Freestyle** draft directly (category 40–44, €70.00) — the fixture was
> already built, only the Cognito login needed linking. `/eligibility-evidence`: the restricted
> **Para-classification evidence** (`Elena_Rossi_S9.pdf`) was already **APPROVED**, with
> **"Restricted access logged at 2026-09-18T05:52:15.640Z"** shown right on the screen — PRV-04's
> access logging is live, not just written. Uploaded the one required ordinary item (identity
> document); OC approved it at `:5173`. Clicking **Generate clean export** (available even before
> that approval) returned **"PASS · restricted field groups omitted"** with a JSON payload
> containing only `entry`/`ordinaryEvidence` and `exclusions.excludedFieldGroups:
> ["medical","paraClassification","restrictedFiles","restrictedAccessLogs"]` — no S9, no medical
> content anywhere in it. `:5173` **Registrations** → Elena's detail page, as an ordinary OC: the
> Evidence section reads **"Restricted evidence held for this athlete at this event: 1 item ·
> present ... No restricted document, classification, or reviewer metadata is available here."**
> — present but unreadable, confirmed from the admin side too. This closes List A: all eight
> scenarios (A1–A8) are now live-verified.

---

# List B — the full registration product

Lifecycle order. This is what has to work for 14,000 real athletes, and most of it never
appears in a demo.

Status is marked as **live** (built, on the real database) or **not built**. There is no third
state any more — `wms_api` is deleted, so nothing runs on a JSON file.

## B1–B6 · Identity and account

> **What this block is.** Proving someone is who they say they are, once, and then remembering
> it. An account (Cognito) and a person (our database) are two different things joined by one
> id — which is why an athlete can exist in the login system and still have no profile.


| # | Step | Where | What you should see | Status | RFP |
|---|---|---|---|---|---|
| B1 | Sign up | `:8081` → Create account | 6-digit code by email | live | PLT-03 |
| B2 | Confirm the code | `/confirm` | Signed in | live | PLT-03 |
| B3 | Wrong code, then resend | `/confirm` | A clear refusal, then a new code | live | PLT-03 |
| B4 | Complete the profile | `/complete-profile` | DOB, nationality saved; `participant` role granted | live | PLT-07 |
| B5 | Try to change DOB after entering | Profile | **Refused** — DOB is locked once it is an eligibility input | live | REG-02 · RUL-02 |
| B6 | Sign out, sign in again | Portal header → Log out | Stays on `/login` after refresh | live | PLT-03 |
| B6a | New user opens My Entries | Nav → My Entries (`/my-entries`) | "You have not registered for anything yet" + **Register for a sport** — not an error | live | PLT-07 |
| B6b | Register for Swimming · 100m Freestyle | `/register` → Start registration | Card shows **Your category: …** first; then a draft opens on Sport entry with **no** "Men's Doubles" text | live | REG-01 · RUL-02 |
| B6c | Register for the same product again | `/register` | Button reads **Open my entry**; no second entry is created | live | REG-01 |
| B6d | Register before granting the required consents | `/register` → Start | "Grant the required consents in your profile first." + **Go to profile** | live | PRV-02 |

**B5 is the one to check carefully.** Date of birth decides the category. Once an entry exists,
changing it silently would move an athlete between categories after the fact. It must refuse.

Try it in this order, and watch where it stops being allowed:

| | Do this | Expected |
|---|---|---|
| **(a)** | Set DOB `1985-03-15` on a fresh profile | Accepted |
| **(b)** | Change it to `1992-06-01` **before** entering anything | Accepted — nothing depends on it yet |
| **(c)** | Register for 100m Freestyle (`/register`), **then** try to change DOB again | **Refused**, with the reason under the DOB field |

A placeholder profile is created with DOB `1900-01-01` on first login — that computes as age
127, which matches no band. If an entry ever succeeds from a placeholder profile, that is a
finding: the guard that blocks it is deliberate.

## B7–B10 · Consent and privacy

> **What this block is.** Under GDPR you may only process someone's data if you can show *why*
> you were allowed to. Consent is that proof, so it is a record with a timestamp and a policy
> version — not a checkbox that flips a flag.


| # | Step | What you should see | Status | RFP |
|---|---|---|---|---|
| B7 | Grant T&C and privacy | Timestamp and policy version recorded | live | PRV-02 |
| B8 | Opt in to medical/eligibility consent | Explicit opt-in, separate from the rest (PRV-04) | live | PRV-04 · EVD-03 |
| B9 | Withdraw a consent, **restart the backend**, reload | Withdrawal still there, **and the earlier grant still readable** | live | PRV-02 |
| B10 | A required consent withdrawn | Shows as **action needed**, blocks what depends on it | live | PRV-02 · PLT-07 |

**B9 is the real test.** Consent is the lawful basis for processing. A consent record that does
not survive a restart is not a consent record — and the history must remain answerable:
"granted on the 3rd, withdrawn on the 9th."

## B11–B14 · Pre-registration (EOI claim)

> **What this block is.** Roughly 15,000 people already told WMS they were interested, before
> this system existed. They must be able to claim their existing record rather than start over
> — and nobody must be able to fish for other people's details while doing it.


| # | Step | What you should see | Status | RFP |
|---|---|---|---|---|
| B11 | Look up an EOI reference | **Masked** preview — `D••• H•••`, coarse birth year | live | REG-13 · PRV-02 |
| B12 | Look up by email instead | Same masked preview | live | REG-13 |
| B13 | Claim it | Full details revealed, linked to you | live | REG-13 |
| B14 | Claim a second record | **Refused** — one person, one EOI | live | REG-13 |

**B11 matters more than it looks.** If the API returns full names and the screen masks them, it
is not masked — it is a name-harvesting tool with a polite front end. Check the network response,
not just the screen.

| | Look up | Expected |
|---|---|---|
| **(a)** | `COMO27-EOI-0001` | Found — masked as `D••• H•••`, birth year only |
| **(b)** | `COMO27-EOI-0003` | **Already claimed** — a different answer from (c) |
| **(c)** | `COMO27-EOI-9999` | **Not found** |
| **(d)** | Claim (a), then try to claim another record | **Refused** — one person, one EOI |

(b) and (c) must stay *distinguishable*. Everywhere else in this system "not yours" and "does
not exist" are answered identically so nobody can probe for real ids — here the athlete
legitimately needs to know which of the three happened to their own record.

## B15–B22 · Entry and rules

> **What this block is.** The heart of the product: which events an athlete may enter, and in
> which category. Every band in the table at the top of List A comes from here.


| # | Step | What you should see | Status | RFP |
|---|---|---|---|---|
| B15 | Browse sports and products | Catalogue loads fast | live | REG-01 |
| B16 | Choose an event, see your category | Derived from DOB against 31 Dec 2027 | live | REG-02 · RUL-02 |
| B17 | Save a draft entry, leave, come back | Draft still there | live | PLT-05 |
| B18 | Enter something you are ineligible for | Refused, **with the reason**, in your language | live | REG-05 · PLT-02 |
| B19 | Enter two incompatible events | Refused by the incompatibility rule | live | REG-08 |
| B20 | An admin publishes a new rule version | Your **existing** entry keeps its original category | live | RUL-03 · RUL-04 |
| B21 | The same product in the admin configurator | **Identical** bands to what the athlete saw | live | RUL-01 · RUL-05 |
| B22 | Multi-dimension entry (judo) | Age + weight + federation + belt all checked | live | REG-05 |

**B20 and B21 were the most important rows in this table, and they now pass.** Until 13 Sep
there were two separate rule registers — the rules an athlete was judged by and the rules an
administrator edited were different data, verified by checksum. Nothing on screen revealed it,
because each screen was internally consistent.

Both apps now read one Postgres register, so **B21 is a real test again**: change a band in the
admin configurator, publish it, and the athlete must see the change. Do it end to end rather
than reading both screens and assuming — that is precisely what used to look fine.

**B20 is the one to check carefully now.** Publish a new version and confirm an *existing*
entry keeps the category it was created under. The entry pins its `rule_version_id`; if the
category moves when the rules move, the guarantee is broken.

## B23–B29 · Money

> **What this block is.** Fees, tax, payment, refunds and invoices. All amounts are held as
> whole cents (`bigint`), never decimals — floating-point arithmetic on money drifts, and a
> cent that appears from nowhere is a reconciliation the finance team cannot close.


| # | Step | What you should see | Status | RFP |
|---|---|---|---|---|
| B23 | Checkout an entry | Correct fee, tax shown separately, `gross = net + tax` | live | PAY-01 |
| B24 | Apply a promotion | Total recalculates; never below zero | **API only** — no admin screen | PAY-01 |
| B25 | Pay | Confirmation and receipt | live, **stub PSP** (D4 open) | PAY-02 · PAY-10 |
| B26 | Retry the same payment | **One** charge | live (backend) | PAY-04 |
| B27 | Request a refund | Needs a **second** approver — the same person twice is refused | **API only** — no admin screen | PAY-05 |
| B28 | Invoice for a paid order | Gapless sequential number, tax split **per rate** | **API only** — no admin screen | PAY-06 |
| B29 | Finance reconciliation | Variance €0 | live | PAY-07 |

**B24, B27 and B28 are built and tested on the backend, with no admin screen yet.** So they
cannot be clicked — test them with `curl` and an OC token, or wait for the Finance screen to be
wired. The guarantees are already real: an invoice number cannot repeat or leave a gap, a refund
cannot be approved by the person who requested it, and a promotion cannot take an order below
zero. Each has its own test.

**B25 stays a stub until D4 is decided** — see `D4_PSP_DECISION_BRIEF.md`. The payment flow is
live end to end; only the provider behind it is simulated.

**B29 (variance)** now has a real endpoint: `GET /v1/finance/summary` reports charged, captured,
refunded, promotions, unpaid and variance. Zero variance is the only healthy value.

## B30–B34 · Evidence

> **What this block is.** Some entries need proof — a medical certificate, a federation
> licence, a para classification. Ordinary evidence and *sensitive* evidence are stored
> separately on purpose, and only the second kind is legally restricted.


| # | Step | What you should see | Status | RFP |
|---|---|---|---|---|
| B30 | Upload eligibility evidence | Listed as outstanding, then submitted | live | REG-10 · EVD-02 |
| B31 | OC reviews and approves | Entry moves forward; reviewer and reason recorded | live | REG-10 · EVD-04 |
| B32 | OC rejects | Coded reason, shown to the athlete **in their language** | live | REG-10 · PLT-02 |
| B33 | Medical/para evidence | Restricted — an ordinary OC role cannot read it | live | EVD-03 · PRV-04 |
| B34 | Competition export | Contains what competition needs, **no medical data** | live | CMP-01 · PRV-04 |

## B35–B40 · Teams, partners and rosters

> **What this block is.** A team entry belongs to several people at once, so one person's
> change affects everyone else's category and price. That is why a roster is versioned rather
> than edited — the crew that raced must still be knowable next year.


| # | Step | What you should see | Status | RFP |
|---|---|---|---|---|
| B35 | Create a team, invite members | Invitations pending, then accepted | live | REG-07 · TEA-01 |
| B36 | Below the minimum roster size | **Refused** | live | REG-08 · TEA-02 |
| B37 | Above the maximum | **Refused** | live | REG-08 · TEA-02 |
| B38 | Substitute a member | Category recalculates; original history intact | live | TEA-04 · CMP-04 |
| B39 | Coxswain in a rowing crew | **Excluded** from the average | live | REG-03 |
| B40 | A non-captain tries to invite | **Refused** | live | TEA-01 |
| B40a | Lock the team, then approve a substitution **without** `POST /v1/roster-substitutions/:id/revalidate` | **Refused** `422 REVALIDATION_REQUIRED` | API only — no admin screen | CMP-04 |
| B40b | After the lock, revalidate a swap whose incoming athlete has no issued badge, then approve | **Refused** `422 ACCREDITATION_NOT_VALID` | API only — no admin screen | CMP-04 · ACC-03 |
| B40c | After the lock, swap in someone who moves the crew into another age band | **Refused** `422 CATEGORY_WOULD_CHANGE` — before the lock the same swap is allowed (B38) | API only — no admin screen | CMP-04 · CMP-03 |
| B40d | Combine 40–44 + 45–49 into 40–49 (`POST /v1/admin/category-combinations`), build the 40–49 start list | One list; every line still shows its own award category; the entries themselves unchanged | API only — no admin screen | CMP-03 |

## B41–B46 · Quota and waitlist

> **What this block is.** Venues hold a fixed number of people. Quotas nest — a sport-wide cap
> can sit above a per-event pool — and the tightest one is what actually stops you.


| # | Step | What you should see | Status | RFP |
|---|---|---|---|---|
| B41 | Enter a product with places left | Confirmed | live (backend) | REG-09 |
| B42 | Fill the last place | Next athlete offered the waitlist | live (backend) | REG-09 |
| B43 | Two people claim the last place at once | Exactly one succeeds; the other gets a clean refusal | live (backend) | REG-09 |
| B44 | A waitlist offer expires | Place returns to the pool, next in line offered | live (backend) | REG-09 |
| B45 | Claim an offer | Goes through the same quota path — no shortcut | live (backend) | REG-09 |
| B46 | A nested cap (sport-wide over product) | The **tightest** pool is the one reported | live (backend) | REG-09 |

**B46 is subtle.** Set up two nested pools and check which one the athlete is shown:

| Pool | Capacity | Taken |
|---|---|---|
| Swimming, sport-wide | 100 | 0 |
| Swimming 50m Free, product | 60 | **58** |

The athlete must be told **2 places left**, naming the *product* pool — not "100 places left"
from the sport cap. They are two entries away from being refused, and the wider number tells
them the opposite. When they are refused at 60, the reason must name the pool that actually
stopped them.

## B47–B51 · Accreditation

> **What this block is.** The badge that gets someone through the gate. It is issued only when
> conditions are met (registered, paid, evidence approved) — and which conditions apply is
> configuration the OC can change, not code we redeploy.


| # | Step | What you should see | Status | RFP |
|---|---|---|---|---|
| B47 | Issue a badge with all gates met | Issued | live | ACC-01 |
| B48 | Issue with a gate unmet | Refused, **naming which gate** | live | ACC-03 |
| B49 | Change the gate configuration | Outcome changes with **no deploy** | live | ACC-03 |
| B50 | Athlete's own pass | Visible to them; the desk queue is not | live | ACC-01 · PRV-04 |
| B51 | Revoke and reissue | Readable history with actor and reason | live | ACC-04 |

## B52–B56 · Communications and operations

> **What this block is.** Reaching the right athletes and nobody else, and running the Games
> when something breaks. "Nobody else" is the hard half.


| # | Step | What you should see | Status | RFP |
|---|---|---|---|---|
| B51a | **Registrations work queue** — `/registrations`, filter by sport + status, click a status chip | Only matching rows; the filters appear in the URL so the view can be shared | live ✅ 16 Sep | OPS-03 · OPS-04 · REG-15 |
| B51b | Open an entry → **Cancel entry** | Confirm dialog; **Confirm stays disabled until a reason is typed**; after confirming, a refresh still shows cancelled | live ✅ 16 Sep | REG-11 · RUL-04 |
| B51c | Same entry → **Reinstate** | Goes back to **draft** (even if it was paid — the rule to apply here is still an open question for the OC) | live | REG-11 |
| B51d | **Export CSV** with a filter applied | Downloads the filtered rows; one `audit.activity_log` row is written; a name starting `=` comes out escaped | live ✅ 16 Sep (200 + audit row) | OPS-04 |
| B51e | Detail → **Category** section | Original, current, reason, the derived category, and the audit trail. Current and derived should agree on a freshly seeded entry | live ✅ 16 Sep (all 9 seeded entries agree) | RUL-04 |
| B30a | **Evidence review** — `/evidence-review`: upload something as an athlete, then Start review → Approve | The row moves Uploaded → Under review → gone from the queue, and the athlete's checkout unlocks | live ✅ 16 Sep | EVD-02 · REG-10 |
| B30b | Reject with a reason | The athlete sees the coded reason and the gate closes again | live | EVD-02 |
| B51f | Detail → **Evidence** | Restricted evidence shows only a count, labelled per athlete and event — never a document, class or reviewer note | live | PRV-04 · EVD-03 |
| B52 | Targeted broadcast (one sport) | Reaches that sport; **does not** reach others | live | OPS-02 |
| B53 | Delivery report | Failures visible as attempts, not overwritten | live | OPS-01 · OPS-02 |
| B54 | Assisted registration by an operator | **Refused without recorded consent** (PLT-06) | live | PLT-06 |
| B55 | Exception with dual approval | One reviewer twice ≠ two signatures | live | RUL-06 |
| B56 | Incident and workaround | SLA evidence shown | live | OPS-03 · CMP-07 |

Communications, assisted registration and exceptions moved to the real database on 14 Sep. The
**Operations counters** followed on 16 Sep: capacity, funnel and work-queue figures are counted from
the database, and anything not measured (live sessions, uptime) says so rather than showing a
number. The incident rehearsal on that screen is still local demo state.

Dual control in B55 is now enforced by a database constraint (`exception_one_signature_per_person`),
not a service check. Worth testing from **two different OC sign-ins**: both "Reviewer A/B" buttons
sign as whoever is logged in, so clicking both from one session correctly hits the constraint and
refuses — that refusal is the feature working, not a bug.

## B57–B60 · The OC's own people

> **What this block is.** The OC has staff across every sport and venue — finance, accreditation,
> helpdesk. They get accounts by invitation from an existing administrator. Nobody can make
> themselves an administrator, and that is enforced in three separate places.


| # | Step | What you should see | Status | RFP |
|---|---|---|---|---|
| B57 | Invite an OC user by email + role — try `yourname+finance1@gmail.com` | Cognito emails **username + temporary password** (not a code) | live | OPS-03 · PLT-04 |
| B58 | That person signs in | Forced to set a new password; role already active | live | PLT-04 |
| B59 | A `finance` user opens `/people` | Refused with an explanation — not a blank page | live | PLT-04 · SEC-02 |
| B60 | Remove your own last `oc_admin` | **Refused** — it would lock everyone out | live | OPS-05 · SEC-02 |

> **Running out of test email addresses?** Gmail treats `you+anything@gmail.com` as the same
> inbox, but Cognito treats each as a different user. So `you+staff1@`, `you+finance2@` give you
> as many test accounts as you need. While SES is in sandbox each variant still has to be
> verified in SES first — which is one more reason to get production access.

## B61–B64 · Data subject rights and closure

> **What this block is.** GDPR gives a person the right to see, correct and delete what is held
> about them. "Delete" is the hard one: an athlete who has paid cannot have their financial
> record removed, because tax law requires it be kept. So erasure is redaction against a
> retention schedule, not `DELETE`.

| # | Step | Status | RFP |
|---|---|---|---|
| B61 | Export everything held about an athlete | not built | PRV-05 |
| B62 | Rectification request | not built | PRV-05 |
| B63 | Erasure request with retention holds respected | not built | PRV-05 · PRV-04 |
| B64 | Certificate of deletion | not built | PRV-06 |

These are PRV-05 and PRV-06. The tables exist (`rights_request`,
`rights_request_completion`, `retention_hold`) and the workflow does not. It needs the OC's
**retention schedule** first — which data must be kept, for how long — because erasure is not
`DELETE`. An athlete who has paid cannot have their financial record removed, so real erasure is
redaction against a schedule, and the schedule is a decision, not code.

---

## How to report what you find

For each step: the number, what you did, what you expected, what happened. A screenshot for
anything visual.

Two things worth separating in your head:

- **A screen showing less than it used to is not automatically a regression.** `wms_api` has no
  authentication at all. After the cutover, some screens will correctly refuse things they used
  to show. The shim showing one participant another's data was never right.
- **"It lost my data on restart" is now always a bug.** It used to be expected on shim-backed
  screens; `wms_api` is gone, so every screen is on PostgreSQL. If state does not survive a
  restart, that is a real finding — report it.
