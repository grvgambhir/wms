# DELIVERY_PLAN_COMO2027.md — the phased build plan

> **Audience:** the AI agent / developer doing the work. This is the **execution plan** to revise the existing app for Como Lake 2027.
> **Read before this:** [`START_HERE.md`](./START_HERE.md) → [`BUSINESS_OVERVIEW_COMO2027.md`](./BUSINESS_OVERVIEW_COMO2027.md) → [`RFP_COMO2027.md`](./RFP_COMO2027.md).
> **Track work in:** [`PROGRESS_COMO2027.md`](./PROGRESS_COMO2027.md). Log any plan/stack change as a `REV-###` in [`REVISIONS.md`](./REVISIONS.md) **before** doing it.
> **Dates:** today = 2026-09-03. P0 demo = **7–8 Sep 2026**. P1 gate = **15–17 Sep 2026**.

---

## ★ North star (read before anything else) — REV-025

**The goal is the full, connected OARS product per the RFP** — one working platform where participants **and** OC staff complete **real end-to-end journeys**, scalable to Games load. The **7–8 Sep demo** and **15–17 Sep UAT** are **milestones on that product build**, not throwaway artifacts. We build **for the 15 Sep deliverable as a real working connected portal**, not "screens to look at."

- **Build philosophy: connected-product-first (thin but real).** Prefer **thin end-to-end vertical slices of the real product** — `login → sport entry → rule check → pay → status → accreditation` as **one journey carrying shared state** — over deep-but-isolated scenario screens. Every slice is the real feature at POC depth, deepened over phases; **nothing is throwaway.**
- **Target architecture is not one Expo app** (see §7): a **shared backend** + a **shared TypeScript domain/contract package** + a **Participant app** (Expo, this codebase) + a **separate plain-React Admin web app**. The current single codebase is the **P0 demo vehicle**; the split is Phase-B slice 1, not "someday."
- **Scalable by design:** RFP baseline **~14,000 athletes / 40+ sports**; realistic peak **~15,000–20,000** participant records (EOI / waitlist / growth). Architected with **sensible headroom** to handle the peak comfortably and grow **without re-architecture**.
- **Honest timeline:** the full production-scale, real-backend, separately-deployed system lands across **phases B–F (to 2027)**. The ~2-week P0/P1 window delivers a **connected working slice at POC / thin-backend depth on the target architecture** — not the entire 14k-scale production system in two weeks.

---

## 0. Locked decisions (confirmed with the product owner 2026-09-01)

| # | Decision | Consequence |
|---|---|---|
| D1 | ~~**Balanced** P0 demo~~ → **amended by REV-025** | Still polish the scripted scenarios, but the frame is now **connected-product-first**: build **thin real end-to-end journeys**, not isolated demo screens. See North star above. |
| D2 | **Hybrid responsive** UI, from day one | Every P0 screen ships with a **desktop portal (left-nav)** layout **and** a usable **mobile** layout. One Expo codebase (the participant app; admin prototyped here for the demo — see D7). Desktop-first for the 7 Sep laptop demo. |
| D3 | **Admin P0-partial** | Build admin **a01, a02, a04, a05** in P0 (in the Expo demo vehicle). Add **a03, a06** in P1. These screens are the **spec** for the future plain-React admin app (D7). |
| D4 | Re-skin to **Como Lake 2027** | Retire Kansas/WMG-Kansai branding for the customer demo; keep demo characters Daniel Harper + Marco Rossi. |
| D5 | **Mock/POC frontend for the demo dates** → **amended by REV-025** | Still no real backend/PSP/OTP/scanner/scoring **on the 7–8 Sep & 15–17 Sep dates**. But the mock is a **temporary stand-in for a real backend that WILL be built** — contract-first now (every repo method = a real endpoint), real backend is the **committed immediate next phase**, not indefinite. |
| **D6** | **North star = full connected product; build for the 15 Sep deliverable** (REV-025) | Optimize every step for **real connected journeys** carrying shared state, deepened over phases. Nothing throwaway. The demo/UAT are milestones on the product, not separate artifacts. |
| **D7** | **Target architecture = shared backend + shared TS domain package + Participant (Expo) + separate plain-React Admin web** (REV-025) | The full product is **not one Expo app** (see §7). Keep the **domain layer pure/framework-agnostic** so it becomes the shared package. Current codebase = P0 demo vehicle + participant prototype; admin screens = spec for the React admin. Split = Phase-B slice 1. **Scale target: ~14k baseline / ~15,000–20,000 peak, sensible headroom.** |

If any of these change, add a `REV-###` first.

---

## 1. Current codebase — reuse map (what to keep / rename / add)

The existing app is a ~95%-complete **old** athlete-only POC (18 screens A01–A18) on a clean, reusable stack. **We revise, not rewrite.**

**Stack (keep as-is):** Expo SDK 57 · Expo Router · TypeScript strict · NativeWind v4 + Tailwind · React Native Reusables primitives · TanStack Query · React Hook Form + Zod · AsyncStorage. Layering: `Screen → feature hook → repository interface → mock repository → fixtures/AsyncStorage`. **Do not break this layering.**

**Keep & reuse directly**
- `src/theme/*` — WMS blue `#4887CA` already set (REV-021). Add **admin dark-navy** tokens + shared **portal shell** tokens.
- `src/components/ui/*` (button, card, input, badge, progress, toast, glass, gradient…) — primitives, reuse everywhere.
- `src/components/shell/*` — `AppScreen`, `AppHeader`, `EmptyState/LoadingState/ErrorState`, `ResponsiveGrid`, `SplitPageLayout`, `WebPageLayout`. These are the seed of the responsive portal shell.
- `src/data/providers/repositories.ts` — singleton wiring; **new repos plug in here**.
- `src/domain/models/*` + `src/domain/repositories/*` — extend, don't replace.
- Feature hooks (`useEvents`, `useRegistration`, `useRegistrationWizard`, `usePartners`, `usePayment`, `useDocuments`, `useAccreditation`, `useResults`, `useAuth`).
- `src/lib/eligibility.ts` — extend into the rules engine (see §3, WS-B).

**Rename / re-skin (D4)**
- `src/constants/copy.ts` `appName: 'IMGA Athlete'` → Como Lake 2027 branding; becomes the **EN base** for i18n (§6.1).
- Demo event fixtures → **Como Lake 2027** (`event-details/` catalogue stays as the WMS event source; make Como the featured/active event).
- Sports demo focus → **swimming, basketball, rowing, tennis** (+ judo/para stretch) instead of tennis-only.

**Add (new this engagement)**
- **Portal shells:** `src/components/shell/ParticipantPortalShell.tsx` (left nav: Dashboard/My Entries/Team/Evidence/Payments/Accreditation/Messages/My Games/Profile/Help) and `src/components/admin/AdminPortalShell.tsx` (OC Command Centre nav: System & Load, Registration Funnel, Exceptions, Accreditation Desk, Finance, + Config: Sport Rules Engine, Fees & Quotas, Comms).
- **Rules engine (mock):** `src/features/rules/*` + `src/domain/models/rule.ts` + `MockRulesRepository`.
- **New domain + repos:** teams/roster, waitlist/quota, exceptions, finance/reconciliation, communications, pre-registration/claim. Add each behind an interface + mock repo + hook.
- **Admin feature folder:** `src/features/admin/*` and `src/components/admin/*`.
- **i18n scaffold:** `src/i18n/*` (en, it) — see §6.1.
- **New route groups:** `app/(participant)/*` (or extend existing groups) and `app/(admin)/*`.

> Before adding anything, grep for an existing component/hook that already does it. Duplication across screens is a defect (AGENTS.md).

---

## 2. Phase P0 — the 7 Sep 2026 demo (first milestone on the connected product)

> **Framing (REV-025):** P0 is **not** a throwaway scripted demo — it is the **first connected slice of the real product**. Build the scenarios as **real journeys carrying shared state**, on the target architecture (§7), so the same code deepens into P1 and beyond. "Scripted" only means *deterministic from the seed*, not *disconnected screens*.

**Definition of success (demo-day):** on a laptop, in a real-feeling connected product, we can walk WMS through the scripted scenarios (RFP §9.3) as **deterministic, connected click-throughs** (state flows screen→screen, not reset per screen), in **English and Italian**, showing every rule effect **on screen** (recalc, warning, impact analysis, reconciliation, incident/SLA), across **both** the participant portal and the OC Command Centre — with no crashes and no "imagine that…" hand-waving.

### 2.1 P0 workstreams

**WS-A · Foundation & re-skin** (do first — everything depends on it)
- [ ] Admin + participant **portal shells** (responsive: left-nav desktop ↔ stacked/drawer mobile). Reuse `shell/*`.
- [ ] Theme: add admin dark-navy sidebar tokens + shared portal tokens; keep participant WMS blue.
- [ ] **i18n scaffold** (EN + IT) wired into `copy.ts` base; language toggle in both shells (EN | IT). Translate the **demo-path** strings (full catalogue can wait for P1).
- [ ] **Como Lake 2027 re-skin**: brand, event, dates (17–26 Sep 2027), region; featured event = Como.
- [ ] **Deterministic demo seed**: one fixtures/seed module so every scenario replays identically (Daniel Harper, Marco Rossi, swimming/basketball/rowing/tennis events, quotas, fees, a pre-seeded exception, a pre-seeded incident). Add a "Reset demo" affordance (extend `useResetDemo`).

**WS-B · Rules engine (mock)** — the crown jewel (RFP §3, pass/fail gate §9.1.3)
- [ ] `domain/models/rule.ts`: rule pattern (youngest-member | crew-average-excl-role | relay-aggregate | individual-band | multi-dimension | handicap | para-class), reference date, bands (min/max/open-ended), effective date, version, grades.
- [ ] `features/rules/engine.ts`: pure functions — `deriveIndividualCategory(dob, refDate, bands)`, `deriveTeamCategory(roster, strategy, refDate)`, `impactAnalysis(ruleChange, registrations)`. Deterministic, unit-testable, **no UI**.
- [ ] `MockRulesRepository` + `useRules` hook; seed a versioned rule register (v2.1 active).
- [ ] Reference date default **31 Dec 2027** (RUL-02); every derivation records original vs current category + reason + user + timestamp (RUL-04).

**WS-C · Participant scenario screens** (responsive)
- [ ] **P08 Dynamic sport/event entry** with the live **"System Rule Check"** panel (calc method, reference date, youngest player, calculated category, slot availability, base fee, notice). *(Scenarios 1, 2, 5.)*
- [ ] **P12 Team roster** — add/remove member → real-time category/price/quota recalc + warning + audit line. *(Scenarios 2, 3.)*
- [ ] **P09 Eligibility evidence** — upload (mock), reviewer status, restricted flag for medical/para. *(Scenarios 1, 6.)*
- [ ] **P11 Partner finder** — invite Marco, pending→accepted. *(Scenario 5.)*
- [ ] **P14 Checkout/payment** — mock PSP, EN/IT receipt, idempotent "retry" that doesn't double-charge. *(Scenarios 1, 7.)*
- [ ] **P20 Waitlist offer** — quota full → join waitlist → offer with expiry timer → claim → pay. *(Scenario 7.)*
- [ ] **P19 Change impact review** — participant sees the impact of an admin rule change / substitution before commit. *(Scenarios 2, 3.)*
- [ ] **P16 My registration dashboard** — statuses, entries, evidence/payment/accreditation state (the participant "home" the demo returns to).

**WS-D · Admin scenario screens** (D3: a01/a02/a04/a05)
- [ ] **A04 Sport Rules Configurator** — select sport, reference date 31/12/2027, calculation strategy (youngest / crew-average / aggregate), category bands table, **Publish Rule Register** → triggers **impact analysis (RUL-03)** + version bump. *(Scenarios 2, 3, 5; pass/fail gate.)*
- [ ] **A02 Exception Review Queue** — evidence/exception items, reason codes, **dual approval** for high-impact. *(Scenarios 4, 6.)*
- [ ] **A01 OC Operations Dashboard** — paid registrations vs cap, active sessions, DB records, reconciliation variance, live funnel, **SLA tracker**, "Trigger Change Freeze", incident open/workaround. *(Scenario 8.)*
- [ ] **A05 Finance Settlement & Reconciliation** — settlement list, gateway callbacks reconciled, refund/chargeback, variance = €0.00. *(Scenario 7, 8.)*

**WS-E · Scenario wiring + demo runbook**
- [ ] Wire the pre-seeded exception (judo) + incident (failed payment/results feed) so scenarios 4 & 8 have a starting state.
- [ ] Cross-portal consistency: an admin rule publish (A04) shows up as a participant change-impact (P19); a participant payment (P14) shows up in finance (A05) and the funnel (A01).
- [ ] Write a short **demo runbook** into [`PROGRESS_COMO2027.md`](./PROGRESS_COMO2027.md) (click path per scenario, EN/IT toggle points, reset step).

### 2.2 Scripted-scenario → work mapping (the acceptance matrix)

| # (RFP §9.3) | Scenario | Screens | P0 status | Demo-pass check |
|---|---|---|---|---|
| 1 | Swimmer individual, age vs 31/12/2027, medical evidence, pay, EN/IT | P08, P09, P14 | **Core** | Category derived from DOB+refDate; medical evidence marked restricted; pay + receipt in IT. |
| 2 | Basketball captain, younger player recalcs category/capacity/price + warning + audit | P12, A04, P19 | **Core** | Add member → category shifts younger, price/quota update, warning shown, audit line written. |
| 3 | Rowing crew average age excl coxswain; substitution validated | P12, A04 | **Core** | Coxswain excluded from average; sub revalidates without corrupting original entry. |
| 5 | Tennis grade-by-event + doubles youngest-player + partner invite | P08, P11 | **Core** | Different grade per event; invite Marco; youngest-player category applied. |
| 7 | Quota fills → waitlist → offer expires → payment retries safely → reconcile | P20, P14, A05 | **Core** | Oversell prevented; offer timer; retry no double-charge; finance variance €0. |
| 8 | Ops detects failed payment/results interface → incident → workaround → SLA evidence | A01, A05 | **Core** | Incident opens, workaround toggled, SLA tiles + evidence shown. |
| 4 | Judo age+weight+federation+belt; exception dual approval | P08/P09, A02 | **Stretch** | Multi-dimension check; exception needs two approvers. |
| 6 | Para-swimming class evidence restricted; export without medical | P09, A02, (export) | **Stretch** | Para class captured, access restricted; export omits medical fields. |

> "Core" = must work for 7 Sep. "Stretch" = build if time remains; otherwise show the *capability shell* (screen + config exists) and narrate.

### 2.3 Suggested P0 sequence
1. WS-A foundation (shells, i18n scaffold, re-skin, seed). 2. WS-B rules engine + `A04` configurator (proves the pass/fail gate early). 3. `P08` + `P12` (scenarios 2/3/5 — highest weight). 4. `P14` + `P20` + `A05` (scenario 7). 5. `A01` incident + `P16` dashboard (scenario 8 + the home base). 6. `P09`/`P11`/`P19` fill-ins. 7. Stretch (judo `A02`, para). 8. EN/IT demo-path polish + runbook + full click-through rehearsal.

### 2.4 P0 Definition of Done (per screen)
Matches AGENTS.md P1 DoD **plus**: responsive desktop + mobile (D2); EN + IT on the demo path; every rule effect visible; deterministic from the seed; no direct fixture import in screens; TypeScript clean; reset replays it identically.

---

## 3. Phase P1 — the 15–17 Sep 2026 UAT gate (the primary near-term target)

> **This is the deliverable we build for (REV-025 / D6).** By 15 Sep the product should read as a **real, connected, working platform** — one continuous participant journey + a working OC Command Centre — exercised under UAT, on the target architecture (§7). It is a **milestone on the full product**, at POC / thin-backend depth (real 14k-scale + real PSP land in phases B–F).

**Goal:** behave like the product that could launch — **complete, connected core registration**, both portals, fully bilingual + accessible, with state flowing end-to-end (not per-screen demos).

- [ ] **Complete the participant journey**: P03 claim pre-registration, P06 profile & consent, plus finish any P0 screens left partial; full status lifecycle (REG-11: draft→pending evidence→pending team→pending payment→waitlisted→confirmed→cancelled→substituted→withdrawn→disqualified).
- [ ] **Complete admin**: add **A03 Accreditation Desk** (photo review, approval gates, issue/reissue/revoke, offline lookup pack) and **A06 Targeted Communications Center** (templates, EN/IT, test send, delivery status, targeting).
- [ ] **Full EN/IT** copy catalogue (not just demo path) + validation/emails/receipts strings.
- [ ] **Accessibility pass (WCAG 2.2 AA)** on core registration path: keyboard-only, screen-reader labels, focus order, contrast, target size, no time-pressure (ACS-01→05). Critical barriers = blockers.
- [ ] **Save-and-resume** across the wizard + payment retry preservation (PLT-05).
- [ ] **Assisted/proxy registration** stub with consent + operator-vs-participant audit (PLT-06).
- [ ] **Reconciliation story** end-to-end across both portals on the deterministic dataset (funnels, evidence backlog, waitlists, capacity, team completeness, exception queues — REG-15).
- [ ] **Judo + para** scenarios finished to full fidelity (promote from stretch).
- ~~Android/iOS compatibility pass on the demo path~~ — **descoped 2026-09-05 (REV-041)** by the product owner. The deliverable is reviewed on Expo Web; native is not part of this milestone. The codebase stays React Native-compatible (no DOM-only screen trees), so a native pass remains possible later — it is simply not gating.

**P1 acceptance** mirrors RFP §6.4 launch acceptance, at POC fidelity: EN+IT journeys complete incl. accessible paths; age/category/team/price/quota/document/payment boundary packs pass on seeded configs; payment authorise/fail/retry/refund/duplicate-callback reconcile in the mock; no open S1/S2-equivalent demo defects.

---

## 4. Phase P2+ — the full product (RFP delivery phases B–F)

Not built now; **architecture must not preclude it.** Every P0/P1 mock repository is an interface so the real implementation swaps in with no UI rewrite (`Mock*Repository` → `Api*Repository`).

- **B (Sep–Dec 2026):** real backend + versioned APIs/webhooks; real PSP (Stripe/Adyen) + SCA/3DS + reconciliation + FatturaPA/SDI; **pre-registration migration** (~15k records, dedup, claim, rollback — REG-13); waitlist automation; finance/admin/reporting depth; agreed integrations; malware scanning; DPA/hosting in EEA.
- **C (Jan–Jun 2027):** competition/games-management (draws, schedules, start lists, results, medal/ranking, category combination preserving award categories — CMP-03); accreditation lifecycle + QR/NFC + badge-print integration + offline packs; sport-by-sport final configs; data rehearsals.
- **D (Jul–16 Sep 2027):** dress rehearsals; capacity/security/DR tests (RPO≤5m, RTO≤60m); training; runbooks; monitoring/observability + synthetic journeys; change freeze; go-live acceptance.
- **E (17–26 Sep 2027):** Games-mode 24×7 software-service command; incident/change control; daily reporting.
- **F (27 Sep–31 Dec 2027):** reconciliation, exports (non-proprietary), deletion certificates, knowledge transfer, exit.

**Scalability guardrails to respect now (so P2+ is possible):**
- Rules are data (config + version + effective date + audit), never code branches per sport.
- One participant record; IDs stable (UUID-style, not display names); relationships realistic (never join on display names).
- Sensitive data (medical/para/ID) modelled as **restricted** from day one — a *separate* domain type + access path, never commingled with the general profile (PRV-04; the backend will hold it under separate encryption keys/logs — model the seam now).
- **Entrant lineage (CMP-03):** when a category is combined, keep BOTH the original award category and the combined-field mapping. The rules engine already records original-vs-current category (RUL-04) — extend the same shape to competition combination.
- **Idempotency:** payment + registration mutations carry a client idempotency key and model `pending`/`optimistic`/`confirmed`/`failed` states, so retries never double-commit and the real backend's idempotent callbacks drop in cleanly (PAY-04, no-oversell).
- **Roster lock** is a hard temporal constraint; post-lock substitutions recompute fees + eligibility + accreditation *before* commit (TEA-04, CMP-04).
- Repository interfaces are the seam; UI never imports fixtures, calls storage, or calls APIs directly.
- Auth is a swappable seam: OTP/passwordless now mocked (PLT-03), token/session later — never bake a specific auth mechanism into screens.
- Timestamps canonical (ISO-8601, store UTC); display **Europe/Rome** (NFR-07); EUR money as integer **minor units** (cents), never floats.

> **Milestone note (reconcile later):** the WIP backend baseline (`context_docs/Backend - Registration Phase Requirements & Core Architecture Foundation.md`) pins an "Operations-Ready Gate (Phase B) = 30 Sep 2026" with the ~15k EOI migrated + waitlists active — tighter than the RFP's "Stabilisation complete 30 Sep 2026" + "Phase B Sep–Dec 2026". The **RFP dates are authoritative**; treat the backend doc's compression as a target to confirm with WMS/OC, not a committed date.

---

## 5. Cross-cutting conventions

### 6.1 i18n (EN + IT)
No i18n lib exists yet; copy is a flat EN object in `src/constants/copy.ts`. Approach:
- Add `src/i18n/` with `en.ts` (seed from `copy.ts`) + `it.ts`, a tiny `t(key)` + `useLocale()` (or `i18n-js` + `expo-localization` if a lib is preferred — log the choice as a REV).
- Language toggle in both portal shells; persist to AsyncStorage. Default EN; IT must cover the demo path in P0, full catalogue in P1.
- Never scatter raw strings in screens (AGENTS.md). Exceptions: testIDs, logs, comments, demo data names.

### 6.2 Accessibility (mandatory, not P1-only)
Build accessible from P0: semantic roles/labels on interactive elements, visible focus, ≥ AA contrast (tokens already close), large targets, clear progress, no forced time-outs without extension. Para/medical fields get restricted, clearly-separated UI (ACS-05).

### 6.3 Demo determinism
One seed module drives all scenarios. Same characters, same numbers, every run. A "Reset demo" control restores the starting state (including the pre-seeded exception + incident). Footer disclaimer on data-bearing screens: *illustrative; final values follow the WMS/OC-approved sport guide + rule register.*

### 6.4 Repository pattern (unchanged, enforced)
New capability = new `domain/models/*` + `domain/repositories/*.repository.ts` interface + `Mock*Repository` + `use*` hook + register in `data/providers/repositories.ts`. Screens consume hooks only.

### 6.5 Testing / validation after meaningful changes
`tsc` clean · lint if configured · Expo Web smoke of the changed path · rules-engine unit checks · main demo path still walks end-to-end. Notify the user if a Metro restart / native rebuild is needed.

### 6.6 Backend adaptability (API-first seam) — mandatory
The POC is frontend/mock, but **everything we build must swap onto a real backend (NestJS or Python FastAPI, REST/JSON) with no UI rewrite.** The seam is the **repository interface** — the mock is one implementation, the API client is the next. Reference: the WIP `Backend - Registration Phase Requirements & Core Architecture Foundation.md` (secondary; the **RFP wins** on substance).

Rules so the swap is a drop-in:
- **Method ↔ HTTP verb mapping.** Design each repository method as if it were already an endpoint:
  - `list*/get*/search*` → `GET` (return paginated list shapes `{ items, total, cursor? }`, not bare arrays, for anything that can grow).
  - `create*` → `POST` · `update*/patch*` → `PUT`/`PATCH` · `cancel*/delete*` → `DELETE` · `*action*` (publish rule, approve exception, claim offer, retry payment) → `POST /…/{verb}`.
- **DTOs are the contract.** Domain models are plain serialisable JSON (no class instances leaking to the wire); stable field names; stable IDs; enums as string unions; money as minor units; dates ISO-8601. What the mock returns is the shape the API will return.
- **Async by default.** Consume via TanStack Query: `useQuery` for GETs, `useMutation` for POST/PUT/DELETE, with `pending/error/success` states already rendered. Mutations invalidate the right query keys (e.g. publishing a rule invalidates registrations affected by impact analysis).
- **Errors + idempotency.** Model a normalised error shape (`{ code, message, fields? }`) and pass a client idempotency key on payment/registration mutations now, so real 4xx/5xx + duplicate-callback handling maps 1:1 later.
- **No env-coupling in screens.** A single `repositories` provider (already at `src/data/providers/repositories.ts`) is where `Mock*` → `Api*` flips; screens/hooks never know which is active. Future: a base URL + auth-token injector live behind that provider only.
- **OpenAPI is the future shared artifact.** When the backend lands, its OpenAPI/Swagger spec should generate (or validate) our repository DTOs — keep names aligned to the RFP data objects (participant, entry, team, roster, evidence, order, credential, rule-version) to minimise churn.

### 6.7 Mock data hub — the current data source (REV-026)

**We do not build the backend** — a **separate developer** owns it; we **integrate later**. Until then the whole flow runs on a **mock data hub**: **API-response-shaped JSON**, consumed **only through repositories** (screens/hooks never import JSON).

- **Shape = the future API response.** Paginated envelopes `{ items, total, cursor? }` for growable lists; stable **UUID** IDs; enums as string unions; **ISO-8601/UTC** dates; **EUR minor units**. What the mock returns is what the API will return — so `Mock* → Api*` is a drop-in.
- **Content = RFP + research.** Populate realistic participants, events, sports, categories, fees, quotas, and versioned rule registers grounded in [`RFP_COMO2027.md`](./RFP_COMO2027.md) + reasonable web research so the demo reads as real Como Lake 2027 data (keep demo characters **Daniel Harper + Marco Rossi**).
- **Consumed via the seam only.** JSON lives under `src/data/mock/fixtures/` (or a `data-hub/` grouping); mock repositories read it and return DTOs. A screen or hook importing JSON directly is a defect.
- **Temporary + swappable.** Later the real backend serves these same shapes; flip repos at `src/data/providers/repositories.ts` → dynamic **GET/PUT**, **no UI/hook change**. This is §6.6 applied to data.
- **Optional realism:** simulate latency + a normalized error shape in the mock so `pending/error/success` states are exercised now.

---

## 6. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| 6-day window vs Hybrid-responsive + admin | Time | Desktop-first for demo; mobile layout uses existing RN components; admin limited to 4 screens (D3). |
| Rules engine wrong on a boundary case | Pass/fail gate fail | Pure, unit-tested engine (WS-B) built first; seed exact boundary cases from RFP §3.2 examples. |
| Mockups (AI-generated) diverge from RFP | Wrong feature | RFP wins; verify each screen against `RFP_COMO2027.md`. |
| EN/IT + a11y treated as afterthought | Release blocker (ACS-04) | i18n scaffold + a11y in WS-A, demo path bilingual in P0. |
| Scope creep into real backend/PSP | Blows POC | D5: mock only; interfaces ready for P2+. |
| Doc drift / agents follow old docs | Rework | `START_HERE.md` supersession map; old docs banner-marked; update `PROGRESS_COMO2027.md` every session. |

---

## 7. Target production architecture & scalability (the full product) — REV-025

> The demo runs in **one Expo codebase** on purpose (fastest path to 7–8 Sep). That is the **P0 vehicle**, not the production shape. This section is the **shape we build toward** and the reason the demo code is not throwaway.

### 7.1 The shape

```text
                         ┌───────────────────────────────┐
                         │        Shared Backend API      │   NestJS or FastAPI (REST/JSON)
                         │  single source of truth · auth │   stateless · horizontally scalable
                         │  persistence · PSP · webhooks  │   Postgres + object store + queue
                         └───────────────┬───────────────┘
                                         │ OpenAPI contract
                         ┌───────────────┴───────────────┐
                         │  Shared TS domain/contract pkg │   domain models + DTOs + rules engine
                         │  (pure TypeScript, zero React) │   validated against the OpenAPI
                         └───────┬───────────────┬────────┘
                                 │               │
                  ┌──────────────┴───┐     ┌─────┴───────────────────┐
                  │  Participant app │     │      Admin web app       │
                  │  Expo / RN       │     │  plain React (Vite/Next) │
                  │  web + iOS/Android│    │  desktop-first, dense    │
                  │  (`wms_participant`)│  │  (spec = current admin)  │
                  └──────────────────┘     └──────────────────────────┘
```

**Why two frontends, not one:** participant = public, mobile-first, guided flows; admin = internal OC staff, desktop-first, data-dense (dashboards, queues, bulk ops, reconciliation, rule authoring). Building a dense back-office tool inside React-Native-Web fights the framework. Standard product architecture = separate deployables on a shared API. **Admin is plain React web.**

> **Naming (REV-026, REV-027):** the future admin frontend lives in a repo/folder named **`wms_admin`** (plain React — Vite/Next). At split time, **this Expo codebase becomes `wms_participant`**. The backend is **built by a separate developer** (not us); we integrate against its API later. Until then, both this participant prototype and the eventual `wms_admin` read from the **mock data hub** (§6.7) shaped as the real API.

### 7.2 What is portable (why nothing is wasted)

| Layer | Today (Expo POC) | Becomes |
|---|---|---|
| **Domain models** `src/domain/models/*` | plain TS types | the **shared package** (unchanged) |
| **Rules engine** `src/features/rules/engine.ts` | pure functions, no RN | shared package **and** backend rule service (unchanged) |
| **Repository interfaces** `src/domain/repositories/*` | mock impl behind them | the **REST contract** (mock → `Api*`) |
| **DTO shapes / fixtures** | JSON the mock returns | the shape the API returns |
| **Admin screens** `app/(admin)/*` | Expo-Web render | **visual + behavioural spec** for the React admin (re-implemented, logic reused) |
| **Participant screens** `app/(participant)/*` | Expo-Web + native | carry forward as the Expo participant app |

**Rule:** keep the domain layer **pure and framework-agnostic** — no React Native imports in `src/domain/*`, `src/features/rules/engine.ts`, or DTO types. That purity is what makes the split cheap.

### 7.3 When we split (REV-027 refines the timing)

1. **Now → 8 Sep:** one Expo codebase (P0 demo vehicle) — **do not touch its working tree** with split work; regression risk this close to the demo is not worth it.
2. **Phase-B PREP (started 2026-09-04, safe track — runs now, in parallel with demo prep):**
   - Scaffold **`wms_admin`** as a brand-new, separate sibling folder (plain React/Vite) and port 1–2 admin screens as a proof-of-concept against copied mock data. Never edits this repo.
   - Audit `src/domain/*` / `features/rules/engine.ts` / `features/registration/statusLifecycle.ts` for framework purity (report only, no files moved) — a checklist of what's split-ready today vs. needs cleanup first.
3. **Phase B slice 1 (immediately post-demo, unsafe track):** stand up the backend skeleton + extract the **shared domain/contract package** (monorepo workspace) + rename/move this codebase to **`wms_participant`** + finish wiring `wms_admin` to the real contract. Flip participant repos `Mock* → Api*` behind `src/data/providers/repositories.ts` incrementally.
4. **Phases B–F:** deepen to real 14k-scale, real PSP, real accreditation/results, per RFP.

### 7.4 Scalability guardrails (designed for now, hold to Games load)

Target: **~14,000 athletes / 40+ sports** (RFP baseline); realistic peak **~15,000–20,000** participant records (EOI / waitlist / growth). Architected with **sensible headroom** to handle the peak comfortably so **no re-architecture** is needed to grow.

- **API-first, stateless services** (§6.6) — scale horizontally behind a load balancer; no server-side session affinity.
- **Paginated / cursor list DTOs** everywhere growable (`{ items, total, cursor? }`), never bare arrays — the mock already returns these shapes.
- **Stable UUID IDs**, never joins on display names (already enforced).
- **Idempotency keys** on payment/registration mutations → safe retries at scale, no double-commit (PAY-04).
- **Restricted-data isolation** (medical/para/ID) as a separate domain type + access path from day one (PRV-04) — separate keys/logs in the real backend.
- **Rules as versioned data**, never per-sport code branches — one engine scales to 40+ sports by configuration.
- **Money as integer minor units**, timestamps ISO-8601/UTC, display Europe/Rome (NFR-07).
- Heavy back-office reads (funnels, reconciliation, exports) designed as **query endpoints with pagination/streaming**, not "load everything" calls.

---
*Last updated 2026-09-03. This plan is the approved P0/P1 scope; the north star (§ top) and target architecture (§7) are the full-product direction (REV-025). Changes → `REV-###` in [`REVISIONS.md`](./REVISIONS.md) first, then update [`PROGRESS_COMO2027.md`](./PROGRESS_COMO2027.md).*
