# BUSINESS_OVERVIEW_COMO2027.md — the whole picture, in plain language

> **Audience:** any human or AI agent (Claude Code, Cursor, Codex) who needs to understand *what we are building and why* before touching code.
> **Style:** layman Hinglish first (grasp fast), then precise product detail. This is the **business source of truth** for the Como Lake 2027 engagement.
> **Supersedes:** the old `BUSINESS_CONTEXT.md` (which described a generic IMGA athlete-only POC from the previous, narrower RFP). Where they conflict, this file wins.
> **Contract source of truth:** [`RFP_COMO2027.md`](./RFP_COMO2027.md) (and the original PDF). Delivery plan: [`DELIVERY_PLAN_COMO2027.md`](./DELIVERY_PLAN_COMO2027.md).

---

## 1. Ek line mein kya hai (one line)

We are **Stupa**. We are bidding to build **OARS** — one software service that lets **~14,000 Masters athletes** register, pay, form teams, submit eligibility evidence, get accredited and see results for the **Open Masters Games Como Lake 2027** — *and* lets the **Organising Committee (OC)** run the whole thing from an admin control centre. The buyer is **World Masters Sport (WMS = IMGA)**.

## 2. Layman Hinglish — pura scene

**Kaun kis se kya chahta hai:**

- **WMS (IMGA)** ek software service *kharid* raha hai. Wo खुद event nahi chalayega — wo software **OC ko dega** taaki OC event chala sake. WMS ne ek **RFP** (tender document) nikala hai. Humne (Stupa ne) uska **proposal** de diya hai (product ka naam **OARS**, price ~€88,000 base).
- **OC (Organising Committee)** = jo log actually Como Lake 2027 event chalayenge — sports rules approve karna, fees decide karna, athletes ko manage karna, venues/accreditation desks chalana. Software use *wo* karenge.
- **Hum (Stupa)** = software banao, host karo, support do, Games ke time 24×7 team do. Par event *chalane* ki zimmedari OC ki hai, hamari nahi.

**Sabse important baat — deadline:**

> Athlete registration **17 September 2026** ko live production mein aana hi hai. Ye hilne wali date nahi hai. Isi wajah se RFP baar-baar bolta hai: "koi bhi cheez jo abhi tak *bani nahi* hai, usko launch ke raaste mein mat daalo." Matlab: proven, configurable software chahiye — naya bespoke code nahi.

**Masters sport ka twist (ye hi asli USP hai):**

Normal event registration mein sab ki age ek jaise calculate hoti hai. Masters mein har sport ka apna rule hota hai:
- **Swimming**: 5-5 saal ke bands (25+, 30+ … 100+). Age **31 December 2027** ke hisaab se nikalti hai — registration date se nahi.
- **Basketball / Floorball**: team ki category **sabse chhote (youngest) player** se decide hoti hai. Ek young player add karo → poori team ki category, price, quota badal jaata hai. System ko **real-time recalculate** karke **warning + audit** dikhana padega.
- **Rowing**: crew ki **average age** — par **coxswain (steersman) ko chhod ke**.
- **Swimming relay**: chaaron members ki age ka **total (sum)** se band banta hai.
- **Judo**: age + weight + sex + federation membership + minimum belt (1st Kyu) — ek saath check.
- **Tennis**: alag-alag event mein alag grade allowed; doubles mein youngest partner se category.
- **Golf**: handicap-based scoring.
- **Para**: S1–S13 classes, medical evidence — par ye data **restricted** rehna chahiye (sab ko nahi dikhna chahiye).

**Isiliye rule "hardcode" nahi ho sakte.** Har rule ek **configuration** hai jise OC change kar sake, jiska **version + effective date + audit** ho, aur jab change ho to system bataye "is change se kaunse registrations affect honge." Ye hamare product ka dil hai — aur demo ka main show-piece bhi.

**Do portals, ek data:**
1. **Participant Portal** (athlete ke liye) — register/pay/team/evidence/accreditation/results.
2. **Admin "OC Command Centre"** (staff ke liye) — dashboards, exception queues, rules configurator, finance reconciliation, accreditation desk, communications.

Dono ek hi "one governed participant record" pe chalte hain — matlab athlete jo register karta hai, wahi record admin dekhta hai, wahi accreditation banata hai, wahi results se link hota hai. Duplicate data nahi.

**Language + accessibility:** **English aur Italian** dono launch pe. Aur users **mature/older athletes** hain — to plain language, bade buttons, no time-pressure, save-and-resume, screen-reader friendly (WCAG 2.2 AA) — ye optional nahi, **release blocker** hai.

## 3. Why this matters commercially

- This is a **live, weighted tender** worth the contract for a real 2027 international Games. Winning it = a flagship multi-sport reference client for Stupa in the EU.
- Evaluation is scored (see [`RFP_COMO2027.md`](./RFP_COMO2027.md) §9.2). The **two biggest-weighted criteria (20% each)** are exactly what our app must sell: (a) **safe 17 Sep 2026 launch readiness**, and (b) **Masters rules + registration + teams + eligibility + participant experience**. Our frontend demo is the single most persuasive proof of (b) and a strong signal of (a).
- There are **pass/fail gates** (§9.1): if we can't show the Masters rule patterns of §3 working on representative scenarios, we're out regardless of price. **⇒ The rules engine demo is existential.**

## 4. The players (roles) — who uses what

| Role | Platform | What they do |
|---|---|---|
| **Athlete / participant** | Participant Portal (web, responsive mobile→desktop) | Create/claim account, pick sports/events, build/join teams, upload evidence, pay, get accreditation, see schedule/results. |
| **Companion / household** | Participant Portal | Linked profile without commingling consent/evidence (PLT-08, Should). |
| **OC Superuser / Ops** | Admin Portal | System & load, registration funnel, SLA tracker, change freeze, incidents. |
| **Sport / Rules Lead** | Admin Portal | Configure age formulas, bands, grades, quotas; publish rule register; impact analysis. |
| **Reviewer (eligibility/exception)** | Admin Portal | Work the exception queue: evidence review, re-grade, exceptions with reason codes + dual approval. |
| **Finance operator** | Admin Portal | Settlement/reconciliation, refunds, chargebacks, VAT/e-invoicing, variance. |
| **Accreditation desk** | Admin Portal | Photo review, credential approval gates, issue/reissue/revoke, offline lookup packs. |
| **Comms operator** | Admin Portal | Targeted multilingual templates, test send, delivery reporting. |
| **Helpdesk / assisted-registration proxy** | Admin Portal | Register on a participant's behalf with recorded consent + operator-vs-participant audit. |
| **WMS (Authority)** | Governance / reporting | Approves material scope, service, data governance; receives SLA + service reports. |

> **POC boundary:** we build the **software the roles use**. We do **not** staff the helpdesk, run venues, or make business decisions — that stays with the OC (RFP §2.4).

## 5. Platforms & channels

- **Participant experience:** responsive **web** first — must work mobile + tablet + desktop, accessible browser journey is mandatory (a native app is *optional*, never a substitute). Our codebase is **Expo React Native + Expo Router + NativeWind**, previewed **Expo Web first**, so one codebase serves web now and iOS/Android later. *(See [`ARCHITECTURE.md`](./ARCHITECTURE.md).)*
- **Admin experience:** role-based **web portal** ("OC Command Centre"), same codebase/design tokens, desktop-first layout with a left nav.
- **Integrations (later phases, mocked in POC):** event website, payment PSP (Stripe/Adyen), SMS/email (SNS/SendGrid), CRM/community, credential/access & badge printing, competition/results systems, analytics — all via documented APIs/webhooks. In the POC these are **mock repositories** behind interfaces (never real providers).
- **Future backend (P2+):** an **API-first** service — likely **NestJS or Python FastAPI** (REST/JSON) — behind the same repository interfaces the POC already uses. A WIP baseline exists (`Backend - Registration Phase Requirements & Core Architecture Foundation.md`, BE-developer authored, *secondary to the RFP*). It confirms the multi-portal RBAC personas (participant, helpdesk operator, evidence reviewer, sport admin, finance admin, accreditation agent), idempotent/no-oversell transactions, entrant-lineage for category combination, and separate encryption/isolation for medical data. **Everything we build now must swap onto that backend with no UI rewrite** — see [`DELIVERY_PLAN_COMO2027.md`](./DELIVERY_PLAN_COMO2027.md) §6.6.

## 6. The connected journey (one record, many steps)

```
Create/claim account  →  Choose sports & events  →  Build/join team  →  Submit evidence & pay  →  Prepare & compete
   identity, consent,       configured age/category    invitations, rosters,   restricted review,       accreditation status,
   dedup, migration         rules, fees, quotas,        roles, partner match,   secure gateway,          personalised schedule,
   reconciliation           schedule warnings           revalidation            receipts, reconcile      results, profiles
```

Each participant screen has a matching **operational control** on the admin side (e.g. participant "Submit evidence" ↔ admin "Exception review queue"; participant "Pay" ↔ admin "Finance reconciliation"; participant sees a rule effect ↔ admin "Rules configurator" published it).

## 7. Screen map (new mockups ↔ RFP requirements)

**Participant Portal** (mockups in `context_docs/new_wmc_admin&athlete_screenshots/wms-como2027-participant-mockups/`; codes are the mockup's own P-numbers):

| Code | Screen | Backs RFP |
|---|---|---|
| P03 | Claim pre-registration | REG-13 |
| P06 | Profile & consent | PLT-03, PLT-07, PRV-02 |
| P08 | Dynamic sport/event entry (live rule check) | REG-01/02/03, RUL-01/02 |
| P09 | Eligibility evidence | EVD-01/02/03, REG-10 |
| P11 | Partner finder | TEA-01, REG-07 |
| P12 | Team roster management | TEA-02, REG-03/06 |
| P14 | Checkout / payment | PAY-01/02/03/04 |
| P16 | My registration dashboard | PLT-07, REG-11/15 |
| P19 | Change impact review | RUL-03, REG-12, TEA-04 |
| P20 | Waitlist offer | REG-09 |
| P22 | Digital accreditation | ACC-01/02/05 |
| P24 | Competition results | CMP-05/03 |

**Admin "OC Command Centre"** (mockups in `.../wms-como2027-admin-mockups/`):

| Code | Screen | Backs RFP |
|---|---|---|
| A01 | OC operations & load dashboard | OPS-03, NFR-03/06, §7 SLA |
| A02 | Exception review queue | RUL-06, REG-04, EVD-02 |
| A03 | Accreditation desk | ACC-02/03/04/06 |
| A04 | Sport rules configurator | RUL-01→06 |
| A05 | Finance settlement & reconciliation | PAY-04/05/07 |
| A06 | Targeted communications center | OPS-01/02 |

> Mockups are **AI-generated** (ChatGPT). They're a strong guide for layout + content, but **verify every claim against [`RFP_COMO2027.md`](./RFP_COMO2027.md)** — the RFP wins on substance. Gaps in the mockups (e.g. intermediate P-numbers P01/P02/P04… are not mocked) are filled from the RFP journey, not invented.

## 8. Phases — what we build for each date (business view)

> Detailed engineering tasks, screen-by-screen scope and acceptance live in [`DELIVERY_PLAN_COMO2027.md`](./DELIVERY_PLAN_COMO2027.md). Here is the *why* and the *headline* for each phase.

### P0 — the **7 Sep 2026 scripted demo** (our immediate target)
**Business goal:** win the demo (RFP §9.3) and clear the pass/fail gates (§9.1). Show a *credible, existing-looking product*, not slides.
**Headline:** a re-skinned **Como Lake 2027** participant portal + a partial **OC Command Centre**, driving the scripted Masters-rule scenarios end-to-end as guided, deterministic click-throughs.
**Scope decision (locked):** *Balanced* demo — polish the 5–6 scenarios the mockups support (swimmer age-calc + pay in EN/IT; basketball youngest-member recalc + warning + audit; rowing crew-average + substitution; tennis grade-by-event + doubles youngest; quota→waitlist→offer→retry→reconcile; ops incident + SLA), with judo dual-approval + para restricted-access as lighter stretch. Admin = **a01, a02, a04, a05** (the screens the script needs).
**Still frontend/mock:** no real backend, PSP, OTP, scoring, or scanning — everything behind mock repositories.

### P1 — the **15–17 Sep 2026 "full-proof" milestone** (UAT/readiness gate → production launch)
**Business goal:** look and behave like the thing that could *actually* launch on 17 Sep 2026 — the complete core registration journey, both portals, EN+IT, accessible, save-and-resume, all core statuses.
**Headline:** finish the participant journey (claim pre-reg, profile/consent, evidence, partner/team, checkout, dashboard, change-impact, waitlist, accreditation, results) + complete admin (add **a03 accreditation desk**, **a06 comms center**), full bilingual copy, WCAG 2.2 AA pass, deterministic demo data reconciling across both portals.
**Still POC-grade** unless the client contracts us — but architected so the mock repositories can be swapped for real API repositories with no UI rewrite.

### P2+ — the **full product** (RFP delivery phases B–F, Sep 2026 → Dec 2027)
Only relevant *after* award/contract; captured now so architecture stays scalable.
- **B (Sep–Dec 2026):** real backend + APIs, real PSP + reconciliation, pre-registration migration (~15k records), waitlist automation, finance/admin/reporting depth, agreed integrations.
- **C (Jan–Jun 2027):** competition/games-management (draws, schedules, start lists, results), accreditation lifecycle + badge printing, sport-by-sport final configs, data rehearsals.
- **D (Jul–16 Sep 2027):** dress rehearsals, capacity/security/DR tests, training, runbooks, change freeze, go-live acceptance.
- **E (17–26 Sep 2027):** Games-mode 24×7 software-service command.
- **F (27 Sep–31 Dec 2027):** reconciliation, exports, deletion/retention, exit.

## 9. Golden rules for anyone building this (do / don't)

**Do**
- Treat **all sport rules as configuration** with reference date, version, effective date, audit. The age reference date default is **31 Dec 2027**.
- Keep **one participant record** feeding both portals; keep data behind **repository interfaces** so real APIs drop in later.
- Show, don't tell: every rule effect (recalc, warning, impact analysis, reconciliation) must be **visible on screen** for the demo.
- Keep **EN + IT** and **accessibility** as first-class from P0 (at least the shell + demo paths), not a retrofit.
- Keep demo data **deterministic** (Daniel Harper, Marco Rossi, Como Lake 2027, swimming/basketball/rowing/tennis) so scenarios replay identically.

**Don't**
- Don't hardcode a single global age formula or a static registration form.
- Don't add a real backend, PSP, OTP, malware scanner, or scoring engine in the POC — mock them behind interfaces.
- Don't present mock numbers (fees, quotas, counts) as official — the mockups' own footer disclaimer applies: *illustrative; final values follow the WMS/OC-approved sport guide + rule register.*
- Don't silently reclassify anyone or change a rule without an impact-analysis + audit trail on screen.
- Don't expose medical/para/classification data in general views — it is **restricted** (EVD-03, PRV-04, ACS-05).

## 10. Naming & branding

- Product: **OARS** (Online Athlete Registration System, powered by Stupa Events AI).
- Event brand in-app: **WMS Como Lake 2027** / "Open Masters Games Como Lake 2027", dates **17–26 Sep 2027**, region **Lombardy (Como · Lecco · Varese)**.
- Admin brand: **OC Command Centre — Como Lake 2027**.
- Old branding (Kansas Senior Games, WMG Kansai 2027, generic "IMGA Athlete app") is **retired** for the customer-facing demo — re-skin to Como Lake 2027. Keep the demo characters (Daniel Harper, Marco Rossi) — the mockups already use them.

---
*Last updated 2026-09-01. Keep this in sync with the RFP and the delivery plan; if the product story changes, log a `REV-###` in [`REVISIONS.md`](./REVISIONS.md).*
