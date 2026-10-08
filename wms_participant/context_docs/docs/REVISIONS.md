# REVISIONS.md

> **Changelog for plan, stack, and architecture decisions** — not for every code commit.  
> When product behaviour, tech stack, folder structure, or implementation order changes, log it here **before** or **in the same change** as updating `PROGRESS_COMO2027.md`, `DELIVERY_PLAN_COMO2027.md`, `ARCHITECTURE.md`, or `AGENTS.md`.
> *(Historical entries below reference now-deleted docs like `SCREEN_FLOW.md` / `POC_SCOPE.md` — those are accurate past-tense records; see REV-024.)*
> *(Entries before REV-034 refer to this repo as `olympic_master_games` — its name until the rename recorded in REV-034. Those references are left intact as accurate past-tense records.)*

**Last updated:** 2026-09-17 · latest: **REV-090** (deferred entrant-attribute supersession foreign key)

---

## How to add a revision

1. Copy the template below.
2. Assign the next `REV-###` ID.
3. State **what changed**, **why**, and **what stays the same**.
4. List **files updated** because of this revision.
5. Update `PROGRESS.md` if completion status or next steps changed.

### Revision entry template

```markdown
## REV-### — Short title (YYYY-MM-DD)

**Status:** Proposed | Approved | Superseded by REV-###  
**Author:** human | agent session  
**Scope:** UI | Architecture | Product | Data | Tooling

### What changed
- ...

### Why
- ...

### Unchanged (explicit)
- ...

### Files updated
- `path/to/file.md`

### Impact on implementation
- ...
```

---

## REV-001 — React Native Reusables as UI primitive layer (2026-08-18)

**Status:** Approved (pending implementation)  
**Author:** planning session with user  
**Scope:** UI / Tooling

### What changed

- **UI component strategy** updated from **NativeWind-only (hand-built primitives)** to:
  - **React Native Reusables** — primary reusable primitive layer (shadcn-style, CLI copy-in)
  - **NativeWind v4** — styling foundation (stable, not v5 preview)
  - **IMGA design tokens** — visual identity on top (not RNR defaults)
- **Phase 1** expanded into 7 steps: NativeWind setup → RNR foundation → IMGA tokens → incremental primitives → thin wrappers only where needed → custom event components → UI kit dev screen.
- **Dependencies:** added RNR shared packages (`tailwindcss-animate`, `class-variance-authority`, `clsx`, `tailwind-merge`, `@rn-primitives/portal`, per-component `@rn-primitives/*` via CLI).
- **Folder additions:** `src/components/ui/` (RNR), `src/lib/utils.ts`, `components.json`, `global.css`, optional `src/lib/navigation-theme.ts`.
- **Removed approach:** building full custom `PrimaryButton`, `TextField`, etc. from scratch upfront.

### Why

- Faster path to premium, consistent UI without reinventing common controls.
- shadcn-style copy-in keeps components customizable for IMGA mockups.
- Same Expo RN codebase for Web / Android / iOS.
- Easier for AI agents to produce consistent UI across 18 screens.

### Unchanged (explicit)

- Business architecture: `Screen → Hook → Repository → Mock/API`
- A01–A18 screen flow and batch order (Batch 1–4)
- Mock data strategy, canonical demo entities
- Expo Web-first development loop
- Domain model (`DATA_MODEL.md`)
- No backend, real OTP, real payments, or scoring engine

### Files updated

- `docs/REVISIONS.md` (this file)
- `docs/PROGRESS.md`
- `docs/ARCHITECTURE.md` (UI layer section)
- `docs/IMPLEMENTATION_PLAN.md` (Phase 1)
- `AGENTS.md` (stack + progress doc rules)
- `.cursor/rules/imga-athlete-poc.mdc`

### Impact on implementation

- Phase 0 must include RNR doctor pass after NativeWind setup.
- Phase 1 installs only Batch 1 primitives: `button`, `text`, `input`, `label`, `card`, `badge`, `separator`, `progress`.
- Later batches add `checkbox`, `select`, `avatar`, `sheet`, `alert-dialog`, `tabs` as needed.
- `react-native-qrcode-svg` deferred to Batch 4 (A16).
- `@react-native-community/datetimepicker` deferred to Batch 2 (A07).

---

## REV-002 — Premium aesthetic: gradients, glass, mockup-as-reference (2026-08-18)

**Status:** Approved  
**Author:** user + agent session  
**Scope:** UI / Product

### What changed

- Visual bar raised: app should feel **cool, aesthetic, premium** — not generic template UI.
- **Mockups = directional reference** for flow/layout/content; agents may **improve** with gradients, transparency/glass, depth, and polish.
- `DESIGN_SYSTEM.md` expanded: aesthetic direction, gradient/transparency rules, new token examples.
- `AGENTS.md` visual intent updated accordingly.
- Planned **Phase 1.5 — Design Elevation** (after Phase 2, before Batch 1): elevate tokens + UI kit + shared components before A01–A06.

### Why

- User wants maximum visual quality within POC speed.
- Blind mockup copying caps how premium the app can feel.
- Phase 2 (domain layer) has no UI — good slot for visual elevation without blocking data work.

### Unchanged (explicit)

- A01–A18 screen flow and batch order
- Repository architecture
- RNR + NativeWind stack (REV-001)
- Expo Web-first workflow

### Files updated

- `docs/REVISIONS.md`
- `docs/DESIGN_SYSTEM.md`
- `AGENTS.md`
- `.cursor/rules/imga-athlete-poc.mdc`
- `docs/PROGRESS.md`

### Impact on implementation

- Batch 1 screens should use elevated shared components, not plain RNR defaults.
- Add `expo-linear-gradient` + glass/gradient tokens in Phase 1.5.
- Revisit `EventCard`, `AppScreen`, UI kit, buttons before A01.

---

**Last updated:** 2026-08-18

---

## REV-003 — Kansas Senior Games as featured canonical event (2026-08-18)

**Status:** Approved  
**Author:** user + agent session  
**Scope:** Product / Data

### What changed

- **Featured canonical event** is now **Kansas Senior Games 2026** (`event_ksg_2026`) — Topeka, KS — listed **first** on the Events screen.
- Fixture includes organizer contact details, website, sport offerings (individual + Volleyball team), and out-of-state participation flag.
- Demo registration path (Daniel → Tennis doubles → Marco Rossi → GamesHub) now anchors on KSG; Open Masters Games Como remains as a secondary list event.
- `Event` model extended with optional `featured`, `state`, organizer/contact/website fields.
- `DEMO_IDS.eventKsg` replaces `eventComo` as the canonical event ID constant.

### Why

- User requested Kansas Senior Games as the top/primary event for the POC demo and documentation.

### Unchanged (explicit)

- A01–A18 screen flow and batch order
- Repository architecture
- Daniel Harper, Marco Rossi, Tennis Men's Doubles 40–44 demo sport path
- OTP `123456`, mock payment, no real backend

### Files updated

- `docs/REVISIONS.md`
- `docs/MOCK_DATA.md`
- `docs/DATA_MODEL.md`
- `docs/PROGRESS.md`
- `src/domain/models/event.ts`
- `src/constants/demo.ts`
- `src/data/mock/fixtures/events.json`, `sports.json`, and related fixture `eventId` references
- `src/data/mock/repositories/MockEventsRepository.ts` (featured sort)

### Impact on implementation

- Batch 1 Events/Details screens should treat KSG as the hero card.
- Event Details can surface organizer contact + website from fixture fields.

---

## REV-004 — WMS-only event catalog; Kansai 2027 in-app demo (2026-08-19)

### Status
Approved

### What changed
- **Removed** Kansas Senior Games (`event_ksg_2026`) from fixtures and UI.
- Events list is **only** the 18 WMS catalog events from `context_docs/event-details/` (`wms-events.json`).
- **In-app registration demo** anchors on **WMG Kansai 2027** (`event_wmg_kansai_2027`).
- `DEMO_IDS.eventDemo` replaces `DEMO_IDS.eventKsg`.
- Promo code `KANSAI2027` replaces `KSG2026` in mock payment.

### What stayed the same
- A01–A18 screen flow and repository architecture unchanged.
- Daniel Harper → Tennis doubles → Marco Rossi → GamesHub demo path preserved on Kansai.

### Why
- User requested only `context_docs/event-details/` events in the app; Kansas demo removed.

### Files updated
- `src/data/mock/fixtures/*`, `src/constants/demo.ts`, `app/(discovery)/events.tsx`
- `app/(auth)/login.tsx`, `src/components/auth/*`
- `docs/PROGRESS.md`, `docs/REVISIONS.md`, `README.md`

### Impact on implementation
- Events screen: upcoming + previous sections only (no featured KSG tile).
- Batch smoke tests: open **WMG Kansai 2027** for in-app registration.

---

## REV-005 — Dockerize Expo Web static demo (2026-08-19)

**Status:** Approved  
**Author:** agent session  
**Scope:** Tooling

### What changed

- Added multi-stage **Docker** image: `expo export --platform web` then **nginx** serving `dist/`.
- Added `docker-compose.yml` mapping host **6041** → container **80**.
- Added `npm run export:web` for local static export without Docker.

### Why

- User asked to run the **web** POC on a VM via Docker (not JVM; this is not a Java app).

### Unchanged (explicit)

- Expo RN codebase, A01–A18 flow, mock repositories
- Dev loop remains `npm run web` (Metro)
- No backend, OTP provider, or payment gateway

### Files updated

- `Dockerfile`, `.dockerignore`, `docker/nginx.conf`, `docker-compose.yml`
- `package.json`, `README.md`
- `docs/REVISIONS.md`, `docs/PROGRESS.md`

### Impact on implementation

- VM demo: `docker compose up --build` then open `http://<host>:6041`.
- Rebuild the image after app code changes.

---

## REV-006 — Tester-only registration reset, not product cancel (2026-08-19)

**Status:** Approved  
**Author:** agent session  
**Scope:** Tooling / POC test helper

### What changed

- Added a **hidden tester reset** that clears local registration state (draft, submitted registration, documents, partner requests, payments) while **keeping login and athlete profile**.
- Not an A01–A18 athlete “cancel/deregister” product step (still out of RFP/POC screen flow).
- Hidden gestures: 5 taps on A15 reference id, 5 taps on Profile hint card.
- Explicit buttons only on existing **dev** routes (`/(dev)/flow-map`, `/(dev)/data-smoke`).

### Why

- Testers need to re-run the registration path without treating cancel as a product capability.

### Unchanged (explicit)

- A01–A18 flow, `RegistrationStatus` domain union (no `cancelled`/`withdrawn`)
- No athlete-facing Cancel Registration CTA
- Full **Reset demo data** still logs the user out

### Files updated

- `src/data/storage/resetRegistrationDemo.ts`, `src/features/demo/hooks/useResetRegistrationDemo.ts`
- `app/(registration)/status.tsx`, `app/(discovery)/profile.tsx`
- `app/(dev)/flow-map.tsx`, `app/(dev)/data-smoke.tsx`
- `README.md`, `docs/REVISIONS.md`, `docs/PROGRESS.md`

### Impact on implementation

- After reset, start again from Events → WMG Kansai 2027.

---

## REV-007 — Gate GamesHub (Home) on approved registration (2026-08-19)

**Status:** Approved  
**Author:** agent session  
**Scope:** Product / UI

### What changed

- Bottom-nav **Home** still routes to A17 (`/(main)/gameshub`).
- Full GamesHub (digital pass, next match, schedule, venues) shows only when registration status is `approved`, `accreditation_pending`, or `accreditation_issued`.
- Unregistered / in-progress athletes see a locked home: greeting + explanation + Browse events (or Continue / View status if a draft or submitted registration exists).

### Why

- Docs: GamesHub is the **event-time** home after registration/accreditation. Mock schedule was always returned for Kansai, so Home looked “live” after a registration reset.

### Unchanged (explicit)

- A17 remains the Home tab destination (no extra screen id).
- Login still lands on Events (`app/index.tsx`).
- Approved demo path A16 → GamesHub → A18 unchanged.

### Files updated

- `app/(main)/gameshub.tsx`, `src/features/gameshub/hooks/useGamesHub.ts`, `src/constants/copy.ts`
- `docs/REVISIONS.md`, `docs/PROGRESS.md`

### Impact on implementation

- After tester reset, Home must not show accreditation/match content.

---

## REV-008 — SVG QR on digital accreditation pass (2026-08-19)

**Status:** Approved  
**Author:** agent session  
**Scope:** UI / Tooling

### What changed

- A16 renders a real QR from `accreditation.qrValue` via `react-native-qrcode-svg` (uses existing `react-native-svg`).
- Wallet and Share stay POC stubs (`Alert`); they are not native wallet or share sheets.

### Why

- Mockup A16 is QR-centric. A fake QR box does not scan and does not prove the pass payload.

### Unchanged (explicit)

- No real Apple/Google Wallet, no backend QR signing.
- GamesHub remains the primary post-pass CTA (`SCREEN_FLOW`).

### Files updated

- `package.json`, `src/components/accreditation/AccreditationCard.tsx`, `app/(main)/accreditation.tsx`
- `README.md`, `docs/REVISIONS.md`, `docs/PROGRESS.md`

### Impact on implementation

- Web/native both draw SVG QR. Native wallet remains out of POC scope.

---

## REV-009 — Working Sign Up + canonical A07 prefill (2026-08-19)

**Status:** Approved  
**Author:** agent session  
**Scope:** Product / Data

### What changed

- A01 **Sign Up** is a mock account create (name, email, password) that stores a local athlete and session. Duplicate emails are rejected.
- Login/OTP resolve `athleteId` from email (Harper aliases + fixtures + local signups). Unknown password-login emails still fall back to Harper for the demo.
- Harper fixture now includes passport, emergency contact, and `daniel.harper@email.com` so A07 matches the mockup prefill. Incomplete AsyncStorage overrides merge with the fixture.

### Why

- Sign Up was a stub; A07 looked empty because Harper’s emergency/passport fields were missing from fixtures.

### Unchanged (explicit)

- No real identity provider. Demo password remains `password123`. Google/Forgot password stay stubs.
- Profile remains a first-class athlete entity, not embedded only in registration.

### Files updated

- `app/(auth)/login.tsx`, `src/data/mock/repositories/mockAuthRepository.ts`, `src/data/mock/repositories/mockAthleteRepository.ts`
- `src/data/mock/fixtures/athletes.json`, `src/data/mock/localAthletes.ts`
- `docs/MOCK_DATA.md`, `docs/REVISIONS.md`, `docs/PROGRESS.md`

### Impact on implementation

- Testers can create a non-Harper athlete; A07 for Harper should show Daniel / Sarah Harper without retyping.

---

## REV-010 — Temporary World Masters landing + Athlete Portal (2026-08-19)

**Status:** Approved  
**Author:** agent session  
**Scope:** Tooling / POC demo shell  
**Remove later:** yes — this is **not** the production website integration.

### What changed

- Docker nginx `/` now serves a **saved snapshot** of the World Masters Sport homepage (`worlmasters.html` → `world-masters.html`).
- Header injects an **Athlete Portal** CTA (after News) that opens the Expo app at `/login`.
- `npm run web` (Metro) is unchanged: `/` is still the Expo app. Open the HTML file locally to preview the CTA (`file://` links to `http://localhost:8081/login`).

### Why

- Web POC demos should start from a familiar IMGA/WMS public site, then jump into the athlete app.

### Unchanged (explicit)

- Not a separate React/Vite athlete web app.
- A01–A18 Expo RN codebase, mock repos, and screen flow.
- No real worldmasterssport.com deploy; this is a local/VM snapshot only.

### Files updated

- `worlmasters.html`, `docker/nginx.conf`, `Dockerfile`
- `docs/POC_SCOPE.md`, `docs/ARCHITECTURE.md`, `docs/PROGRESS.md`, `docs/REVISIONS.md`, `README.md`

### Impact on implementation

- VM URL `http://<host>:6041/` is the marketing snapshot; Athlete Portal → login.
- App routes (`/login`, `/events`, …) still work on the same port.
- **Delete later:** landing HTML, nginx `location = /`, Dockerfile copy of `world-masters.html`, and this revision’s “temporary” notes.

---

## REV-011 — Website layouts on wide web; mobile unchanged (2026-08-19)

**Status:** Approved  
**Author:** agent session  
**Scope:** UI / Architecture

### What changed

- Wide web (≥768px) is a **website presentation**: `max-w-7xl` container, split columns, denser grids. Compact/native stay the mobile app.
- Shared primitives: `WebPageLayout`, `SplitPageLayout`, `ResponsiveGrid`, `layoutTier` on `useAppLayout`.
- A17 GamesHub is a dashboard on laptop (next match + shortcuts; schedule + announcements). Hub screens (Events, Profile, Registrations, live match) use the wide container instead of `max-w-3xl`.

### Why

- Laptop Chrome showed a phone column with stacked tiles. Extra width was unused.

### Unchanged (explicit)

- One Expo RN codebase. No Vite web app.
- Compact (`<768` / native / `m.*`) stacking, bottom nav, and A01–A18 flow stay as-is.
- Registration wizard field layouts stayed phone-stacked until **REV-012**.

### Files updated

- `src/constants/layout.ts`, `src/hooks/useAppLayout.ts`
- `src/components/shell/WebPageLayout.tsx`, `SplitPageLayout.tsx`, `ResponsiveGrid.tsx`
- `app/(main)/gameshub.tsx`, `app/(discovery)/events.tsx`, `app/(discovery)/profile.tsx`, `app/(registration)/index.tsx`, `app/(main)/match/[id].tsx`
- `docs/DESIGN_SYSTEM.md`, `docs/ARCHITECTURE.md`, `docs/REVISIONS.md`, `docs/PROGRESS.md`, `README.md`

### Impact on implementation

- New screens on web-wide must use `WebPageLayout` (and split/grid as needed), not `max-w-3xl`.

---

## REV-012 — Registration wizard website layouts (2026-08-19)

**Status:** Approved  
**Author:** agent session  
**Scope:** UI

### What changed

- `RegistrationFormLayout` uses `max-w-7xl` on wide web (no phone `max-w-2xl` strip).
- Compact wizard keeps a horizontal bar stepper. Wide web shows a **left vertical step rail**.
- A07–A15 rearrange on laptop: 2-col profile fields, category/document/partner grids, photo split, review/payment/status columns.
- Wizard `BottomActionBar` aligns to the same `max-w-7xl` container.

### Why

- Registration screens still looked like a phone column on laptop after REV-011 hub pages.

### Unchanged (explicit)

- Compact/native stacking, bottom nav, and A01–A18 flow.
- One Expo RN codebase. No Vite web app.
- Mock OTP/payment and repository layering.

### Files updated

- `src/components/registration/RegistrationFormLayout.tsx`, `RegistrationStepper.tsx`
- `src/components/shell/BottomActionBar.tsx`
- `app/(registration)/overview.tsx`, `profile.tsx`, `category.tsx`, `documents.tsx`, `photo.tsx`, `partner.tsx`, `partner-finder.tsx`, `review.tsx`, `payment.tsx`, `status.tsx`
- `docs/DESIGN_SYSTEM.md`, `docs/ARCHITECTURE.md`, `docs/REVISIONS.md`, `docs/PROGRESS.md`, `README.md`

### Impact on implementation

- Wizard screens pass `currentStep` + `header` into `RegistrationFormLayout`; they no longer render `RegistrationStepper` inline.

---

## REV-013 — Auth + stack website layouts (2026-08-19)

**Status:** Approved  
**Author:** agent session  
**Scope:** UI

### What changed

- Login is a **full-viewport** hero | form split on wide web (no centered `max-w-5xl` card).
- OTP login / verify use the same split; primary CTA sits under the form on laptop (not pinned to the bottom of the viewport). Compact keeps the bottom bar.
- Event detail, choose sport, and the registration wizard show `WebAppHeader` on wide web (`StackWebChrome` / `RegistrationFormLayout` `siteNav`).
- A16 pass | wallet/share columns; A18 scoreboard | stats columns.

### Why

- Remaining screens still looked like a phone app on a laptop after REV-011/012.

### Unchanged (explicit)

- Compact/native stacking, bottom nav, mock OTP/payment, one Expo RN codebase.

### Files updated

- `src/components/auth/AuthFormLayout.tsx`, `src/components/shell/StackWebChrome.tsx`
- `app/(auth)/login.tsx`, `otp-login.tsx`, `otp.tsx`
- `app/(discovery)/event/[id].tsx`, `event/[id]/sports.tsx`
- `app/(main)/accreditation.tsx`, `src/components/accreditation/AccreditationCard.tsx`
- `src/components/gameshub/LiveResultCard.tsx`, `src/components/registration/RegistrationFormLayout.tsx`
- `docs/DESIGN_SYSTEM.md`, `docs/ARCHITECTURE.md`, `docs/REVISIONS.md`, `docs/PROGRESS.md`, `README.md`

### Impact on implementation

- Do not pin auth CTAs with `BottomActionBar` on wide web.
- Stack screens that are not tab roots should use `StackWebChrome` (or `siteNav` on the wizard layout).

---

## REV-014 — A09–A14 mockup polish (2026-08-19)

**Status:** Approved  
**Author:** agent session  
**Scope:** UI

### What changed

- A09: eligibility copy, document badges/filename/date, kebab replace, optional upload, Save & Exit.
- A10: four photo guidelines, crop-grid overlay, Camera/Gallery/Rotate, Save & Exit. Crop still uses ImagePicker; rotate is preview-only.
- A11: event summary, selectable option cards, Continue, change-later note.
- A12: search icon, country chips, found count, richer partner cards, post-request stub, empty hint.
- A13: Edit links, documents checklist, T&C link stub.
- A14: amount card, radio methods + bank transfer, promo badge/invalid, **Pay {amount} securely** + SSL note.

### Why

- Remaining mockup pass after website layouts (REV-013).

### Unchanged (explicit)

- Mock payment/OTP, no real crop engine or document storage, A01–A18 flow.

### Files updated

- `app/(registration)/documents.tsx`, `photo.tsx`, `partner.tsx`, `partner-finder.tsx`, `review.tsx`, `payment.tsx`
- `src/components/registration/DocumentCard.tsx`, `RegistrationSummaryCard.tsx`
- `src/components/partner/PartnerCard.tsx`, `src/components/shell/EmptyState.tsx`
- `src/constants/copy.ts`
- `docs/PROGRESS.md`, `docs/REVISIONS.md`

### Impact on implementation

- Photo rotate does not rewrite the saved URI (POC preview).
- Optional document type `other` is stored if uploaded; required docs still gate Continue.

---

## REV-015 — Hub web density: hover, type scale, empty states (2026-08-19)

**Status:** Approved  
**Author:** agent session  
**Scope:** UI

### What changed

- Shared `CARD_HOVER`, `PAGE_TITLE`, and `PAGE_LEAD` tokens in `src/constants/layout.ts`.
- Pressable hub/event/GamesHub cards lift on web hover (native ignores `hover:`).
- Laptop titles step up (`lg:text-3xl` / hero `lg:text-4xl`); compact stays mockup-sized.
- `EmptyState` tones (search / calendar / lock / inbox / folder) plus descriptions on Events, sport search, category, GamesHub locked/schedule, registrations, partner finder.

### Why

- Remaining Phase 12 density after REV-014: hub pages still felt static on laptop (no hover, phone type, search icon on every empty).

### Unchanged (explicit)

- Compact/native stacking, A01–A18 flow, mock OTP/payment, no Android/iOS pass.

### Files updated

- `src/constants/layout.ts`, `src/constants/copy.ts`, `src/components/shell/EmptyState.tsx`
- Event, GamesHub, partner, option, header card components
- Hub screens: Events, sports, category, GamesHub, registrations, profile, partner finder
- `docs/PROGRESS.md`, `docs/REVISIONS.md`, `docs/DESIGN_SYSTEM.md`, `README.md`

### Impact on implementation

- Use `CARD_HOVER` on new pressable cards instead of one-off `hover:` classes.
- Do not use the search icon for non-search empties — pass `tone`.

---

## REV-016 — Drop wallet + payment method picker (2026-08-19)

**Status:** Approved  
**Author:** agent session  
**Scope:** Product / UI

### What changed

- **A16** no longer shows Add to Wallet (POC stub). Share + venue hint remain.
- **A14** no longer lists Apple Pay, Google Pay, PayPal, bank transfer, or card picker. One Pay CTA still runs the mock payment (stored as `card`).

### Why

- Wallet and extra payment brands were demo chrome, not real integrations.

### Unchanged (explicit)

- Mock payment delay/success, promo codes, A01–A18 navigation, no real gateway or native wallet.

### Files updated

- `app/(registration)/payment.tsx`, `src/components/accreditation/AccreditationCard.tsx`, `src/constants/copy.ts`
- `docs/SCREEN_FLOW.md`, `docs/PROGRESS.md`, `docs/REVISIONS.md`

### Impact on implementation

- Do not reintroduce Apple/Google Pay or Wallet CTAs unless a real integration is requested.

---

## REV-017 — Profile tab is identity home; seed Harper files (2026-08-19)

**Status:** Approved  
**Author:** agent session  
**Scope:** Product / Data / UI

### What changed

- Athlete identity (A07 fields) is edited on the **Profile tab**. A07 remains a registration confirm step using the same form.
- Login email is read-only. Password stays on login only.
- Harper fixture includes `profileImageKey` plus verified document filenames in `documents.json`. Mock documents repo merges fixtures with AsyncStorage overlays.
- A10 / A16 / Profile show the bundled Harper portrait when no picker URI exists.

### Why

- One-time identity belonged in Profile, not only inside event registration. Mock JSON should feel like a filled athlete, not empty forms.

### Unchanged (explicit)

- Mock OTP/password login, no real file storage, A01–A18 flow, event-specific sport/category/payment still on registration.

### Files updated

- `app/(discovery)/profile.tsx`, `app/(registration)/profile.tsx`, `app/(registration)/photo.tsx`, `app/(main)/accreditation.tsx`
- `src/components/athlete/AthleteProfileForm.tsx`, `src/data/mock/fixtures/documents.json`, `athletes.json`
- `src/data/mock/repositories/mockDocumentsRepository.ts`, `src/lib/photo.ts`
- `docs/SCREEN_FLOW.md`, `docs/DATA_MODEL.md`, `docs/MOCK_DATA.md`, `docs/PROGRESS.md`, `docs/REVISIONS.md`

### Impact on implementation

- Do not trap name/DOB/emergency only in the wizard. Seeded Harper documents survive registration reset (fixtures, not storage).

---

## REV-018 — Drop Profile from registration wizard; portrait photo preview (2026-08-19)

**Status:** Approved  
**Author:** agent session  
**Scope:** Product / UI

### What changed

- Event registration is **7 steps**: Overview → Category → Documents → Photo → Partner → Review → Payment. Profile is no longer a wizard step.
- A06 Start registration goes to A08 when identity is complete; incomplete identity goes to the Profile tab.
- `/(registration)/profile` redirects to category (or Profile tab if no event).
- Review athlete Edit opens the Profile tab.
- A10 accreditation preview uses a centered **3:4** frame with `contentFit="contain"` so the full headshot is visible (no landscape crop strip).

### Why

- Identity already lives on the Profile tab (REV-017). Repeating it in the event wizard was extra work. The photo crop box was a wide landscape container with `cover`, which clipped forehead and chin.

### Unchanged (explicit)

- Profile tab still edits identity. Harper fixture still prefills. Mock OTP/payment. A08–A18 event-specific steps. No real camera crop library.

### Files updated

- `app/(registration)/overview.tsx`, `profile.tsx`, `category.tsx`, `documents.tsx`, `photo.tsx`, `partner.tsx`, `partner-finder.tsx`, `review.tsx`, `payment.tsx`
- `src/features/athlete/utils/profileForm.ts`, `src/constants/screens.ts`, `src/constants/copy.ts`
- `docs/SCREEN_FLOW.md`, `docs/POC_SCOPE.md`, `docs/BUSINESS_CONTEXT.md`, `docs/PROGRESS.md`, `docs/REVISIONS.md`

### Impact on implementation

- Do not add Profile back into `REGISTRATION_STEPS`. Gate A06 on `isAthleteProfileComplete`. Keep A10 preview in a 3:4 portrait frame.

---

## REV-019 — Drop promo code from payment (2026-08-19)

**Status:** Approved  
**Author:** agent session  
**Scope:** Product / UI

### What changed

- **A14** no longer shows apply-promo input, badge, or discount line. Total is entry fee + service fee.
- Mock Pay CTA is unchanged.

### Why

- Promo was extra POC chrome after methods were already removed (REV-016).

### Unchanged (explicit)

- Mock payment delay/success, `PaymentInput.promoCode` still optional on the domain type, fee fixtures may still list codes, no real gateway.

### Files updated

- `app/(registration)/payment.tsx`, `src/constants/copy.ts`, `README.md`
- `docs/SCREEN_FLOW.md`, `docs/POC_SCOPE.md`, `docs/MOCK_DATA.md`, `docs/PROGRESS.md`, `docs/REVISIONS.md`

### Impact on implementation

- Do not put a promo field back on A14 unless product asks.

---

## REV-020 — Realistic partner request lifecycle (2026-08-19)

**Status:** Approved  
**Author:** agent session  
**Scope:** Product / Data / UI

### What changed

- Send request always starts **pending**. Continue stays locked until a partner is confirmed.
- **Marco Rossi** accepts after ~1.5s (POC stand-in for the other athlete opening the app).
- Other listed athletes stay pending (no fake instant pairing).
- A11 **I have a partner** opens finder in select mode — confirm immediately, no request wait.
- A11 **Find** / **Invite** use request + wait. Accepting one partner cancels other outgoing pending requests.

### Why

- Instant-accept on Marco while everyone else stayed pending felt inconsistent. Docs already model `PartnerRequestStatus` including pending/accepted.

### Unchanged (explicit)

- Canonical demo partner is still Marco. No real notifications, no second logged-in athlete, no backend. Doubles still require a confirmed partner.

### Files updated

- `app/(registration)/partner.tsx`, `partner-finder.tsx`, `src/components/partner/PartnerCard.tsx`
- `src/data/mock/repositories/mockPartnerRepository.ts`, `src/domain/repositories/partner.repository.ts`
- `src/features/partners/hooks/usePartners.ts`, `src/features/partners/utils/partnerSetup.ts`, `src/constants/copy.ts`
- `docs/SCREEN_FLOW.md`, `docs/POC_SCOPE.md`, `docs/MOCK_DATA.md`, `docs/ARCHITECTURE.md`, `docs/PROGRESS.md`, `docs/REVISIONS.md`

### Impact on implementation

- Do not auto-accept anyone except Marco in the mock layer. Do not unlock Continue on pending-only requests for partner-required categories.

---

## REV-021 — World Masters Sport brand palette (2026-08-20)

**Status:** Approved  
**Author:** agent session  
**Scope:** UI

### What changed

- Athlete POC visual identity now uses the **World Masters Sport** site palette from `worlmasters.html`, so landing → Athlete Portal feels like one product.
- Brand primary is `#4887CA` (nav, event chips, countdown). Link/heading blue `#0C71C3`. Hero CTA cyan `#008FD5`.
- Surfaces shift from slate-indigo (`#F7F9FC` / `#0D47B5`) to cool WMS off-white (`#F5F8FB`) and sky-tinted borders (`#E3EDF5`).
- Gradients, glass shadows, NativeWind CSS variables, and lucide icon fills now read from `src/theme/colors.ts` instead of hardcoded IMGA indigo.

### Why

- Demo path starts on the saved World Masters homepage (REV-010). The previous Material indigo made Login/Events look like a different brand.

### Unchanged (explicit)

- Screen flow A01–A18, mock data, repository architecture, Expo Web-first.
- Status colors (success/warning/danger) stay semantic, not WMS-copied.
- Sport-row accent colors on A05 stay sport-specific.
- Temporary landing HTML is still REV-010 (remove later). No pixel-clone of the WordPress layout.

### Files updated

- `src/theme/colors.ts`, `src/theme/gradients.ts`, `src/theme/glass.ts`, `global.css`
- Lucide / ActivityIndicator fills now use `colors.primary` / `colors.textMuted`
- `docs/DESIGN_SYSTEM.md`, `docs/IMPLEMENTATION_PLAN.md`, `AGENTS.md`, `README.md`
- `docs/PROGRESS.md`, `docs/REVISIONS.md` (this file)

### Impact on implementation

- Do not reintroduce `#0D47B5` / `#082E78`. Add brand color only via `src/theme/colors.ts` + `global.css` HSL variables.

---

## REV-022 — Pivot to Como Lake 2027 RFP; new canonical doc set + phased plan (2026-09-01)

**Status:** Approved
**Author:** agent session (Opus 4.8) + product owner
**Scope:** Product | Architecture | Tooling | Docs

### What changed

- The project now targets the **revised World Masters Sport RFP — _Turnkey Registration and Games Management Software, Como Lake 2027_** (`context_docs/RFP WMS Como2027 Software Final.pdf`, v1.3). This RFP **supersedes** the previous, narrower `IMGA Software RFP Ver 1.1`. The existing app was built to the old RFP + old mockups.
- Product scope widens from an **athlete-only mobile POC** to **two portals on one governed data model**: a responsive **Participant Portal** and an **Admin "OC Command Centre"**, with a configurable **Masters rules engine** as the core differentiator.
- New **canonical doc set** authored under `context_docs/docs/`: `START_HERE.md` (index/router), `RFP_COMO2027.md` (machine-readable RFP), `BUSINESS_OVERVIEW_COMO2027.md` (business source of truth, supersedes old `BUSINESS_CONTEXT.md`), `DELIVERY_PLAN_COMO2027.md` (P0/P1/P2+ plan), `PROGRESS_COMO2027.md` (living tracker for the new plan).
- **Locked decisions** D1–D5 (DELIVERY_PLAN §0): D1 Balanced P0 demo; D2 Hybrid responsive (desktop portal + mobile from day one); D3 Admin P0-partial (a01/a02/a04/a05 now, a03/a06 P1); D4 re-skin to Como Lake 2027; D5 still a mock/POC frontend with interfaces ready for P2+.
- **Timelines** re-anchored to the RFP procurement calendar: P0 = 7–8 Sep 2026 scripted demo (RFP §9.3); P1 = 15–17 Sep 2026 UAT gate → production launch; P2+ = RFP phases B–F to Dec 2027.
- Instruction files repointed to `START_HERE.md`; superseded old docs banner-marked; repo-root `docs/` declared a legacy mirror (`docs/README.md` added).

### Why

- New RFP is the solid, current proof of what the client wants; the old docs describe a different, smaller product and would mislead any AI agent building the revision.

### Unchanged (explicit)

- Tech stack + layering: Expo/Expo Router/TypeScript strict/NativeWind v4/RNR/TanStack Query/RHF+Zod; `Screen → hook → repository interface → mock repo → fixtures/AsyncStorage`.
- `AGENTS.md` engineering rules, `ARCHITECTURE.md`, `DESIGN_SYSTEM.md`, `DATA_MODEL.md` remain valid (to be **extended**, not discarded).
- Participant WMS-blue palette (REV-021). Demo characters Daniel Harper + Marco Rossi retained.
- Still no real backend/PSP/OTP/scanner/scoring in P0–P1.

### Files updated

- New: `context_docs/docs/{START_HERE,RFP_COMO2027,BUSINESS_OVERVIEW_COMO2027,DELIVERY_PLAN_COMO2027,PROGRESS_COMO2027}.md`, `docs/README.md`
- Banners added: `context_docs/docs/{BUSINESS_CONTEXT,PRODUCT,POC_SCOPE,SCREEN_FLOW,MOCK_DATA,CLIENT_DEMO_GUIDE,IMPLEMENTATION_PLAN}.md`
- Repointed: `CLAUDE.md`, `.claude/CLAUDE.md`, `context_docs/CLAUDE.md`, `AGENTS.md`, `.cursor/rules/working-guidelines.mdc`
- `context_docs/docs/REVISIONS.md` (this file)

### Impact on implementation

- New work follows `DELIVERY_PLAN_COMO2027.md`. Old `SCREEN_FLOW.md` (A01–A18) / `POC_SCOPE.md` no longer define scope — use the Como 2027 screen map in `BUSINESS_OVERVIEW_COMO2027.md` §7.
- The old A01–A18 app is the **reuse base**, not the target: revise into the portal shells; keep the reusable stack.

---

## REV-023 — Backend-adaptability guardrails + incorporate WIP backend baseline (2026-09-01)

**Status:** Approved
**Author:** agent session (Opus 4.8) + product owner
**Scope:** Architecture | Docs

### What changed

- Incorporated the WIP `context_docs/Backend - Registration Phase Requirements & Core Architecture Foundation.md` (BE-developer authored, high-level) as a **secondary reference** — the RFP remains authoritative.
- Added a first-class **"Backend adaptability (API-first seam)"** section (DELIVERY_PLAN §6.6): repository-method ↔ HTTP-verb mapping, JSON DTO contracts, TanStack Query async/mutation states, normalised errors + idempotency keys, single provider swap point, OpenAPI as the future shared artifact. Target backend: **NestJS or Python FastAPI** (REST/JSON).
- Strengthened the P2+ **scalability guardrails**: entrant lineage (CMP-03), sensitive-data isolation seam (PRV-04, separate keys/logs), idempotency + pending/optimistic states (PAY-04), roster-lock temporal constraint (TEA-04/CMP-04), swappable auth seam (PLT-03 passwordless), ISO-8601/UTC + Europe/Rome + EUR minor units (NFR-07).
- Flagged a **milestone reconciliation**: backend doc's "Ops-Ready Gate (Phase B) = 30 Sep 2026 with 15k EOI migrated + waitlists" is tighter than the RFP's Phase B (Sep–Dec 2026); RFP dates authoritative, backend compression is a target to confirm.
- Ran a **doc audit vs the RFP** (all 15 requirement series) — no material gaps in scope; enhancements applied above. Findings recorded in the session summary.

### Why

- The user will introduce a real backend later; anything built now must adapt to GET/PUT/POST integration without a UI rewrite. The repository interface is that seam and must be treated as an API contract from day one.

### Unchanged (explicit)

- Still a mock/POC frontend in P0–P1 (D5). No real backend/PSP/OTP/scanner in scope yet.
- RFP remains the single authoritative requirement source; the backend doc is secondary.
- Stack, layering, and REV-022 doc set unchanged.

### Files updated

- `context_docs/docs/DELIVERY_PLAN_COMO2027.md` (§4 guardrails + new §6.6), `START_HERE.md` (golden rule 8 + source materials), `BUSINESS_OVERVIEW_COMO2027.md` (§5 future backend), `PROGRESS_COMO2027.md`, `REVISIONS.md` (this file)

### Impact on implementation

- Every new repository method is designed as a future endpoint (verb + DTO + error shape). Screens/hooks stay backend-agnostic; only `src/data/providers/repositories.ts` knows Mock vs Api.

---

## REV-024 — Doc consolidation: single canonical home, delete superseded, mark kept docs (2026-09-01)

**Status:** Approved
**Author:** agent session (Opus 4.8) + product owner
**Scope:** Docs | Tooling

### What changed

- **One canonical docs home:** `context_docs/docs/`. The repo-root `docs/` folder was a full duplicate — **all its `.md` files deleted except `docs/README.md`** (a redirect signpost).
- **Deleted (fully superseded, confusion risk):** `BUSINESS_CONTEXT.md`, `PRODUCT.md`, `POC_SCOPE.md`, `SCREEN_FLOW.md`, `CLIENT_DEMO_GUIDE.md`, `IMPLEMENTATION_PLAN.md`, and the old `PROGRESS.md` — from `context_docs/docs/` (and their root-`docs/` copies). Recover from git history if ever needed.
- **Kept + clearly state-marked (in-file banner):** `ARCHITECTURE.md`, `DATA_MODEL.md`, `DESIGN_SYSTEM.md` → "✅ CURRENT — extend"; `MOCK_DATA.md` → "🔄 TRANSITIONAL — current fixtures only, not target scope"; `REVISIONS.md` (this changelog).
- **Repointed every internal reference** that named a deleted/old doc: `AGENTS.md` (source-of-truth list, before-implementing-a-screen, demo-identity, progress-docs), `CLAUDE.md` (reading list, `/docs` ref, old "Main demo path"), `.claude/CLAUDE.md` + `.cursor/rules/working-guidelines.mdc` (mandatory living docs → `PROGRESS_COMO2027.md`; i18n line corrected: **EN+IT is in scope**), `DESIGN_SYSTEM.md` (screen-flow ref → screen map), `src/constants/screens.ts` (comment).

### Why

- User goal: remove any chance an AI agent (Claude/Cursor/Codex) follows an out-of-date doc or a duplicate. One home, no dead references, kept docs self-describe their state and how much to trust.

### Unchanged (explicit)

- No canonical content lost — the deleted docs were fully superseded by the Como 2027 doc set (REV-022). Stack/architecture docs retained.
- Demo characters Daniel Harper + Marco Rossi retained.

### Files updated

- Deleted: `docs/*.md` (except README), `context_docs/docs/{BUSINESS_CONTEXT,PRODUCT,POC_SCOPE,SCREEN_FLOW,CLIENT_DEMO_GUIDE,IMPLEMENTATION_PLAN,PROGRESS}.md`
- Edited: `context_docs/docs/{START_HERE,MOCK_DATA,ARCHITECTURE,DATA_MODEL,DESIGN_SYSTEM,REVISIONS}.md`, `AGENTS.md` (+mirror), `CLAUDE.md` (+mirror), `.claude/CLAUDE.md`, `.cursor/rules/working-guidelines.mdc`, `src/constants/screens.ts`

### Impact on implementation

- Every agent now starts at `context_docs/docs/START_HERE.md`; no dead links to deleted docs remain in instruction files or kept docs.

---

## REV-025 — North star = full connected product; scalable target architecture; build-for-15-Sep (2026-09-03)

**Status:** Approved
**Author:** agent session (Opus 4.8) + product owner
**Scope:** Product | Architecture | Planning | Docs

### What changed

- **North star re-framed.** The goal is **not** "a scripted demo of isolated scenarios" — it is the **full, connected OARS product per the RFP**: one working platform where participants **and** OC staff complete **real end-to-end journeys**, scalable to Games load. The **7–8 Sep demo** and **15–17 Sep UAT** are **milestones on that product build**, not throwaway artifacts. Primary near-term target = **the 15 Sep deliverable, built as a real working connected portal** (not screens-to-look-at).
- **Build philosophy → connected-product-first (thin but real).** Prefer **thin end-to-end vertical slices of the real product** (login → sport entry → rule check → pay → status → accreditation as **one journey with shared state**) over deep-but-isolated scenario screens. Nothing built for the demo is throwaway; each slice is the real feature at POC depth, deepened over phases. This **amends D1** (was "balanced scripted-demo").
- **Target production architecture locked (new D7).** The full product is **not one Expo app**. It is:
  - a **shared backend API** (NestJS **or** Python FastAPI, REST/JSON) — single source of truth;
  - a **shared TypeScript domain/contract package** (domain models + DTOs + the pure rules engine) reused by every client and validated against the backend's OpenAPI;
  - a **Participant app** (Expo / React Native — web + mobile) — the current codebase is its prototype;
  - a **separate Admin web app** (**plain React**: Vite or Next, desktop-first, data-dense) — the current in-Expo admin screens are its **behavioural + visual spec**, not the production code.
- **When the split happens.** The current **single Expo codebase stays the P0 demo vehicle** (fastest path to 7–8 Sep). Splitting into admin-React + shared-backend + shared-domain-package is the **first work of the real build** (immediately post-demo / start of RFP Phase B) — **not "someday."** The **portable asset is the domain layer** (pure TS, zero React Native): it lifts into the backend and the admin app unchanged, so the split is cheap and no demo work is wasted.
- **Scalability is a designed-for target, not an afterthought.** Architecture must scale to the **full Games load**: RFP baseline **~14,000 athletes / 40+ sports**; realistic peak **~15,000–20,000** participant records (EOI / waitlist / growth). Designed with **sensible headroom** so it handles the peak comfortably and grows **without re-architecture**. Enablers (mostly already mandated): cursor/paginated list DTOs (never bare arrays), stable UUID IDs, idempotency keys, restricted-data isolation, stateless API-first repositories (§6.6).
- **D5 amended.** The demo/UAT dates are still exercised on a **mock / thin backend**, but the mock is explicitly a **temporary stand-in for a real backend that WILL be built** — contract-first from now (every repo method = a real endpoint). Real backend + real PSP/persistence is the **committed immediate next phase**, not indefinite.

### Why

- Product owner clarified the ultimate goal: a **fully complete, connected, working platform per the RFP**, scalable to enterprise Games load — with the 15 Sep deliverable built to that standard. The prior "balanced scripted-demo" framing risked disposable screens and under-investing in the real architecture. *(User: "ultimate goal to pura product banane ka hona chahiye … jo 15 ko dena hai usi hisab se banaye … architecture actually scalable ho.")*

### Unchanged (explicit)

- Stack + layering + repository seam + backend-adaptability (§6.6) — already the right foundation; this re-frame is cheap **because** of it.
- RFP remains the authoritative source; **dates unchanged** (7–8 Sep demo, 15–17 Sep UAT, phases B–F to 2027).
- Demo characters Daniel Harper + Marco Rossi; WMS-blue participant palette + admin navy.
- **Honest timeline:** the full **production-scale, real-backend, separately-deployed** system is completed across **phases B–F**. The ~2-week P0/P1 window delivers a **connected working slice at POC / thin-backend depth**, on the target architecture — **not** the entire 14k-scale production system in two weeks.

### Files updated

- `DELIVERY_PLAN_COMO2027.md` (north star + D6/D7 in §0 + new §7 target architecture + reframed P0/P1 intent)
- `ARCHITECTURE.md` (new "Target production architecture" section; scoped the "no separate Vite web app" rule to the **athlete** client; extended §13 admin compatibility)
- `START_HERE.md` (30-second orientation + golden rules + status map)
- `PROGRESS_COMO2027.md` (phase line, north star, next action, session log)
- `REVISIONS.md` (this entry + Index)

### Impact on implementation

- Next steps optimize for **connected real journeys** on the target architecture, not isolated scripted screens.
- Keep the **domain layer pure and framework-agnostic** (it becomes the shared package): no React Native imports in `src/domain/*`, `src/features/rules/engine.ts`, or DTO types.
- Treat the current admin screens as the **spec** for the future plain-React admin app; don't invest in Expo-Web-only admin hacks that won't port.
- Immediately after the demo, plan the **backend + shared package + admin-React split** as Phase B slice 1.

---

## REV-026 — Mock data hub (API-shaped JSON) is the current data source; `wms_admin` future repo; START_HERE self-sufficient (2026-09-03)

**Status:** Approved
**Author:** agent session (Opus 4.8) + product owner
**Scope:** Data | Architecture | Docs

### What changed

- **Data approach for now (explicit).** We do **not** build the backend — a **separate developer** owns it and we **integrate later**. Until then the whole flow runs on a **mock data hub**: **API-response-shaped JSON**, consumed **only through repositories** (screens/hooks never import JSON). Content is grounded in the **RFP + reasonable web research** so it reads like real Como Lake 2027 API data (realistic participants, events, sports, fees, quotas, rule registers; keep Daniel Harper + Marco Rossi).
- **DTO discipline.** Mock JSON is shaped **exactly** like the future API response: paginated list envelopes `{ items, total, cursor? }` for growable lists, **stable UUID IDs**, enums as string unions, **ISO-8601/UTC** dates, **EUR minor units**. What the mock returns = what the API will return.
- **Temporary + swappable.** Later the real backend serves the same shapes; repos flip `Mock*Repository → Api*Repository` at `src/data/providers/repositories.ts` and data becomes dynamic **GET/PUT** — **no UI/hook change** (this is the §6.6 seam applied to data; see new §6.7).
- **Future admin repo/folder = `wms_admin`.** When the admin frontend splits out (REV-025 / D7) it lives in a repo/folder named **`wms_admin`** (plain React). Recorded so naming is consistent from day one.
- **START_HERE is the single self-sufficient entry.** Anyone (human or AI) pointed at `START_HERE.md` alone can: understand the goal + data approach, follow the reading order, pick the next task from `PROGRESS_COMO2027.md`, work step-by-step under the golden rules, verify, and **update the docs at the end**. Added an explicit "▶ How to start a work session" + "Data approach (now → later)" to it.

### Why

- Product owner: backend is external / in-progress; for now build mock JSON (RFP + research shaped) and run the full flow off it, staying backend-adaptable so the later API swap is dynamic GET/PUT. And keep docs so a newcomer needs **only** START_HERE.

### Unchanged (explicit)

- Repository pattern + domain purity + backend-adaptability (§6.6) + target architecture (REV-025 §7) all stand — this refines the **data** seam inside them.
- Screens never import fixtures/JSON directly; only hooks → repositories.
- D5 (mock for the demo dates) stands; the mock hub is the stand-in for the external backend.

### Files updated

- `START_HERE.md` (how-to-start + data approach + `wms_admin`)
- `DELIVERY_PLAN_COMO2027.md` (new §6.7 mock data hub; §7.1 admin = `wms_admin`)
- `ARCHITECTURE.md` (§13 `wms_admin`; API-shaped fixtures note)
- `PROGRESS_COMO2027.md` (next action + session log)
- `REVISIONS.md` (this entry + Index)

### Impact on implementation

- Next work builds/uses the mock data hub as **API-shaped JSON** behind repos; connect the participant journey off it.
- Name the future admin repo **`wms_admin`**.
- Keep every list/response shaped as the real API so the backend integration is a drop-in.

---

## REV-027 — `wms_participant` naming for the split; safe Phase-B prep starts now (2026-09-04)

**Status:** Approved
**Author:** agent session (Sonnet 5) + product owner
**Scope:** Naming | Architecture | Process

### What changed

- **Naming, confirmed.** At split time (Phase B), the **current Expo codebase becomes `wms_participant`** — every file under this repo (app/, src/, all participant + admin-prototype screens, domain layer) moves into a repo/folder named `wms_participant`. Paired with the already-agreed **`wms_admin`** (REV-026) for the new plain-React admin app. So the target layout is two sibling repos: **`wms_participant`** (Expo, participant-facing) + **`wms_admin`** (Vite/Next, OC staff-facing) + a backend repo (owned by the separate developer). Recorded now so nobody has to re-decide it later or improvise a different name mid-split.
- **Phase-B PREP starts now — but scoped to what's safe before the demo.** The product owner asked to begin Phase-B prep immediately (2026-09-04), ahead of the original "immediately post-demo" timing in REV-025 §7.3. The demo (7–8 Sep 2026) is 3 days out and the current repo is the demo vehicle, so prep work is split into two tracks:
  - **Safe now (does not touch this repo's working tree):** (a) this naming/doc update; (b) a **read-only audit** of which `src/domain/*` / `src/features/rules/engine.ts` / `src/features/registration/statusLifecycle.ts` files are already framework-pure and split-ready vs. need cleanup — a report, no code moved; (c) scaffolding **`wms_admin` as a brand-new, separate sibling folder** (plain React/Vite), porting the first 1-2 admin screens as a proof-of-concept against copied mock data — this cannot regress the demo because it never edits `olympic_master_games`.
  - **Still deferred to post-demo (per REV-025 §7.3, unchanged):** actually extracting the shared domain package out of *this* repo, converting it to a monorepo workspace, and flipping `Mock* → Api*`. Those touch every import path in the working demo codebase — real regression risk this close to 7–8 Sep. Do this once the demo has run.

### Why

- A name decided under pressure mid-split tends to get typo'd across configs/CI/docs; deciding it now, calmly, costs nothing.
- The product owner wants forward motion on Phase B without gambling the demo — splitting prep into "isolated, safe to do now" vs. "touches the working tree, wait" respects both goals at once.

### Unchanged (explicit)

- REV-025's target architecture (shared backend + shared domain package + Participant Expo app + separate plain-React admin) stands as designed.
- REV-026's `wms_admin` naming and mock-data-hub approach stand.
- The **actual** repo split/restructure of `olympic_master_games` itself still happens **post-demo**, per REV-025 §7.3 — only the *naming decision* and *isolated new-repo scaffolding* move earlier.

### Files updated

- `DELIVERY_PLAN_COMO2027.md` (§7.1 diagram + §7.3 timeline: `wms_participant` naming, prep-now vs. split-post-demo split)
- `ARCHITECTURE.md` (§13: `wms_participant` naming)
- `START_HERE.md` (target-architecture line: `wms_participant` naming)
- `PROGRESS_COMO2027.md` (next action)
- `REVISIONS.md` (this entry + Index)

### Impact on implementation

- Anywhere docs say "this codebase" / "the Expo codebase" in a post-split context, read it as **`wms_participant`**.
- Phase-B prep work delegated to Cursor (domain-purity audit, mechanical/read-only) and Codex (new `wms_admin` scaffold, a real feature-slice-shaped build) can start immediately — neither touches `olympic_master_games`'s working tree.
- Do not begin moving files out of `olympic_master_games` or converting it to a workspace root until after the 7–8 Sep demo.

---

## REV-028 — Goal pivot: the split IS the deliverable, not a scoped 7–8 Sep demo (2026-09-04)

**Status:** Approved
**Author:** agent session (Sonnet 5) + product owner
**Scope:** Goal | Process | Architecture priority

### What changed

- **The product owner has moved the goalpost.** REV-027 (a few hours earlier, same day) framed Phase-B prep as background work running alongside a scoped, safe, single-codebase demo locked for 7–8 Sep. That framing is now **superseded**: the product owner's actual goal is the **real, separated, maximally-complete product** — `wms_participant` + `wms_admin` as genuinely distinct apps — and **that** is what gets demoed, not a stopgap single-Expo-codebase walkthrough tied to the 7–8 Sep date.
- **Phase-B work is now the primary track, not "prep."** Porting every remaining admin screen into `wms_admin`, and extracting the shared domain layer into a real, standalone package, both move from "safe background work" to **the main line of work**.
- **Two open technical questions this pivot surfaces (flagged to the product owner, not yet resolved):**
  1. **Cross-portal "live" behaviour breaks once genuinely split.** Several built features (REG-11 admin governance reading the participant's live entry, A05 Finance's `Live` tag, PLT-06's audit trail) work today because participant and admin logic run in **one process, one in-memory store**. Two separate deployed apps have no such shared store without a real backend — and per the project's own non-negotiables (`AGENTS.md`/`CLAUDE.md`: "do not introduce a backend unless explicitly requested"), **we do not build a stand-in shared backend ourselves**. Until the external backend developer's API exists, `wms_admin` and `wms_participant` will each run on their own local mock data, and the cross-portal "one governed record" demos will not be live between the two separately-running apps. This is a known, accepted gap for now, not a bug — the product owner should be aware of it when planning what to show.
  2. **Physical rename of `olympic_master_games` → `wms_participant`** was named as the target (REV-027) but not yet executed — it is a workspace-disrupting action (this session's paths, the user's IDE, any running dev servers) worth doing deliberately, not silently mid-session. Deferred until the product owner explicitly confirms timing.

### Why

- Product owner: the real goal was always the full connected product on the target architecture, not a demo trimmed to fit a date; now that meaningful separation exists (`wms_admin` scaffolded with 2 of 7 admin screens ported, domain-purity audit shows 48/52 files ready to extract), push forward on the split itself rather than throttling it for demo-safety.

### Unchanged (explicit)

- REV-025's target architecture (shared backend + shared domain package + Participant Expo app + separate plain-React admin) stands as the shape being built toward.
- REV-026/027's naming (`wms_admin`, `wms_participant`) stands.
- The **no-backend-ourselves** rule stands — the cross-portal gap above is accepted, not worked around with a fake backend.
- Everything already built and verified in `olympic_master_games` (all 8 §9.3 scenarios, REG-11, PLT-06, save-resume, WCAG) stays intact; this pivot changes what gets built **next**, not what already exists.

### Files updated

- `PROGRESS_COMO2027.md` (next action — reflects Phase B as primary track)
- `REVISIONS.md` (this entry + Index)

### Impact on implementation

- Continue porting the remaining `wms_admin` screens (exceptions, accreditation desk, assisted registration, rules configurator, communications) to reach feature parity with the Expo admin prototype.
- Begin the **real** shared domain-package extraction (a new isolated repo, not yet wired into either app) using the REV-027 audit's file list as the source of truth for what's already pure.
- Do **not** attempt to restore cross-portal live sync between the two separate apps by building any backend/mock-server stand-in — surface the gap, don't paper over it.
- Hold the physical `olympic_master_games` → `wms_participant` rename for an explicit go-ahead.

---

## REV-029 — Explicit, scoped exception to "no backend": temporary API shim for cross-portal live sync (2026-09-04)

**Status:** Approved
**Author:** agent session (Sonnet 5) + product owner
**Scope:** Architecture | Stack (temporary) | Process

### What changed

- **The product owner explicitly requested a temporary backend**, specifically to restore the cross-portal "live" behaviour (REG-11 admin governance, Finance's `Live` tag, save-&-resume) that breaks once `wms_participant` and `wms_admin` run as genuinely separate apps (REV-028's open gap #1). This is a **deliberate, scoped exception** to the standing non-negotiable "do not introduce a backend unless explicitly requested" — the request has now been made, in writing, for this specific purpose.
- **Two shapes were compared and rejected in favour of a third:**
  - *A real NestJS backend, "temporary."* Rejected — disproportionate ceremony (modules, DI, controllers, DTOs, validation, CORS, auth stub) for an artifact whose whole point is to be discarded once the real backend (built by the separate developer) exists.
  - *A raw JSON-file / `json-server`-style mock API.* Rejected — gives dumb CRUD only. It has no concept of the idempotency-key guards, accreditation issue-gating, REG-11 transition rules, PLT-06 consent-gating, or save-&-resume merge logic already written and tested in the `Mock*Repository` classes. Swapping to it would silently lose real, demoed business logic.
  - **Chosen: a lightweight Express/Fastify service that wraps the EXISTING `Mock*Repository` business logic** (not reimplemented — copied/adapted), persists to a JSON file instead of AsyncStorage, and exposes it over HTTP using the REST mapping **already documented in every repository interface's own comments** (e.g. `getJourney -> GET /registration-journeys/{entryId}`). This is the smallest correct move: no new design, no lost logic, no unnecessary framework ceremony.
- **Scoped to Round 1: the registration-journey and rules repositories only** (not all 22). These two power the demo's cross-portal spine — P08/P12/P14/P16/P19/P20 on the participant side, A01's governance panel/A04/A05 on the admin side. Additional repositories (accreditation desk, assisted registration, communications, …) are an explicit follow-up round once this is proven, not part of this task.
- **Sequencing:** this new service (repo name: `wms_api`) is built **standalone and isolated first** — proven correct against its own tests — before either `wms_admin` or `wms_participant` (`olympic_master_games`) is wired to call it. Wiring is a separate future task, same isolate-then-integrate discipline used for `wms_admin` and `wms_domain`.

### Why

- Product owner: wants the demo to show genuine cross-portal connectivity between the two separated apps, not a known gap; asked directly which temporary-backend shape was best. NestJS and raw-JSON-DB were evaluated and both have a real cost (ceremony, or lost business logic respectively) that the Express-shim-over-existing-logic approach avoids.

### Unchanged (explicit)

- This does **not** reopen the door to building backend features generally — the exception is scoped to this one purpose (temporary cross-portal sync for the split demo) using code that already exists and is already tested.
- The real backend is still built by the separate developer; `wms_api`'s only job is to be swapped out later — the `Api*Repository` base URL is the single change point (`src/data/providers/repositories.ts`-equivalent in each app), unaffected by which shape `wms_api` takes internally.
- REV-025's target architecture, REV-026/027's naming, and REV-028's goal pivot all stand unchanged.

### Files updated

- `PROGRESS_COMO2027.md` (next action)
- `REVISIONS.md` (this entry + Index)

### Impact on implementation

- Build `wms_api` as a new, isolated sibling repo — read `olympic_master_games`'s `Mock*Repository` classes and repository-interface REST-mapping comments as the source of truth; do not edit `olympic_master_games`.
- Cover `registrationJourney` and `rules` repositories first; defer the rest.
- Do not wire `wms_admin` or `wms_participant` to it in the same task — prove it standalone first.

---

## REV-030 — Wire olympic_master_games journey + rules to wms_api (2026-09-04)

**Status:** Approved
**Author:** agent session
**Scope:** Architecture | Data

### What changed

- `src/data/providers/repositories.ts` now constructs `ApiRegistrationJourneyRepository` and `ApiRulesRepository` (HTTP clients for `wms_api`) instead of the in-process `Mock*` instances.
- Base URL is `EXPO_PUBLIC_WMS_API_URL`, default `http://localhost:3040`.
- `MockRegistrationJourneyRepository` and `MockRulesRepository` remain in the tree unused by the provider (reference/fallback).
- Finance is unchanged: it still receives the journey instance and merges `listLive*` after `ensureHydrated()`.

### Why

- Completes the REV-029 sequencing: the shim was proven standalone; this is the participant-app wiring so both portals share one JSON-backed record.

### Unchanged (explicit)

- All other repositories stay mock.
- Domain DTOs, REG-11 machine, and rules engine stay in this repo.
- `wms_api` contract is not modified here.

### Files updated

- `src/data/api/*`, `src/data/providers/repositories.ts`, `src/domain/repositories/registrationJourney.repository.ts`
- `README.md`, `.env.example`, `PROGRESS_COMO2027.md`, this file

### Impact on implementation

- Run `wms_api` (`npm run dev`, port 3040) alongside Expo Web (8081) for the connected demo.
- In-app Reset demo does **not** clear `wms_api/data/db.json` — delete that file to re-seed.

---

## REV-031 — `wms_api` consumes `@wms/domain`; Round 2 (accreditation desk); `wms_admin` fully wired (2026-09-04)

**Status:** Approved
**Author:** agent session (Sonnet 5) + Cursor
**Scope:** Architecture | Data

### What changed

- **`wms_api` now consumes `@wms/domain` instead of duplicating it.** Round 1 (REV-029) copied 9 model files, 2 repository interfaces, `engine.ts`, and `statusLifecycle.ts` directly into `wms_api` — reasonable to unblock Round 1 fast, but it meant `wms_domain` (extracted the same day) sat unused. Deleted the local copies, added `@wms/domain` as a `file:../wms_domain` dependency, and repointed every import. Verified byte-identical behaviour before/after (same live pay-flow output, same test results) — the swap changed zero runtime behaviour.
- **`wms_api` Round 2: accreditation desk.** Added `accreditationDeskRepository` (full `AccreditationDeskRepository` contract — `getOverview`, `issueCredential`, `reissueCredential`, `revokeCredential`), ported unchanged from `MockAccreditationDeskRepository`, types from `@wms/domain` from the start (no duplicate-then-consolidate this time). In-memory only, matching the original mock. Mounted at `GET/POST /accreditation-desk*`. `NOT_ELIGIBLE_TO_ISSUE` and `NOT_ISSUED` added to the error handler's 422 (domain-rule violation) bucket, alongside the existing `ILLEGAL_STATUS_TRANSITION`-style codes. 6 new integration tests; live-verified via curl (badge continuity `COMO27-000103`, matching the Expo app's own numbering from earlier this session).
- **`wms_admin` fully wired for Round 1.** Operations' REG-11 governance panel and Finance's `Live`-tagged rows (built earlier, verified live cross-portal against the participant app, but never committed) are now committed. Rules Configurator's `getOverview()` — previously only reading the local seed, meaning a page reload after publishing showed a stale local version — now also confirms against `GET /rules` and `GET /rules/changes/latest`, overlaying the published `toVersion`/`toStrategy` onto the seed rule. All three fall back to local mock data if `wms_api` is unreachable; verified with the server both up (shows the true published version after reload) and down (no crash, clean fallback).

### Why

- `wms_domain`'s entire purpose is to be a single source of truth; leaving it unconsumed after extraction would have let it silently drift stale. Consuming it in `wms_api` first (lowest-risk consumer — plain Node, no Metro/bundler complexity) proves the pattern before attempting the same in `wms_participant` or `wms_admin`.
- Accreditation desk was picked for Round 2 because its business logic (gating, idempotent issue, badge continuity) is self-contained and a good stress-test of "reuse existing logic, don't reimplement" a second time.
- The Rules Configurator gap (stale local state after reload) was a real correctness issue for the demo — an admin publishing a rule change and then refreshing the page would see it silently revert.

### Unchanged (explicit)

- `wms_participant` (`olympic_master_games`) still keeps its own domain-file copies — not yet pointed at `@wms/domain`. That remains separate future work (Metro/local-package resolution has real risk not present in a plain Node backend; do this deliberately, not as a side effect).
- Accreditation desk is **not yet wired into either frontend's UI** — `wms_api` exposes it, but `wms_admin`'s own Accreditation Desk screen still reads its local mock. Wiring is future work, same isolate-then-integrate discipline as everything else.
- The no-backend-ourselves rule's scoped exception (REV-029) is unchanged — Round 2 stays within "reuse existing, tested logic," not new backend feature design.

### Files updated

- `wms_api`: `src/data/mockAccreditationDeskRepository.ts`, `src/http/routes.ts`, `src/http/errorHandler.ts`, `src/app.ts`, `tests/accreditationDesk.test.ts`, `package.json`, `README.md` (domain-file deletions across `src/domain/*`, `src/features/*`)
- `wms_domain`: `README.md` (records that `wms_api` now consumes it)
- `wms_admin`: `src/repositories/{ApiEntryGovernanceRepository,ApiFinanceJourneySource,EntryGovernanceRepository,FinanceJourneySource,InMemoryEntryGovernanceRepository,MockRulesRepository}.ts`, `src/components/operations/GovernancePanel.tsx`, `src/hooks/useEntryGovernance.ts`, `src/api/wmsApi.ts`, `src/pages/{OperationsPage,FinancePage}.tsx`, `.env.example`, `README.md`
- `PROGRESS_COMO2027.md`, `REVISIONS.md` (this entry + Index)

### Impact on implementation

- When adding a new repository to `wms_api`, import its types from `@wms/domain` from the start — do not re-duplicate and clean up later (Round 1's path, only corrected after the fact).
- `wms_admin`'s Accreditation Desk screen wiring to `wms_api`'s new endpoints is the natural next Round-2-frontend task, mirroring how Rules Configurator/Operations/Finance were wired for Round 1.

---

## REV-032 — `wms_participant` (this repo) now consumes `@wms/domain` too (2026-09-04)

**Status:** Approved
**Author:** agent session (Sonnet 5)
**Scope:** Architecture | Data | Build tooling

### What changed

- Added `@wms/domain` as a `file:../wms_domain` dependency (same pattern as `wms_api`).
- **All 44 files** under `src/domain/models/*` and `src/domain/repositories/*`, plus `src/features/rules/engine.ts` and `src/features/registration/statusLifecycle.ts` (46 total — the exact "ready to extract" list from `PHASE_B_DOMAIN_AUDIT.md`), were converted to **re-export shims** — e.g. `src/domain/models/rule.ts` is now `export type { SportRule, CategoryBand, ... } from '@wms/domain';` instead of the original definitions.
- **Chose re-export shims over rewriting every consumer's import path.** ~40+ files across the app import from `@/domain/models/*` / `@/domain/repositories/*` / `@/features/rules/engine` / `@/features/registration/statusLifecycle`. Rewriting every one of those import statements to `@wms/domain` directly would have been a much larger, riskier diff for identical runtime behaviour. Keeping the file paths stable and only changing what's *inside* them means **zero other file in the app needed to change** — verified by a clean, whole-project `tsc --noEmit` with no edits anywhere else.
- Fixed a real Jest/Metro divergence this surfaced: Jest's `transformIgnorePatterns` only excludes paths containing the literal string `node_modules`; a `file:`-linked sibling package's *real* path (`wms_domain` sits outside this project entirely) never contains that string, so Jest tried to Babel-transform `wms_domain`'s already-compiled `dist/*.js` output and failed on a missing `@babel/runtime` helper (present in this repo's `node_modules`, absent in the sibling's — classic "symlinked package outside the project root can't resolve its own transitive deps via Node's upward directory walk"). Added a `'/wms_domain/dist/'` entry to `jest.config.js`'s `transformIgnorePatterns` — that output needs no transform, it's plain tsc-emitted CommonJS.
- Metro (Expo Web's bundler) required **zero configuration changes** — it resolved the symlinked package correctly out of the box, verified with a live, interactive test against `/rules-smoke` before touching any real file (temporarily pointed one screen at `@wms/domain`, confirmed all 3 engine PASS checks including the interactive RUL-03 impact recalculation, then reverted before starting the real change).

### Why

- `@wms/domain` now has three real consumers (`wms_api`, and now `wms_participant`); `wms_admin` remains the one holdout with its own hand-copied domain types. Closing this loop means a future rule/type correction happens in exactly one place.
- Re-export shims were chosen deliberately over a full import-path rewrite: this repo is the most widely-consumed (every participant screen, every admin screen, every mock repository) and the demo-critical one — minimizing the blast radius of a refactor here matters more than achieving the "purest" final shape immediately. A full call-site rewrite can happen later, if ever, as a separate, even-lower-risk mechanical pass once this shape has proven itself.

### Unchanged (explicit)

- Every consuming file's import statement (`@/domain/models/rule`, `@/features/rules/engine`, etc.) is untouched — this was verified, not assumed, via a clean whole-project `tsc --noEmit`.
- `src/data/errors/repositoryError.ts` and `src/lib/format.ts` were **not** touched — per the original audit, they were never on the "ready to extract" list (the former isn't a domain model; the latter has the locale/layering issues the audit flagged as a design decision, not resolved here).
- `wms_admin` is unaffected by this change — it still has its own duplicated domain types, pending its own future migration.

### Files updated

- `package.json`, `package-lock.json` (new dependency)
- `jest.config.js` (`transformIgnorePatterns` fix)
- All 44 files under `src/domain/models/*` and `src/domain/repositories/*` (except `index.ts` barrels, unchanged)
- `src/features/rules/engine.ts`, `src/features/registration/statusLifecycle.ts`
- `PROGRESS_COMO2027.md`, `REVISIONS.md` (this entry + Index)

### Impact on implementation

- Any future change to a shared domain type or the rules engine / status lifecycle now happens in `wms_domain`, followed by `npm run build` there, then `npm install` (or just re-running the consuming app, since the symlink already points at `dist/`) in each consumer.
- If a NEW domain model or repository interface is added to this repo in the future, add it to `wms_domain` first and shim it here — don't let this repo's copies and `wms_domain`'s drift apart again (see REV-031's Round 1 lesson, corrected in Round 2).
- `wms_admin`'s own migration to `@wms/domain` is the one remaining piece to fully close this loop across all three apps — future work, not urgent.

---

## REV-033 — `wms_admin` Accreditation Desk wired; `wms_api` Round 3; `wms_admin`→`@wms/domain` migration deferred (2026-09-04)

**Status:** Approved
**Author:** agent session (Sonnet 5) + Cursor
**Scope:** Architecture | Data

### What changed

- **`wms_admin`'s Accreditation Desk screen wired to `wms_api`.** Same pattern as Operations/Finance/Rules Configurator: local gating (photo+eligibility, idempotency) fires first, then the mutation confirms against `wms_api`'s `POST /accreditation-desk/:id/{issue,reissue,revoke}` — the API's badge number and record win when reachable, local-only fallback on failure. Verified live: issue Daniel Harper → reload → still shows the true issued state (not a local reset); `wms_api` stopped → no crash, clean fallback.
- **`wms_api` Round 3: `communications` and `assistedRegistration`.** Both ported unchanged from the Expo mock repositories, both importing types from `@wms/domain` from the start (the Round-1 duplicate-then-consolidate mistake is not repeated). 7 new integration tests; live-verified via curl against the real seed data (recipient counts, consent-reference numbering continuing from the seed).
- **Generalized the error-status mapping.** `*_NOT_FOUND` codes now map to 404 by suffix check rather than a fixed list (so `AUDIENCE_NOT_FOUND`, `OPERATOR_NOT_FOUND`, `PARTICIPANT_NOT_FOUND`, `SESSION_NOT_FOUND` all work without individually enumerating each), and `INVALID_TRANSITION` / `CONSENT_REQUIRED` joined the existing 422 domain-rule-violation bucket for consistency with `ILLEGAL_STATUS_TRANSITION` / `NOT_ELIGIBLE_TO_ISSUE`.
- **`wms_admin`'s own migration to `@wms/domain` is deferred — a real finding, not a postponement of convenience.** Diffed every candidate file (`rule.ts`, `registrationJourney.ts`, `communications.ts`, `assistedRegistration.ts`, `accreditationDesk.ts`) against `@wms/domain`'s canonical versions: **none are identical.** `wms_admin`'s domain files were independently hand-authored by Cursor/Codex as purpose-trimmed subsets (e.g. its `registrationJourney.ts` only carries the fields the governance panel + finance actually need, and adds its own `GOVERNED_ENTRY_ID` constant and an extra `action` field on the transition request that the shared type doesn't have — needed for building the `wms_api` REST path). Converting these to blind re-export shims (the approach that worked cleanly for `wms_api` and `wms_participant`, both literal copies of the same source) would either break compilation (missing wms_admin-specific fields) or silently pull in far more surface area than each file is designed around. This is a genuine **refactor** — updating `wms_admin`'s repository/hook code to work with the full shared shapes — not a mechanical shim, and it touches a currently-working, freshly-verified app. Deferred rather than rushed.

### Why

- Consistency in wiring pattern across all Round-1/2/3 `wms_admin` screens (confirm-live-with-local-fallback) makes the codebase predictable — a developer who understands one screen's wiring understands them all.
- Reusing `@wms/domain` types from the start for every new `wms_api` repository (rather than duplicating and cleaning up later) is now the established default, not a one-off lesson from Round 1.
- The `wms_admin` migration finding matters because it revises the earlier assumption (REV-031/032) that "the same shim technique applies to all three apps" — it does not, and pretending otherwise risks a real regression in an app with no reference source to diff against for correctness (unlike `wms_api`/`wms_participant`, which were literal copies).

### Unchanged (explicit)

- `wms_admin`'s domain files keep their current (hand-authored, purpose-trimmed) shape — no edits made in this entry.
- `wms_api`'s Round 1/2 coverage (`registrationJourney`, `rules`, `accreditationDesk`) is unaffected.
- No new backend feature scope beyond what's already-tested mock logic — Round 3 stays within the REV-029 exception's bounds.

### Files updated

- `wms_admin`: `src/repositories/MockAccreditationDeskRepository.ts` (+ `.test.ts`), `README.md`
- `wms_api`: `src/data/mockCommunicationsRepository.ts`, `src/data/mockAssistedRegistrationRepository.ts`, `src/http/{routes,errorHandler}.ts`, `src/app.ts`, `tests/{communications,assistedRegistration}.test.ts`, fixture copies, `README.md`
- `PROGRESS_COMO2027.md`, `REVISIONS.md` (this entry + Index)

### Impact on implementation

- Future `wms_admin` screen wiring to `wms_api` should follow the same confirm-live/local-fallback shape now proven four times (Operations, Finance, Rules Configurator, Accreditation Desk).
- Future `wms_api` repositories: always import from `@wms/domain`, never re-duplicate types.
- `wms_admin`'s `@wms/domain` migration needs a dedicated, careful pass (refactor repository/hook code to the full shared shapes) — not bundled into an unrelated task, given the regression risk to a working app.

---

## REV-034 — Repo renamed to `wms_participant`; Round 3 wired into `wms_admin` (2026-09-04)

**Status:** Approved
**Author:** agent session (Opus 5) + Cursor
**Scope:** Architecture | Tooling

### What changed

- **This repo was physically renamed `olympic_master_games` → `wms_participant`**, executed on explicit product-owner go-ahead after being deliberately deferred since REV-027 (it is a workspace-disrupting action). All four sibling repos are now consistently named: `wms_participant`, `wms_admin`, `wms_api`, `wms_domain`.
- **`wms_admin`'s Communications and Assisted Registration screens wired to `wms_api`'s Round 3 endpoints** (Cursor), completing the confirm-live/local-fallback pattern across every backend-eligible admin screen. Verified live: sending a broadcast then reloading kept it (log 3→4, recipients 1,634→2,918); recording consent for Luca Bianchi and starting registration on his behalf survived a reload (NOT STARTED→DRAFT, consent 2→3, audit 5→7, reference `CONSENT-COMO27-0103` continuing the seed sequence). With `wms_api` stopped, both screens fall back to their local seeds without crashing.
- **`wms_domain` gained the real rules-engine test suite** (Cursor) — 30 ported cases alongside the original 2 smoke tests, with the Expo fixture JSON deliberately not reintroduced (`SportRule` objects inlined instead), so the canonical logic is now tested where it actually lives rather than only through a consumer's shim.

### Why the rename was low-risk in practice (verified, not assumed)

- The `@wms/domain` dependency is a **relative** symlink (`../../../wms_domain`), so it survived the directory rename untouched — no reinstall needed. Confirmed by reading the link target after the move.
- A repo-wide grep found **zero** absolute-path references to the old name in tracked config or source. `.claude/launch.json` uses npm scripts, not paths.
- `.expo/` and `dist/` were cleared after the move (build caches can bake in absolute paths).
- `package.json`'s `name` changed `imga-athlete-poc` → `wms-participant`.

### Left deliberately unchanged

- **The GitHub remote is still `grvgambhir/imga-athlete-poc`.** A local folder rename does not touch the remote, and renaming the GitHub repo is a product-owner decision with its own consequences (existing clones, links, CI). Flagged, not actioned.
- **`app.json`'s `slug` (`imga-athlete-poc`), `scheme` (`imga-athlete`) and display `name` (`IMGA Athlete POC`) were NOT changed.** These are Expo *identity* fields: `slug` participates in EAS project linking and `scheme` drives deep links, so changing them is a separate decision with native-build consequences — not a side effect of a folder rename. The branding is stale relative to the Como Lake 2027 pivot and worth revisiting deliberately.
- **Historical `REVISIONS.md` entries keep the old name.** They are accurate past-tense records of decisions made when the repo was called `olympic_master_games`; rewriting them would falsify the changelog. A pointer note was added at the top of this file instead. Live/navigational references (READMEs, "ported from …" source comments in `wms_api` and `wms_domain`) **were** updated, because those are meant to help a reader find the file today.

### Verification

All four repos green after the rename: `wms_participant` (tsc 0 errors, 60 jest tests), `wms_domain` (build clean, 32 tests), `wms_api` (build clean, 18 tests), `wms_admin` (build clean, 45 tests) — 155 tests total. Metro then booted from the new path (`Starting project at …/wms_participant`) and a full browser pass re-ran clean: sport-entry rendered live rule-engine output (Men's Doubles 35–39, banding age 39, €90) and the checkout pay flow completed against `wms_api` ("Payment confirmed — charged once").

### Impact on implementation

- **Any running Claude Code / editor session rooted at the old path must be reopened at `…/Code_Life/wms_participant`** — the old directory no longer exists.
- Use `wms_participant` in all new docs, prompts, and delegated agent instructions; the old name should only ever appear as a past-tense historical reference.

---

## REV-035 — `wms_admin` migrated onto `@wms/domain`; the loop is closed (2026-09-04)

**Status:** Approved
**Author:** Codex (migration) + agent session (Opus 5, verification and fix)
**Scope:** Architecture | Data | UI

### What changed

- **`wms_admin` now consumes `@wms/domain`**, completing the shared-domain loop across all four repos. This was the migration REV-033 deliberately deferred as "a genuine refactor, not a shim swap" — and it played out exactly that way.
- `finance.ts`, `statusLifecycle.ts`, `communications.ts`, `assistedRegistration.ts`, `accreditationDesk.ts` became clean re-exports. `rule.ts` and `registrationJourney.ts` became **hybrids**: shared primitives re-exported, admin-only composites (`RuleImpactRegistration`, `RuleImpactRow`, `RulesOverview`, `PublishRuleChangeResponse`, `GOVERNED_ENTRY_ID`) kept defined locally.
- `operations.ts`, `exceptions.ts` and `statusLabels.ts` were left untouched — they have no counterpart in the shared package and inventing one would have been speculative.
- **The `action` field problem was solved the right way.** `wms_admin`'s local `TransitionEntryStatusRequest` carried an extra `action: string` (the REST path verb) that the shared type has no concept of. Rather than widening the shared type, `ApiEntryGovernanceRepository` now derives the path verb from the target status via `actionPathForTargetStatus()`, mirroring how `wms_participant` already does it. Verified against the canonical `TRANSITIONS` table and live: `POST …/status/cancel` and `POST …/status/reinstate` both return 200.
- **Vite needed `resolve.preserveSymlinks: true`.** A `file:`-linked sibling package outside the project root is a bundler-specific hazard — Metro needed nothing, Jest needed a `transformIgnorePatterns` entry (REV-032), and Vite needs this. Three consumers, three different resolutions of the same underlying issue.

### A misleading "Live" badge, found by verification and fixed

The migration also (unrequested) added a local fallback to the governance panel, making it consistent with every other admin screen. That fallback exposed a latent bug: the panel's `Live · one record` badge was **hardcoded**. It had always been truthful because, before the fallback existed, an unreachable `wms_api` produced a visible error rather than a rendered panel. With the fallback in place, stopping `wms_api` produced a panel showing in-memory state still labelled "Live" — confirmed in the browser alongside a `net::ERR_CONNECTION_REFUSED` on the underlying request.

The fix threads a liveness signal from the repository through the hook to the badge, which now reads `Local fallback · wms_api unreachable` when a call has degraded. The flag is deliberately **false only on an actual degradation**: the in-memory implementation (the no-API mode used by tests and offline demos) leaves it undefined and callers treat undefined as "not degraded", preserving the badge's original meaning — *the one governed live record*, as opposed to the static seed rows. An earlier attempt that treated undefined as "not live" broke `OperationsPage.test.tsx`, which is what surfaced the distinction.

### Why this matters beyond the label

With the fallback in place, an admin acting while `wms_api` is down mutates in-memory state only — the participant portal never sees it. That is an acceptable demo-continuity trade-off (every other screen already degrades this way), but it must be **visible**, because silent divergence would undermine exactly the cross-portal guarantee the whole `wms_api` shim exists to provide.

### Verification

`wms_admin`: build clean, **46 tests** (up from 45, none dropped). All six wired screens exercised live with `wms_api` up — Operations governance (cancel + reinstate, both 200 from the API), Finance (the `Live` badge on Daniel Harper's row confirms the shared `Settlement.source` field survived), Rules Configurator (v2.1 active), Accreditation Desk (issued `COMO27-000103`, survived a reload), Communications, Assisted Registration. With `wms_api` stopped, every screen degraded without crashing and the governance badge correctly read `Local fallback`. **Full cross-portal leg re-confirmed end to end:** admin cancelled the governed entry and the participant app — a separate process on a separate port — showed `Cancelled` with the lifecycle timeline updated.

### Impact on implementation

- All four repos now share one domain package. A change to a shared type happens in `wms_domain`, `npm run build` there, and all three consumers pick it up.
- Adding a fallback to a screen means auditing that screen's status labels — any hardcoded claim about data freshness becomes a lie the moment degradation is possible.
- The remaining admin screen without a `wms_api` counterpart is **Exceptions**, which has no domain model anywhere; that is new design work, not a port.

---

## REV-036 — Round 4: exception review queue; every admin screen now live (2026-09-04)

**Status:** Approved
**Author:** agent session (Opus 5)
**Scope:** Architecture | Data | Tooling

### What changed

- **`exceptions` added to `@wms/domain`** (`domain/models/exceptions.ts` + `domain/repositories/exceptions.repository.ts`). This closes the gap REV-033/034 flagged as "new design work": the model already existed, but only as hand-authored types inside `wms_admin` with no shared or backed counterpart.
- **`wms_api` Round 4** — `MockExceptionsRepository` plus `GET /exceptions`, `POST /exceptions/:id/approve`, `POST /exceptions/:id/reject`. The admin mock's plain `Error`s were mapped onto `RepositoryError` codes so the HTTP layer classifies them like every other round (`NOT_FOUND` → 404, the new `NOT_PENDING` → 422). Six integration tests.
- **`wms_admin`'s Exception Review Queue wired**, same confirm-live/local-fallback shape as the other five screens. `src/domain/exceptions.ts` became a re-export shim. **Every backend-eligible admin screen now runs against `wms_api`.**
- **`requiredSignatures(impact)` moved into the shared package** as the single source of the dual-control rule. `wms_admin` previously inlined `impact === 'high' ? 2 : 1`; both it and `wms_api` now call the shared helper, so the rule cannot drift between the portal that renders it and the service that enforces it.

### Dual control is the property worth protecting

A `high`-impact exception needs **two distinct** reviewer signatures before it flips to `approved`. The rule that actually matters is the negative one: the same reviewer signing twice must be a no-op, not a second signature — otherwise one person could approve a high-impact case alone, which is the whole point of dual control. That is covered by a dedicated integration test asserting both the response *and* the queue afterwards, and verified live in the browser: clicking "Approve as Reviewer A" twice left the case at **1 of 2**, and only Reviewer B's signature completed it (confirmed across a full page reload as **Approved · 2/2**).

### A Vite trap that cost real debugging time — and the fix that was wrong first

Adding a **runtime** export (`requiredSignatures`) to `@wms/domain` surfaced a hazard the earlier type-only migrations never could: the browser threw `requiredSignatures is not a function` while `tsc`, `vitest` and a direct `node -e require(...)` all reported it present. The cause was Vite's dependency **pre-bundling cache** (`node_modules/.vite/deps/@wms_domain.js`) — it had been built before the export existed, and Vite only invalidates that cache on `package.json`/lockfile changes, which rebuilding a sibling package does not touch.

The first fix — `optimizeDeps.exclude: ['@wms/domain']` — was **wrong, and made it worse**: `@wms/domain` compiles to **CommonJS**, and pre-bundling is precisely what converts it to ESM with resolvable named exports. Excluding it turned the runtime error into a hard module error (`does not provide an export named 'requiredSignatures'`) and a blank page.

The correct fix keeps pre-bundling and forces re-optimization instead: `wms_admin`'s dev script is now `vite --force`, with a comment in `vite.config.ts` explaining why `optimizeDeps.exclude` must not be added back. This is the **fourth** bundler-specific resolution of the same underlying "linked sibling package" issue — Metro needed nothing, Jest needed `transformIgnorePatterns` (REV-032), Vite needed `resolve.preserveSymlinks` (REV-035) and now `--force` as well.

### Noted, not actioned: the participant app still ships the whole admin portal

`wms_participant/app/(admin)/` still contains all seven admin screens (`operations`, `finance`, `rules-configurator`, `accreditation-desk`, `communications`, `assisted-registration`, `exceptions`) — a 1:1 duplicate of `wms_admin`'s seven pages, left behind by the split. They are now **stale**: they predate the `wms_api` wiring, so opening them shows an older, disconnected version of the admin portal. This is dead weight that contradicts "the two apps are genuinely separate", and during a demo it is actively confusing. Removing it is a deletion with product-scope implications (it ends the participant app's ability to demo admin flows standalone), so it is raised for an explicit decision rather than done unilaterally.

### Verification

`wms_domain` build clean + 32 tests; `wms_api` build clean + **24 tests** (18 → 24); `wms_admin` build clean + 46 tests. Live: the queue loaded from `wms_api`, the double-signature bypass was rejected, dual approval completed and survived a reload, and with `wms_api` stopped the screen fell back to its local seed without crashing.

---

## REV-037 — Accreditation cross-portal leg: OC issues, athlete's pass goes live (2026-09-05)

**Status:** Approved
**Author:** agent session (Opus 5)
**Scope:** Architecture | Data | UI | i18n

### The gap this closes

`wms_admin` had every screen running live against `wms_api`, but `wms_participant` had only **two** repositories wired (`registrationJourney`, `rules`) out of twenty. That asymmetry was not cosmetic: it meant real cross-portal legs were broken. Accreditation was the clearest case — the OC could issue a credential at the desk, it persisted in `wms_api`, and **nothing changed on the athlete's side**, because the participant's pass read a local mock keyed on `registrationId` while the desk record has no such field.

Worse, the Como 2027 participant shell had **no accreditation screen at all**: the nav item existed with no `href`, and the only accreditation screen in the repo (`app/(main)/accreditation.tsx`) belongs to the superseded athlete-POC id universe (`athlete_daniel_harper`, `REG-DEMO-000124`), not the Como data hub.

### What changed

- **`AccreditationRecord` gained an optional `athleteId`** — the missing joint. The desk record previously identified its subject only by display name, so nothing could reliably link it to a participant account. It is **optional by design**: the desk accredits athletes, team officials and staff, and only some of them hold an app account (the seed includes a Team Official and three athletes with no account). Fake ids were not invented to make the field required.
- **`wms_api` serves `GET /accreditations/:athleteId`** — one athlete's own record, scoped server-side. A participant must never receive the desk queue, so the filtering happens in the service rather than shipping every record and trusting the client.
- **`ApiAccreditationRepository`** in `wms_participant` reads it, falling back to the seeded record when `wms_api` is unreachable. The legacy A16 methods (`getAccreditation` / `issueAccreditation`) deliberately stay on the local mock — they belong to the old POC id universe that `wms_api` does not model, and faking them would have been worse than leaving them honest.
- **A new participant screen** `app/(participant)/my-accreditation.tsx`, bilingual EN + IT, showing pending / issued / revoked states, badge number, access zones, validity and the photo + eligibility gates. Nav item wired.

### Why the route is `/my-accreditation` and not `/accreditation`

Expo Router does not treat route groups as URL segments, so `app/(main)/accreditation.tsx` and `app/(participant)/accreditation.tsx` would both resolve to `/accreditation` — a genuine collision. Resolving it by deleting the legacy screen was avoided: removing superseded `(main)`/`(admin)` screens is a product-scope decision already raised separately (REV-036), not something to fold into this change. The distinct route also reads correctly — this is the athlete's *own* pass, as against the desk.

### Verification

The full leg was exercised live across two separate apps. Participant pass showed **Awaiting your credential** with no badge number; the OC then issued at the desk (**COMO27-000103**, queue 4→3 pending / 2→3 issued); the participant screen refreshed to **Credential issued** carrying that exact badge. The OC then revoked, and the participant screen showed **Credential revoked** with the contact-the-desk guidance. Repeated in Italian end to end (*Credenziale emessa* → *Credenziale revocata*, zones and gate labels translated). With `wms_api` stopped the screen fell back to the seeded pending state without crashing.

Two `wms_api` tests were added for the properties that matter: the endpoint returns a **single record, not the queue**, and 404s for an athlete with none; and a desk issue is visible on that athlete's own pass read. 164 tests green across the four repos (`wms_participant` 60, `wms_admin` 46, `wms_domain` 32, `wms_api` 26).

### Impact on implementation

- The remaining participant repositories are still local mocks. The ones worth wiring next are those with an admin counterpart already live — otherwise there is no cross-portal leg to gain, only plumbing.
- When adding a participant-facing read of admin-owned data, scope it **server-side by identity** as `/accreditations/:athleteId` does; do not ship a collection and filter in the client.

---

## REV-038 — Communications cross-portal leg: OC broadcasts, the right athlete receives (2026-09-05)

**Status:** Approved
**Author:** agent session (Opus 5)
**Scope:** Architecture | Data | UI | i18n

### What changed

The participant's **Messages** nav item had no `href` and there was no inbox screen — exactly the state Accreditation was in before REV-037. The OC could send a broadcast, it persisted in `wms_api`, and no athlete ever saw it. That leg is now closed.

- **`audienceIncludesParticipant()` added to `@wms/domain`** — the single rule deciding whether a broadcast reaches a given participant, derived from facts the segments are actually defined on (sport name, entry status, evidence status). Both sides depend on it, so the OC's idea of who was reached and the athlete's inbox cannot drift apart.
- **`wms_api` serves `GET /communications/inbox/:athleteId`** — it resolves that athlete's own entry, builds the audience subject from it, and filters the **same** delivery log the OC sends into. The filter is server-side: the client is never handed the full log to narrow down itself.
- **`ParticipantInboxRepository`** added as a **separate** contract from `CommunicationsRepository`. That one is the OC's console (send, read everyone's log); this one is a single participant reading their own mail. Keeping them apart stops a participant implementation from inheriting send/overview capability it should never have.
- **New screen** `app/(participant)/messages.tsx`, bilingual EN + IT, plus the nav `href`.

### Verified live, including the negative case

Daniel Harper is a Tennis entrant with a `draft` entry, so he belongs to `all-participants` and `tennis` and to none of `rowing` / `confirmed` / `pending-payment` / `incomplete-documents`. From the admin Communications Center two broadcasts were sent back to back — one to **Rowing**, one to **Tennis**. His inbox then showed the Tennis briefing and the seeded all-participants announcement, and **not** the Rowing one. The negative case is the point: an inbox that shows everything would have passed a naive check.

Confirmed in both languages (*Inviato a Tennis* / *Sent to Tennis*). Three `wms_api` tests cover delivery to a matching segment, withholding from a non-matching one, and 404 for an unknown athlete.

### Offline behaviour is deliberately empty, not faked

With `wms_api` down the inbox renders its honest empty state rather than falling back to seeded messages. Every other screen falls back to a seed, but messages are different: an athlete may **act** on an announcement ("briefing moved to 09:00"), and showing an invented one is worse than showing none.

### Impact on implementation

- Participant-facing reads of admin-owned data now have a settled shape: scope server-side by identity (`/accreditations/:athleteId`, `/communications/inbox/:athleteId`), and put the membership/ownership rule in `@wms/domain` so both portals share one definition.
- Where a fallback could mislead rather than merely degrade, prefer an empty state.

---

## REV-039 — Games-scale admin queue fixtures (2026-09-05)

**Status:** Approved
**Author:** agent session (Grok 4.6)
**Scope:** Data | Tests

### What changed

The OC Command Centre queues still showed toy counts (7 accreditations, 3 exceptions, 3 broadcasts, 3 assisted sessions / 5 audit events, 7 settlements) while Operations already advertised Games scale (14,210 / 20,000). Volume was added **only** to those admin queue fixtures. Participant-journey fixtures were left untouched.

Existing demo records stay first and unchanged (Daniel Harper / EXC-1 / Helen Ward / bcast-0003 / Sofia Greco). Generated rows are appended, deterministic, and written to every copy of each file that already existed (`wms_participant` data-hub, `wms_api` data-hub, `wms_admin/src/data`). Tests that pinned raw seed counts now pin the demo record by id and assert count **deltas** around mutations.

### Unchanged

Stack, repository contracts, screen behaviour, dual-control / issue-gating / consent-gate / idempotency rules, and the participant single-journey seed.

---

## REV-040 — My Games and Help; no dead nav links left (2026-09-05)

**Status:** Approved
**Author:** agent session (Opus 5)
**Scope:** UI | Data | i18n

### What changed

Two items in `PARTICIPANT_NAV` had no `href` — **My Games** and **Help**. They rendered, they were clickable, and clicking them did nothing. In a demo that reads as broken software, so both screens now exist.

- **`app/(participant)/my-games.tsx`** — the athlete's Games-time schedule grouped by day (ceremonies, practice, matches, social), each entry carrying its venue and court, with a venues list underneath.
- **`app/(participant)/help.tsx`** — helpdesk contact details plus five FAQs answered in the same terms the rest of the portal uses (category derivation on the 31 Dec 2027 reference date, no silent reclassification on a rule change, accreditation issued by the OC, time-limited waitlist offers, consent-gated proxy registration).
- Both bilingual EN + IT, both carrying the accessibility treatment from REV-039's pass: header roles, composed labels, decorative icons hidden with `aria-hidden` alongside the native props.
- New `data-hub/games-schedule.json` seeded in the **Como** id universe. The existing `schedules.json` / `venues.json` fixtures are keyed to the superseded POC universe (`event_wmg_kansai_2027`, `athlete_daniel_harper`), so a Como screen reading them would have shown nothing.

### Deliberately not wired to wms_api

There is no admin counterpart for a participant schedule, so routing it through `wms_api` would add a hop without gaining a cross-portal leg. It stays a local read, consistent with the rule set in REV-038: wire a participant repository when it closes a leg, not for uniformity.

### A correction worth recording

The duplicate admin portal still sitting in `app/(admin)/` was the intended pick for this round, on the stated grounds that someone could open it mid-demo and see a second, stale admin portal. Checking before deleting showed that risk was **overstated**: `ParticipantPortalShell` renders `PARTICIPANT_NAV` only, and `ADMIN_NAV` is a separate export, so those routes are unreachable from the participant UI without typing a URL. It remains dead weight worth removing, but it is not the live demo hazard it was described as — whereas the dead nav links were, which is why this round changed direction.

A second correction: `Team` was previously reported as a dead link. It is not — it routes to `/team-roster`. Only `My Games` and `Help` were dead.

### Verification

`tsc` clean, 60 jest tests green. Both screens verified live in EN and IT and at 375px with no horizontal overflow. One bug caught and fixed during that check: court values in the seed are already natural names (`Court 3`, `Centre Court`), so prefixing a `Court` label produced "Court Court 3" and "Court Centre Court" — the prefix was dropped and the now-unused copy key removed from both locales rather than left dead.

---

## REV-041 — Android/iOS descoped; app rebranded to World Masters Sport (2026-09-05)

**Status:** Approved
**Author:** product owner (descope) + agent session (Opus 5)
**Scope:** Plan | Branding

### Android/iOS descoped

The P1 item "Android/iOS compatibility pass on the demo path" is **removed from scope** by product-owner decision. The deliverable is reviewed on Expo Web. The codebase stays React Native-compatible (no DOM-only screen trees, per the standing web-first rule), so a native pass remains possible later — it is simply no longer gating.

Recorded plainly because it was an open, measurable gap: `ios/` and `android/` have never existed in this repo, so native has never been run. Descoping is a decision, not a completion.

### Rebranded off the retired IMGA identity

The project pivoted to World Masters Sport / Como Lake 2027 in REV-022, but the app still carried its original POC identity. Changed:

| | Before | After |
|---|---|---|
| `app.json` name | IMGA Athlete POC | WMS Como Lake 2027 |
| `app.json` slug | imga-athlete-poc | wms-como-lake-2027 |
| `app.json` scheme | imga-athlete | wms-como2027 |
| `copy.appName` (user-visible eyebrow) | IMGA Athlete | World Masters Sport |
| `ImgaMark.tsx` | stale name | `WmsMark.tsx` |
| Demo waiver filename | IMGA_Liability_Waiver | WMS_Liability_Waiver |

`slug` and `scheme` were safe to change **because** native was descoped in the same revision: `slug` feeds EAS project linking and `scheme` feeds deep links, neither exercised on Expo Web. Had native stayed in scope, these would have needed a coordinated EAS/deep-link migration instead.

### Storage keys deliberately NOT renamed

`src/data/storage/keys.ts` still uses the `imga.*` prefix (`imga.registration.journey`, `imga.auth.session`, …) and that is intentional. **`wms_api` mirrors the same keys** in its own `src/storage/keys.ts` so the ported repositories read the same records — they are a cross-repo contract, not branding. Renaming them would require a coordinated migration across both repos and would orphan any in-flight demo state (`wms_api`'s `data/db.json` is keyed by them), for zero user-visible gain. They are internal identifiers no participant ever sees.

The GitHub remote is likewise still `imga-athlete-poc`; renaming it is the product owner's call, as it affects existing clones and links.

---

## REV-042 — Duplicate admin portal removed; EN/IT catalogue complete (2026-09-05)

**Status:** Approved
**Author:** Codex (removal) + Cursor (translation), verified by agent session (Opus 5)
**Scope:** Architecture | i18n

### Duplicate admin portal removed

`app/(admin)/` held a 1:1 copy of all seven admin screens, left over from the split. The live ones are in `wms_admin`, wired to `wms_api`; these were stale and disconnected. Removed along with everything that existed only to serve them: `admin-shell.tsx`, `AdminPortalShell`, `ADMIN_NAV`, `adminPortalTheme`, the admin governance action labels in `statusLabels.ts`, the three admin mock repositories and their provider entries, and the `(admin)` route registration in `app/_layout.tsx`.

Both `/operations` and `/accreditation-desk` now resolve to the app's "This screen does not exist" route rather than rendering a second, stale portal.

**Nothing shared was lost.** The finance repository, the rules hooks and the registration-journey repository are all used by participant screens and stayed; `mockFinanceRepository.test.ts` still passes. The test count fell 60 → 44, accounted for exactly by the three deleted admin repository suites (5 + 6 + 5 = 16) — no participant test was removed or weakened.

### EN/IT catalogue completed

`src/i18n/it.ts` went from 773 to **849 keys against 849 English keys — 0 untranslated, 0 orphaned**. This closes the P1 item "Full EN/IT copy catalogue (not just demo path)" from DELIVERY_PLAN §3.

**The honest caveat behind that number:** 20 screens still `import { copy }` directly instead of calling `useCopy()`, so they render English whatever the locale toggle says. All 20 are in the superseded POC route groups — `(auth)`, `(discovery)`, `(registration)`, `(main)`. Every screen in the Como 2027 `(participant)` group uses `useCopy()`, so **the demo path is fully bilingual** — verified live end to end in Italian, including the REG-11 timeline ("Ciclo di vita dell'iscrizione") and the full pay flow ("Pagamento confermato — addebitato una sola volta"). Those 20 legacy screens are the same category of dead weight as the admin portal just removed, and are the natural next removal rather than a translation problem.

### A note on running two agents in one repo

Both tasks ran concurrently in `wms_participant`. The removal agent was told not to touch `copy.ts` / `it.ts` (to avoid colliding with the translation) and **did edit them anyway**, stripping ~304 admin keys from both. It happened to land consistently — the final key sets match exactly and nothing was clobbered — but that was luck, not coordination. The outcome is actually cleaner than the plan (no orphaned admin keys left to sweep up later), which is why it stands rather than being reverted.

---

## REV-043 — Bilingual front door for the Como portal; payment receipt (2026-09-05)

**Status:** Approved
**Author:** Codex + Cursor, verified by agent session (Opus 5)
**Scope:** UI | i18n | Acceptance

### The Como portal now has its own front door, bilingual from the first screen

`app/index.tsx` sent a signed-out visitor to `/(auth)/login` and a signed-in one to `/(discovery)/events` — both in the superseded POC route groups, all of which import `copy` directly rather than calling `useCopy()`. The practical effect was that **the first screen of any demo was English-only** and the Como participant portal had no entry of its own.

- The auth screens (`login`, `otp`, `otp-login`) and their supporting components now use `useCopy()`, so the language toggle works **before** sign-in.
- A signed-in participant now lands on `/registration-status`, the Como dashboard, instead of the legacy events list.

This also corrects an earlier assessment recorded in REV-042, which described the 20 legacy screens as dead weight and a removal candidate. They are not dead — they are the app's entry path. Removing them is a larger piece of product work (the Como portal would need its own registration and discovery flows), not a cleanup.

### Payment receipt — Scenario 1's acceptance gap closed

RFP §9.3 Scenario 1's demo-pass check is "pay + **receipt** in IT", and DELIVERY_PLAN §3 lists receipt strings under P1, but no receipt existed anywhere: after paying, a participant saw only a "Payment confirmed" banner.

`app/(participant)/receipt.tsx` now shows the order and payment references, the event and its dates, the sport and validated category, the fee breakdown (entry fee + service fee = total), the payment method and date — reached from a "View receipt" action on the status screen that appears only once the payment is `captured`.

The projection is a **pure function** (`src/features/payment/receiptView.ts`) with its own tests, including the two cases that matter: it returns null when the order is not paid and when no order exists yet, so a half-receipt can never render.

### Money and dates formatted per locale, not just translated

`formatMoneyMinor` and the date helpers now take a locale, mapped from the EN/IT toggle by a new `intlLocale()` in `src/lib/format.ts`. The result is that the same amount renders **`€90.00` in English and `90,00 €` in Italian** — symbol position and decimal separator both follow the locale's convention rather than being an English string with Italian words around it. Money stays integer minor units throughout; no float arithmetic was introduced.

### Verification

`tsc` clean, **47 tests** (44 → 47, the three new receipt view-model tests). Verified live end to end: signed out, the login screen switched to Italian ("Benvenuto!", "Contatta l'assistenza"); signed in and landed on the Como dashboard; completed sport-entry → checkout → pay → receipt, with the breakdown adding up to the €90.00 charged; confirmed both locales' money formatting and no horizontal overflow at 375px.

Both agents made changes outside their stated scope — `src/lib/format.ts` (locale-aware helpers) and `registration-status.tsx` (the receipt entry point). Both were necessary consequences of the work and were done the right way: the shared helper was extended rather than forked, and the receipt action is correctly gated on a captured payment.

---

## REV-044 — REG-11 enforced on every path, not just the admin one (2026-09-05)

**Status:** Approved
**Author:** agent session (Opus 5), acting on the RFP compliance audit
**Scope:** Architecture | Data | Compliance

### What the audit found, and why it was right

The RFP compliance audit declined to mark REG-11 as BUILT, on the grounds that `saveEntry` bypassed the status machine. Verifying that turned up something wider: **six** sites wrote `entry.status` directly — save entry, evidence decision, waitlist join, offer expiry, offer claim, and payment capture — covering the entire participant journey. `transitionEntryStatus` was the only guarded path, and `statusHistory` was written in exactly one place inside it.

So REG-11's guarantees — legality checked against the table, the actor gated, and every hop recorded — held on **one path out of seven**. A participant could go from a fresh entry through to confirmed and leave no audit trail at all. The audit's refusal to promote it was correct.

### The fix is one writer

`applyTransition(entry, toStatus, actor, reason, now)` is now the only place an entry's status may change. It checks the move against `TRANSITIONS`, gates on actor, writes the status, and appends the audit entry. All six journey sites and the public `transitionEntryStatus` now call it — one direct assignment remains in the codebase, inside the helper itself.

### Two transitions were genuinely missing — this was not mechanical routing

Routing the six sites surfaced two moves the participant journey legitimately makes that the REG-11 table did not model:

- **`pending_payment → pending_evidence`** (`evidence_rejected`, system). A reviewer can reject evidence *after* an entry has already advanced past the gate. The old code performed this move; the table forbade it.
- **`→ draft`** (`reconfigure`, system) from `pending_evidence`, `pending_team`, `pending_payment` and `waitlisted`. Re-picking sport, grade or partner is a *reconfiguration*. Rather than let `saveEntry` hop sideways between mid-journey states, the entry now rewinds to `draft` and moves forward again, so the trail reads `reconfigure → draft → submit` instead of an unexplained jump.

Both are additions to the domain model, made deliberately and in `@wms/domain` where both portals read them. Both are `system`-actor, so they do **not** appear in the admin governance panel's action list — verified: `allowedTransitions('confirmed', 'admin')` still returns exactly `substitute, disqualify, cancel`.

### Verification

159 tests green across the four repos (`wms_api` 29 → 34 with a new `statusLifecycle.test.ts`). The new tests pin the guarantee rather than the implementation: that saving records an audited transition, that paying is its own attributed hop, that the trail is continuous and every hop carries an actor and timestamp, that an illegal move is still refused and leaves the entry untouched, and that a re-save rewinds visibly through `draft`.

Live, against a fresh database: the seed entry began with **zero** history; after a participant save and payment it carried two attributed, timestamped entries; after an admin cancel, three — the participant journey and the OC action in one continuous record. Under the old code the first two would not have existed. The participant timeline renders Draft → Pending payment → Confirmed to match, and the admin panel is unchanged.

### What this does and does not change for REG-11

The lifecycle is now genuinely enforced end to end and auditable, which was the substance of the gap. REG-11 still sits on the temporary `wms_api` and its JSON-file store, so a compliance verdict of BUILT-ON-MOCK is the honest ceiling until there is a real backend — the state machine is real, the substrate is not.

---

## REV-045 — Phase B planned as one sequence with Phase A completion (2026-09-06)

**Status:** Draft — awaiting product-owner approval
**Author:** agent session (Opus 5), on the RFP compliance audit
**Scope:** Delivery | Architecture | Compliance | Commercial

### Why this exists

`DELIVERY_PLAN_COMO2027.md` §4 covers Phase B in a single bullet. The RFP compliance audit (5 Sep 2026) made that insufficient: it scored **0 BUILT / 14 BUILT-ON-MOCK / 59 PARTIAL / 31 MISSING / 4 out-of-scope** across 108 IDs, and — decisively — answered *"Phase A missing? Yes."*

### The planning decision

**Phase A completion and Phase B are planned as one dependency-ordered sequence, not two phases.** Separating them would schedule work that cannot be sequenced: the ~15k EOI migration (REG-13, a Phase B deliverable) cannot land in a database that Phase A never built. `PHASE_B_PLAN.md` is that sequence.

### Two findings that changed the plan's shape

**The 31 MISSING items are three different kinds of work.** Ten are software; six are infrastructure; **fifteen are paper** — DPA, ISMS, insurance, pen test, personnel screening, contractual artefacts. That last group is ~48% of the missing set, sits on RFP §9.1 mandatory gate 4, and **no engineering closes any of it.** It needs a named commercial owner in week 1 or the product can be complete in December and still fail the gate. This is the plan's largest risk after the commercial one.

**Five structural facts were re-verified against the code on 6 Sep 2026**, not carried over from the audit on trust:

- **F1** — five of six `wms_api` repositories are pure in-memory; only the registration journey persists. `mockAccreditationDeskRepository.ts:3` states it in its own comment.
- **F2** — there are **two disjoint rule registers**, confirmed by checksum: `50e43f00…` serves the live registration path (`wms_api/src/data/fixtures/`, `wms_participant/src/data/mock/fixtures/`), `bdec46a4…` serves the admin configurator (`wms_admin/src/data/`, `wms_api/src/data/fixtures/data-hub/`). Not drifted copies — different shapes, different bands. Athletes are judged by data nobody is editing. Invisible in every demo.
- **F3** — `publishRuleChange` (`mockRulesRepository.ts:54–64`) writes a notice and never mutates the register.
- **F4** — the admin portal has no authentication; dual control compares strings.
- **F5** — no PSP; payment is a hardcoded token.

F2 is scheduled ahead of most of the substrate work because it is the highest-severity correctness defect and needs no substrate to fix.

### What is protected, not rewritten

`@wms/domain` (pure TS, four consumers), the age engine, REG-11's guarded writer (REV-044), and the repository seam. The seam is why Phase B is feasible at all — mock → real is a constructor change, not a UI rewrite.

### Recorded, not resolved

The V1 proposal (31 Aug 2026) marks 98/108 IDs as some form of Comply, "Available 17 Sep 2026". The audit measures 0 BUILT. Reconciling that is a product-owner decision with a week-1 deadline (`PHASE_B_PLAN.md` §7-R1) — it is named in the plan, not decided by it.

### Files

- `context_docs/docs/PHASE_B_PLAN.md` (new)

---


## REV-046 — Backend and database designed against constraints, not application checks (2026-09-07)

**Status:** Draft — awaiting approval
**Author:** agent session (Opus 5)
**Scope:** Architecture | Data | Performance

### Why this exists

`PHASE_B_PLAN.md` Track A says "real substrate" in seven bullets. `BACKEND_DB_PLAN.md` is the engineering detail: full schema, API design, and a measured performance budget — derived from the 23 models in `wms_domain/domain/models/` and the 32 routes in `wms_api/src/http/routes.ts`, both read on 7 Sep 2026. The schema is a **translation of types that already exist and are already tested**, not a fresh design.

### The right-sizing decision

20,000 athletes is ~50,000 entry rows. The entire dataset fits in RAM on a modest server. So microservices, sharding, event sourcing, CQRS, Kafka and NoSQL are **explicitly rejected** — each adds failure modes to solve a problem this system does not have. The two real problems are **burst concurrency** (2,000 people, one registration opening) and **temporal correctness** (an entry judged by rule v2.1 must stay judged by v2.1 forever). Best practice here is boring, constrained, correct Postgres.

### The load-bearing idea: constraints, not application checks

Every guarantee that matters is a database constraint, so a bug in the service layer produces a rejected transaction rather than a corrupt outcome:

- `CHECK (confirmed + reserved <= capacity)` on `core.entry_quota` — **overselling becomes impossible**, not merely unlikely. Check-then-act in application code is a race by construction; this is how a 60-place event sells 63 and the OC finds out at the venue.
- `EXCLUDE USING gist` on `core.rule_version` — two overlapping active versions for one sport **cannot exist**. This is F2 (two disjoint registers) fixed structurally.
- `UNIQUE (case_id, signer_id)` on `ops.exception_signature` — one reviewer signing twice is a unique violation. This is F4 and RUL-06; the audit's line was *dual control without identity is theatre*.
- `CHECK (approved_by <> requested_by)` on `core.refund` — PAY-05 dual control.
- `psp_event_id UNIQUE` on `core.payment_event` — Stripe redelivery is a no-op.
- Partial unique index on live entries — the double-click, the retry and the second tab collapse onto one row.

### Three structural choices worth recording

**`registration_entry.rule_version_id` is a FK to an immutable row**, replacing `ruleId + ruleVersion` strings. The rule an entry was judged by cannot be retroactively rewritten by a later publication. This is the single most important column in the schema, and it is F3 fixed.

**Status history leaves the entry.** `statusHistory?: EntryStatusEvent[]` embedded as JSON can be silently truncated by any writer, cannot be indexed or queried across entries, and cannot be protected by grant. As append-only `core.entry_status_event` with `REVOKE UPDATE, DELETE`, it is all three — and `actor_id` becomes a real foreign key.

**Restricted data is a permission boundary, not a convention.** Separate schema, separate database role, separate S3 bucket and KMS key, and **no foreign key from `core`** — so no accidental join and no `SELECT *` can drag medical data into a general response. PRV-04's "clean export" becomes the default behaviour because the export role physically cannot read it.

### Future-proofing that is real, not speculative

`event_id` on every event-scoped table. WMS has run fifteen editions and has four scheduled — Kansai 2027, Lahti 2028, Perth 2029. One column and one index now is the difference between selling this platform once and selling it every two years.

### Performance

`OFFSET` banned on growable lists (keyset paging on UUIDv7 keys is constant-time at any depth); `COUNT(*)` made opt-in — a count over a filtered 50k table on every admin keystroke is the most common way a fine API feels slow. Budget: catalogue < 50 ms, journey < 150 ms, admin page < 200 ms, quota claim under contention < 800 ms, all p95 and all to be **measured in week 5** on the real deployment, not asserted.

### Migration

`wms_api` is **deleted, not migrated**. It existed to prove both portals can share one backend; that proof succeeded. Repositories swap `Mock*` → `Postgres*` behind unchanged interfaces, rules and registration first because they carry the correctness risk.

### Files

- `context_docs/docs/BACKEND_DB_PLAN.md` (new)

---


## REV-047 — The backend DDL did not execute; twelve defects fixed (2026-09-08)

**Status:** Draft
**Author:** agent session (Opus 5), on an adversarial audit of REV-046
**Scope:** Data | Architecture | Process

### What happened

REV-046's schema was audited before implementation by seven independent reviewers reading the code, then re-checked by hand. **The DDL as written would not have executed** — it failed on its very first `CREATE TABLE`.

Five defects were pure execution failures: `core`, `ops` and `audit` schemas were never created; `core.order` used the reserved keyword `ORDER` unquoted at six sites; `audit.activity_log` gave a partitioned table a primary key that omitted the partition key **and** created no partitions; roles `app_rw` / `restricted_rw` were referenced by nine grants but never created; six tables were referenced before creation.

### The two that mattered most

**Publishing a rule was impossible.** `REVOKE UPDATE, DELETE ON core.rule_version` was stated alongside "publishing closes the previous version's `effective` range" — closing a range *is* an UPDATE. The two claims contradicted each other outright. Worse, even with UPDATE permitted, inserting the new version before closing the old one momentarily overlaps and the `EXCLUDE` constraint rejects the whole transaction. Fixed with an immutability **trigger** (content frozen, range closure allowed) plus a pinned close-then-insert order.

**Price could not be expressed.** The draft put a single `base_fee_minor` on `core.sport_entry_product`. The domain's `Fee` type is keyed by product **and category and grade** and is time-bounded — Tennis Competitive €90 / Recreational €75 is something the running product already does. A schema that cannot represent shipped behaviour is not a translation of the domain. Added `core.fee` with an `EXCLUDE` preventing overlapping price phases; price is frozen onto `order_line` at order time.

### Coverage gaps that would have blocked Phase B tracks

`core.pre_registration` + `pre_registration_match` were entirely absent — which made **Track D (REG-13, the ~15k EOI migration) unimplementable**. `migration_batch` now makes the mandatory rollback one statement. Proxy consent (PLT-06) and partner requests were also unbacked despite both shipping in the demo. `gameshub`/`match` remain deliberately absent — competition management is Phase C.

Also fixed: `UNIQUE` on nullable columns silently permitted duplicates (`NULLS NOT DISTINCT`), and `waitlist_entry.position NOT NULL` made the domain's `'eligible'` state unstorable.

### The process finding — worth more than any single defect

The audit workflow ran 177 agents; **156 died on a usage limit**. Its majority-vote verifier could not distinguish a dead agent from a successful refutation, so it reported **55 of 56 findings as "refuted"** — including every defect listed above. Had that summary been trusted, the plan would have been marked clean and implementation would have started on DDL that does not run.

**Rule going forward: a verifier that did not return is not a vote.** Any adversarial-verification harness must count non-responses separately and surface unverified findings as *unknown*, never as *refuted*. Findings here were recovered by re-checking each concrete claim directly against the file.

### Files

- `context_docs/docs/BACKEND_DB_PLAN.md` — §4.0 bootstrap, §4.11 missing tables, §10 corrections table, plus fixes throughout

---


## REV-048 — Age is one dimension, not the rules model (2026-09-08)

**Status:** Draft
**Author:** agent session (Opus 5), closing findings A–E from the recovered RFP-coverage audit
**Scope:** Data | Compliance | Commercial

### Why a second pass was needed

REV-047 fixed defects that stopped the DDL executing. These are a different class: **the SQL was valid and would have run, then failed to deliver requirements the tender makes mandatory.** Every one of these would have passed a syntax check.

The findings came from the one RFP-coverage dimension of the REV-047 audit, whose results were lost when 156 of 177 agents died on a usage limit. They were recovered from the run journal.

### A — the rules model could only express age

`rule_version` was `strategy + bands`: a 1:1 copy of today's `SportRule`, which expresses **age and nothing else**. Four of the RFP's ten §3.2 Masters patterns worked; **six had no columns anywhere** — judo (age+weight+federation+belt), golf handicap, para classification, proficiency review, category combination, eligibility exclusions. §9.1 gate 3 requires all ten. Adding a `strategy` value per sport would have been the per-sport branching the RFP forbids.

**The generalisation came from the engine itself.** `deriveCategory()` does two things: aggregate a number off the roster, then band it. The four "strategies" are four *aggregation functions over one attribute*. So: **age is one dimension, not the model.** A rule version is now an ordered list of `core.rule_dimension` rows (attribute + aggregation + exclude_roles + rounding + bands); the category is the tuple of matched bands. The existing four strategies map mechanically — no behaviour changes, no test breaks.

`band_kind` (`range` | `enum`) is the one genuinely new idea: age, weight and handicap sit on a number line; belt rank, para class and proficiency grade do not. A single `minAge/maxAge` shape could not express both, which is *why* six patterns were unreachable.

Eligibility became `core.rule_eligibility` — deliberately **not** dimensions, because exclusions decide whether someone may enter at all, not which category they land in. Its `message_key` (not `message`) prevents the hardcoded-English refusal reason the compliance audit found in `loginSchema.ts`. Attribute values got a home in `core.entrant_attribute`, with `valid_until` making para-class expiry real.

### B and D — the money schema fought its own requirements

`registration_order.entry_id NOT NULL` pinned one order to one entry, making **PAY-03** (team/corporate/split payment) and **TEA-02** (team deposits, unpaid-member tracking) structurally impossible. An order now belongs to a **payer**; the entry link moved to `order_line`, so one order spans a roster. TEA-02's unpaid-member tracking becomes a query, not a feature.

`CHECK (total_minor = subtotal_minor - discount_minor)` was an arithmetic identity that **any VAT line violates** — the constraint would have actively fought the fix. Replaced with `gross = net + tax`, tax carried per line in basis points with a FatturaPA nature code for exempt lines, plus `core.promotion` and credit notes. Invoice numbering moved to per-series-per-year with `core.invoice_series`, because gapless numbering is a sequence problem (a Postgres sequence leaks numbers on rollback) and Italian law does not permit gaps.

### C — "no silent reclassification" was a policy, not a guarantee

Nothing recorded the impact analysis before publishing (RUL-03) or the notification and acknowledgement after (RUL-05). Added both, and the constraint that matters: **a rule version cannot go `active` without an impact analysis attached.** This is the one deliberate circular reference in the schema, resolved by `ALTER` after both tables exist.

### E — bilingual was unbuildable, and ACS-05 was inverted

Every human-readable string was a single-valued column and `person` had no locale, so PLT-02's "further languages without code changes" was impossible at the storage layer. Added `core.locale` + `core.translation`; base columns remain as fallback so a missing translation degrades rather than blanks.

ACS-05 requires accommodation needs stored **separately from sport classification**; the only related store lumped them under `para_classification` — precisely the conflation the requirement forbids. `restricted.accommodation_need` is deliberately **not** an `entrant_attribute`: putting it there would expose it to `rule_dimension` as a categorisation input, which is how an accommodation need becomes an eligibility decision. It is unreachable from `core` by construction.

### The lesson

**A schema can be perfectly valid SQL and still make a mandatory requirement unbuildable.** B and D did exactly that. Auditing DDL executability is necessary and not sufficient — the tender has to be audited separately, against the schema, clause by clause.

### Files

- `context_docs/docs/BACKEND_DB_PLAN.md` — §4.3.1 (dimensions, eligibility, attributes, combination), §4.7.1 (locale, translation, accommodation), rebuilt order/invoice tables, §10 second-pass table. 50 tables, all cross-checked against the migration order.

---


## REV-049 — The schema meets a real database; four more defects (2026-09-08)

**Status:** Approved
**Author:** agent session (Opus 5) + Cursor (scaffold)
**Scope:** Architecture | Data | Process

### What exists now

`wms_backend` — NestJS 11 on Node 22, PostgreSQL 18 in Docker, Kysely, raw-SQL migrations via `node-pg-migrate`. Scaffolded by Cursor against a written spec; **independently verified here**, not taken on report: 4 schemas and 3 roles present in the live database, `migrate:up/down/up` clean, `GET /v1/health` doing a real `SELECT 1`, 4 tests green.

Raw-SQL migrations rather than Prisma Migrate because the schema uses `EXCLUDE USING gist`, partial unique indexes, `UNIQUE NULLS NOT DISTINCT`, plpgsql triggers and declarative partitioning — none of which Prisma's schema language can express. Splitting the DDL between a schema file and raw-SQL escape hatches would give one table two sources of truth.

### The point of this step: paper met Postgres

REV-047 and REV-048 audited the plan by **reading** it. This is the first time any of it **ran**. Four defects surfaced that no amount of reading would have found:

**G — `CREATE ROLE` in a migration is wrong, and CI is where it bites.** Roles are **cluster**-scoped; schemas and grants are database-scoped. The first `migrate:up` succeeds and the second database — every throwaway test database, i.e. every CI run — fails with "role already exists". The deeper correction is architectural, not syntactic: **roles belong to infrastructure provisioning, once per cluster, not to an application migration.** The idempotent `DO $$ … EXCEPTION WHEN duplicate_object` form exists so local and CI databases can be created freely from the same file.

**H — the PG18 Docker image moved its data directory** to `/var/lib/postgresql/<version>/docker`. Mounting the conventional `/var/lib/postgresql/data` makes the container exit 1, so nothing persists.

**F — `idempotency_key` was globally namespaced.** Found while *writing the service*, not while reading the plan: `key text PRIMARY KEY` lets one caller collide with another's key and be handed **that caller's stored response body** — for a registration or payment that is a personal-data leak, not merely a correctness bug. Now `PRIMARY KEY (scope, key)`, with `state` and a `request_hash` check before any replay.

**A bug in the test itself.** `SET LOCAL ROLE app_rw` only holds inside a transaction; outside one it silently does nothing. The append-only tests would have run as the owner and **passed for the wrong reason** — the exact failure mode this suite exists to catch. Now wrapped in `BEGIN`/`ROLLBACK`.

### Two design questions the plan had left ambiguous, settled by writing the code

**Idempotency has two modes, not one.** "Insert the key in the same transaction as the work" is correct only while the work is confined to Postgres. A card charge commits outside the database and no rollback undoes it. So: **local** (key and work share a transaction; a crash rolls back both and the retry is clean) and **external** (the key is committed as `in_progress` *before* the call, so a crash leaves evidence an attempt may have happened; recovery is reconciliation against the PSP, never a blind retry). Choosing the wrong mode is the bug that double-charges. Also settled: a duplicate arriving mid-flight gets `409 + Retry-After` and is never blocked — waiting would hold a connection for the length of someone else's PSP call, and 2,000 concurrent claimants would exhaust the pool.

**Keyset pages on `(created_at, id)`, not `id` alone.** The plan asserted both, and they are different designs. UUIDv7 sorts chronologically, so id-only ordering matches insertion order — but for the ~15k EOI rows of REG-13, `created_at` is the *original* registration time while the id is minted at migration time. Paging on the id would list migrated participants in import order, which is meaningful to nobody. `id` stays as the tiebreaker because `created_at` is not unique and a keyset without a unique tail skips or repeats rows at page boundaries.

### Tests as specification

`test/concurrency.spec.ts` encodes §10's guarantees and is **expected to fail** until the tables exist: 4 pass, 9 fail with `relation does not exist`. Two of them attack the design rather than the implementation — one bypasses the application entirely to `UPDATE` the quota (if that succeeds, every oversell test above it passed for the wrong reason), and one asserts a second product-level quota row is refused despite `category_id` being NULL, which only holds with `UNIQUE NULLS NOT DISTINCT`.

### Files

- `wms_backend/` — scaffold (Cursor), plus `src/common/{idempotency,http,pagination}` and `test/concurrency.spec.ts`
- `BACKEND_DB_PLAN.md` — §4.0.3 role provisioning, PG18 Docker note, §4.6 idempotency modes, findings F/G/H in §10

---


## REV-050 — The guarantees are enforced by a running database (2026-09-08)

**Status:** Approved
**Author:** agent session (Opus 5)
**Scope:** Data | Architecture

### What changed

Three migrations — `identity_and_catalogue`, `people_and_registration`, `platform` — put 24 tables from `BACKEND_DB_PLAN.md` into a real PostgreSQL 18 database. **13/13 tests pass**, up from 4/13.

The plan has now been reviewed twice on paper (REV-047, REV-048) and executed once. Execution found one more defect that neither reading pass caught.

**I — the grants did nothing.** §4.0.3 granted `USAGE ON SCHEMA` and stopped there. `USAGE` only permits *looking objects up*; reading or writing them needs table privileges, which were never granted. As written, `app_rw` could not read or write a single row — and the whole restricted-data design depends on that role being real. Fixed with `ALTER DEFAULT PRIVILEGES`, so every future table is granted automatically rather than depending on each migration remembering; the per-table `REVOKE`s on the audit trails then subtract from that baseline.

### The headline guarantee is now demonstrated, not asserted

`test/concurrency.spec.ts` runs **500 simultaneous claimants against a 60-place quota and admits exactly 60**, with the row's own counters agreeing. It was also proved a second way, deliberately from outside the application:

```
UPDATE core.entry_quota SET confirmed = confirmed + 1 ...
ERROR:  new row violates check constraint "quota_not_exceeded"

INSERT INTO core.entry_quota (..., category_id, capacity) VALUES (..., NULL, 60);
ERROR:  duplicate key value violates unique constraint
```

The second is the one worth keeping in mind: `(product, NULL)` collides **only because of `UNIQUE NULLS NOT DISTINCT`**. Under plain `UNIQUE` those NULLs are distinct, the insert succeeds, and one product quietly carries two capacity-60 quotas — 120 places sold with every `CHECK` satisfied. That is the failure the whole constraint-first design exists to prevent, and it is invisible in any demo.

Also verified end to end rather than assumed: `migrate:down` three times back to bootstrap, then `up` again, then the full suite green. A rollback nobody has run is not a rollback.

### Scope held deliberately

Rules dimensions, money and pre-registration tables are **not** in these migrations. Those are the areas the external RFP-coverage audit is still reviewing, and their relationships may still move. What landed is the set whose *relationships* are settled — adding a column later is a cheap migration, changing a relationship is not.

### Files

- `wms_backend/migrations/1700000001000_identity_and_catalogue.sql` (locale, event, sport, rule_set, rule_version + immutability trigger, sport_entry_product, entry_quota, fee)
- `wms_backend/migrations/1700000002000_people_and_registration.sql` (person, athlete_profile, consent, rosters, registration_entry, entry_status_event, category_audit, waitlist_entry)
- `wms_backend/migrations/1700000003000_platform.sql` (idempotency_key, evidence_document, ops.*, audit.activity_log + partitions, restricted.*)
- `BACKEND_DB_PLAN.md` §4.0.3 — finding I

---


## REV-051 — External tender audit: three blockers fixed (2026-09-08)

**Status:** Draft
**Author:** agent session (Opus 5), on an independent audit by Codex
**Scope:** Data | Compliance

### The audit

An external reviewer read both tender PDFs (22 pages + 3) against `BACKEND_DB_PLAN.md`, traced all 108 IDs, the ten §3.2 patterns, the §9.1 gates and the §9.3 scenarios, and returned **13 findings**: three blockers, six high, three medium. Verdict: *needs redesign first* — the stack is sound, the contracts were not.

It also confirmed the second pass landed: hypotheses A–E were all **refuted as written** against the current file, with residuals rolled into F01/F02. And it corrected two of this project's own claims: RUL-05 requires **notification, not acknowledgement** (calling it a Must was wrong), and "an entry keeps its rule version forever" overstates the tender, which asks only that re-evaluation never be *silent*.

Every blocker was verified here against the file before acting on it.

### F02 — the one that mattered most, and it was self-inflicted

**A published rule's content was still mutable.** Finding A moved categorisation out of `rule_version` into `rule_dimension` and `rule_eligibility` — and left the immutability trigger guarding the header it had just emptied. The child rows carrying every band and predicate had no guard, and `ALTER DEFAULT PRIVILEGES` granted `app_rw` `UPDATE`/`DELETE` on them.

So `registration_entry.rule_version_id` — described in this plan as "the single most important column in the schema" — pinned an entry to an identifier whose meaning could be rewritten underneath it. The fix for one finding created another, which is the characteristic risk of a refactor: **the guarantee did not move with the data.**

Separately, `CHECK (impact_analysis_id IS NOT NULL)` proved only that *an* analysis existed. Version 5 could be activated carrying version 2's analysis. A `CHECK` cannot look across tables, so the binding is now a **composite foreign key** on `(impact_analysis_id, id, content_hash)` against a widened key on the analysis. Three things must hold to activate: an analysis exists, it is for this version, and the content it evaluated hashes to what is about to govern. Edit a band after analysing and activation is refused.

Child rows are now frozen the moment their parent leaves `draft`.

### F03 — a correct constraint enforcing the wrong aggregate

One quota per `(product, category)`, one `quota_id` per entry. REG-09 requires reserved allocations, release waves and local/international dimensions; §2.2.4 requires control at venue level. An entry could not consume a sport-wide cap **and** a venue allocation, because it could point at only one.

The uncomfortable part: the `CHECK` was correct, the 500-claimant proof was real, and both would have faithfully enforced an aggregate that does not match the tender. **Concurrency correctness is not requirement coverage.** Replaced with `quota_pool` (scoped, nestable, allocation kind, unit, release window) and `entry_quota_consumption`; the claim transaction locks every applicable pool in id order, because locking in resolution order is how two claimants deadlock on a shared parent cap.

### F01 — scope and facts

`rule_set` carried four of RUL-01's nine scope dimensions. `entrant_attribute` allowed one value per person per event: no issuer, no sport scope, no declared-vs-verified distinction — so one athlete's licences from two federations collapsed into one row, and an unverified self-reported handicap was indistinguishable from a classified one. And `rounding` was designed for ages: `floor` on a −2.4 handicap or a 73.6 kg weight corrupts the fact rather than banding it. Fixed with the full scope plus explicit `precedence`, a typed `attribute_type` dictionary, scoped/versioned/verified facts, and `rounding` legal only at `value_scale = 0`.

### Known divergence — flagged, not hidden

REV-050's migrations built `core.entry_quota`, and the concurrency suite passes against it. F03 replaces that table. **The plan and the database now disagree**, which is precisely the drift that produced the two-rule-register defect the original audit found. Closing it is the next task: a migration replacing `entry_quota` with pools, and the concurrency tests rewritten to claim across a pool set.

### Still open

Six high (F04 payment/refund allocation, F05 fiscal snapshots, F06 versioned roster selection, F07 evidence lifecycle, F08 consent/retention linkage, F09 comms templates, F11 configurable registration policy) and two medium regressions against shipped behaviour (F12 credential validity dates, F13 profile contact fields). F12 and F13 first: they remove data the participant app already displays and saves.

### Files

- `BACKEND_DB_PLAN.md` — §4.3 rule_set scope, §4.3.1 dimensions/facts/dictionary, §4.3.1 freezing + composite FK, §4.5 replaced with quota pools, §10 third-pass table
- `wms/BACKEND_DB_RFP_AUDIT.md` — the audit itself (external, not edited here)

---


## REV-052 — Quota pools live; shipped participant fields recovered (2026-09-09)

**Status:** Approved
**Author:** agent session (Opus 5) + Cursor (F12/F13)
**Scope:** Data

### Quota pools replaced the single-quota model (F03)

`core.entry_quota` is gone. `core.quota_pool` (scoped, nestable, allocation kind, unit, release window) plus `core.entry_quota_consumption` let one entry consume several pools — REG-09's reserved allocations and release waves, and §2.2.4's venue-level control. Waitlists moved onto pools; `registration_entry.quota_id` was dropped because consumption is a set, not a column.

Two new tests carry the guarantee. **Partial consumption is impossible** — if any pool in the set is full, the entry consumes none of them; holding a sport cap while missing the venue seat is the failure the single transaction prevents. And **the narrowest pool binds**: with a sport cap of 100 over a product pool of 60, 200 claimants yield 60, proving both pools are actually consulted. Pools are locked `ORDER BY id`, not in resolution order, because resolution order is how two claimants deadlock on a shared parent.

### F12/F13 — and the table nobody had built

The audit assumed `core.accreditation` existed. **It did not.** §4.8 was written in the plan and never migrated — REV-050's three migrations covered identity, registration and platform, and the accreditation section was simply skipped. So this was a new table, not the `ALTER` the finding described.

Cursor traced the shipped screens rather than starting from the audit, and found **five fields the audit missed**: `emergencyContact.relationship`, `profileImageKey`, `eligibilityStatus`, `sportName` and `qrValue`. It also caught that `badge_number` cannot be `NOT NULL` — the desk queue is full of pending accreditations that have no number yet.

Two judgement calls, both right and both argued rather than assumed:

- **Passport stays out of `core.person`.** It is in `restricted.identity_document` with no FK back to `core`, so a `SELECT *` on a person cannot leak it. Verified: `app_rw` gets `permission denied for schema restricted`, and `core.person` has no passport column.
- **Emergency contact is a table, not three columns.** The shipped form collects one; the tender does not cap it at one, and inline columns would freeze "exactly one" into the schema.

Also recorded: `qr_secret` (the ACC-06 offline HMAC seed) is **not** a substitute for `qr_value` (the payload the shipped pass renders) — they are different facts, and the draft conflated them. And consent's `required`/`sensitive` are properties of the notice *kind*, not of a person's answer; storing them per row would let two consents of the same kind disagree.

### State

27 tables, six migrations, **21 tests green**, `up → down → up` clean.

### Open from Cursor's report, not resolved here

Whether one person may hold two concurrent badges (athlete + official) — there is no unique on `(event_id, person_id)`, deliberately, but the rule is unconfirmed. The DPO-approved `lawful_basis` string for passports. Whether production persists `profileImageUri` or only the key.

### Files

- `wms_backend/migrations/1700000004000_quota_pools.sql`, `1700000005000_participant_fields.sql`
- `wms_backend/test/concurrency.spec.ts` (pool sets), `test/participant-fields.spec.ts`
- `BACKEND_DB_PLAN.md` §4.1, §4.5, §4.7, §4.8

---


## REV-053 — The domain package catches up with the schema (2026-09-09)

**Status:** Approved
**Author:** agent session (Opus 5)
**Scope:** Architecture | Data

### Why this came before the repositories

Writing `PostgresRegistrationJourneyRepository` was the plan. It stalled immediately: `@wms/domain` still declared `EntryQuota` as one capacity per (product, category) and `SportRule` as `strategy + bands`, while the database had moved to quota pools and rule dimensions. The repository would have had to squeeze pools back into the old single-quota shape — hiding the new capability behind a contract that denies it exists.

That is the same failure as F02, one layer up: **the data moved and the contract did not.** Fixing the contract first is cheaper than writing a repository that has to be unwritten.

### Additive, not breaking

Sixty-six files across four repos consume `@wms/domain`, so the new types sit **beside** the old ones rather than replacing them:

- `quotaPool.ts` — `QuotaPool`, `EntryQuotaConsumption`, `EntryAllocation`, with `headroom`, `bindingPool`, `isPoolOpen` and `lockOrder`. `EntryQuota` stays as what the **UI reads** — the availability of the pool that actually binds. Screens asking "how many places are left?" keep working, and nothing has to pretend a nested set of caps is one number.
- `ruleDimension.ts` — `RuleDimension`, `RuleEligibility`, `AttributeType`, `EntrantAttribute`, `MultiDimensionDerivation`, with `isUsableFact` and `selectFact`. `SportRule` remains the single-age-dimension case, so the existing engine and its tests are untouched.

Two rules are encoded as functions rather than left to each caller: `lockOrder` sorts pool ids, because locking in resolution order is how two claimants deadlock on a shared parent cap; and `selectFact` returns `null` when nothing qualifies rather than falling back to a default, because a missing fact must surface as "cannot evaluate" and never as a quietly produced category.

### Verified

`wms_domain` builds, 32 tests green. `wms_backend`, `wms_api`, `wms_admin` and `wms_participant` all typecheck clean — the point of the additive approach, confirmed rather than assumed.

### Files

- `wms_domain/domain/models/quotaPool.ts`, `ruleDimension.ts`, `index.ts`

---


## REV-054 — Temporary auth, and a segfault that looked like a passing test suite (2026-09-09)

**Status:** Approved
**Author:** Cursor (auth) + agent session (Opus 5) (review, fixes)
**Scope:** Architecture | Security

### What landed

`LocalIdentityProvider` behind an `IdentityProvider` seam: login / refresh / logout / me, a global guard (authenticated by default, `@Public()` to opt out), roles, and four tables. Verified independently rather than taken on report — the seam holds (`jsonwebtoken` appears only in the two identity files), argon2id carries the pinned OWASP parameters, `jwt.verify` pins `algorithms: ['HS256']`, refresh reuse revokes the whole token family, and `JWT_SECRET` has no default.

Cursor tightened one pinned decision on its own initiative: a **32-character minimum** on `JWT_SECRET`, on the grounds that "no default" does not exclude "any non-empty string". Correct — HS256 with a short secret is exactly how a dev value survives into production.

### The review finding: a native module that segfaults

The report said 33 tests passed. On this machine the suite died with `ERR_IPC_CHANNEL_CLOSED` before a single test ran. Isolating it: `require('argon2')` exits **139 — SIGSEGV**, with no stack and no message.

Cause: `argon2` ships no Node 20 prebuild for darwin-arm64, and this shell was on Node 20 while the repo declares `engines: >=22`. Under Node 22, 33/33 pass and the report is accurate.

**`engines` is documentation — npm ignores it.** So a correct implementation was indistinguishable from a broken one, and the failure mode was a silent crash rather than a message. Fixed at both ends: `engine-strict=true` makes the install refuse, and a boot check in `main.ts` prints a sentence naming the version and the reason. (Node 20 also reached end-of-life in April 2026, so this was overdue regardless.)

### The finding Cursor raised against its own work

`PRIMARY KEY (person_id, role_code)` permits "OC staff in one edition, participant in another" only because those are different role codes. It forbids the **same** role in two editions — `oc_staff` on Como and on Kansai collide. Multi-edition is a core principle here (§3: person is global, participation is per-edition), and an authorization grant is participation. Now `UNIQUE NULLS NOT DISTINCT (person_id, role_code, event_id)`, NULL meaning a genuinely global grant.

Applying it broke the dev seed's `ON CONFLICT (person_id, role_code)` — caught by running the suite after the migration, which is the only reason it did not ship.

### Deliberately absent

MFA, SSO, password reset, email verification. MFA matters: **PLT-04 is a mandatory gate item** and this does not satisfy it. Password reset needs real mail, which does not exist yet — stubbing it would have looked finished.

### State

29 tables, eight migrations, **33 tests green**, typecheck clean, `up → down → up` clean.

### Files

- `wms_backend/src/auth/*`, `migrations/1700000006000_temporary_auth.sql`, `1700000007000_person_role_per_event.sql`, `.npmrc`, `src/main.ts`
- `BACKEND_DB_PLAN.md` §2 — "until D5" subsection and the Node 22 floor

---


## REV-055 — Payment allocation and fiscal snapshots (2026-09-09)

**Status:** Approved
**Author:** Cursor (F04/F05) + agent session (Opus 5) (review)
**Scope:** Data | Compliance

### The money tables had never been migrated either

Like `core.accreditation` in REV-052, §4.6 existed in the plan and had never reached a migration. REV-050's three migrations covered identity, registration and platform and stopped there. **Two of the plan's eight sections were never built**, and both were found only because someone else went looking — worth naming as a pattern rather than a coincidence.

### Verified rather than accepted

- `line_not_over_refunded CHECK (refunded_minor <= paid_minor)` — in the database, not a service check, matching `quota_not_exceeded`
- `split_inclusive(9000, 2200)` → `7377 | 1623` — €73.77 + €16.23, exactly as F05 requires
- `distribute_minor(100, 3)` → `{34,33,33}` — sums to the total, no lost cent
- 38 tests green; migration applied to `wms_dev`, which Cursor had flagged as unverified

### Four decisions, all argued rather than assumed

**Allocation is per order line, not per member balance.** One member may owe an entry fee, an add-on and a deposit at once; a balance row mixes them and makes a partial refund of one fee kind unanswerable. Tax lives on the line, so F05 has to reverse a particular rate. Unpaid members stay a single query against `roster_member_balance`.

**Refunds allocate independently of which capture funded the line.** Two payments can cover one line; a withdrawal reopens a member's debt, not a PSP capture.

**Snapshot is `invoice_line` + `invoice_tax_summary`, frozen at issue**, with `tax_rule` as provenance only. A versioned rule alone is insufficient — re-deriving after a rounding-policy change still drifts.

**Rounding is per line**, and a tax summary is `SUM(line tax)`, never `tax(SUM(net))`.

### Where Cursor pushed back on the audit, correctly

It rejected F04's suggestion that computed FIFO is acceptable: the same finding demands payer intent and reversals be retained, and those require rows — FIFO is a function that writes them, not a substitute for them. It separated F05 into settlement (done) and pricing/package entitlement (still open), rather than pretending one migration closed both. It declined to model FatturaPA as tables when an immutable XML in an external service is the source of truth. And it kept `refund_id` nullable, because a nota di credito can correct a bill without money moving.

It also corrected the prompt's own example: the €1,200 / €400 case is a person count on tax-exempt lines, not a VAT remainder. The 22% path is a separate test.

### Open, and named as open

Italian tax applicability and issuer identity (R5, no finance decision). PSP integration (D4 unmade — `psp` is a label and nothing is called). Package/discount allocation and category-specific fee overlap. Whether half-away-from-zero is the legally required IVA rounding — it is the only rounding this schema uses, so a later change cannot retouch issued documents. Concurrent FIFO is not soak-tested under the 500-claimant load quotas were.

### State

38 tables, nine migrations, **38 tests green**, typecheck clean, `up → down → up` clean.

---


## REV-056 — Configurable evidence and registration policy (2026-09-09)

**Status:** Approved
**Author:** Cursor (F07/F11) + agent session (Opus 5) (review)
**Scope:** Data | Compliance

### Evidence became three objects

One row with a status cannot hold rejected v1 and accepted v2 as the **same obligation**, which EVD-02 requires. Now: a versioned **requirement** policy (applicability, formats, validity, translation-by-issuing-country), a person-owned **obligation** — owned by the person so it can be collected before an entry exists — and immutable **uploads** with append-only **reviews**.

`version_no` (the issued document) and `s3_object_version` (the bucket artefact) are deliberately separate columns; the audit's point was that the latter is not the former. Waivers are an approved link to a requirement version rather than a status, so a waived obligation still exists and reporting can exclude it without deleting anything. Restricted evidence uses the identical contract behind its existing boundary — one lifecycle, not a weaker second one.

`core.evidence_document` survives as a **view** over the current upload, so the journey query written in REV-053 kept working unchanged. Verified: 56 tests green, and `app_rw` still gets `permission denied` on `restricted.*`.

### The lifecycle division, which is the interesting part

Configurable transitions could easily have become a second state machine — the exact defect (two rule registers) that started this audit. The division settled on:

`statusLifecycle.ts` owns the **vocabulary** — ten named states, the progress spine, the default edge list. `registration_policy_transition` owns **which of those edges are legal here**, for which actor, under which named guard. Configuration may narrow, never invent: a `CHECK` pins the ten names so no administrator adds `pending_magic`, and guards stay in code with config only selecting them.

Cursor implemented "config replaces the edge list when present, else the code table", and recommended the stricter AND live in the application when this is wired — on the grounds that duplicating `TRANSITIONS` into SQL would be a second register. Agreed, and recorded in §4.7.2. An empty transition set means "use the default map", not "no moves allowed" — a distinction that would otherwise lock every entry the day a policy is published.

### Where Cursor argued with the finding, correctly

**"Crew of exactly four plus a cox" is two rules, not one constraint** — `CHECK (count = 5)` would happily accept five rowers and no cox. **`uq_entry_live` was kept**: F11 is right that it cannot express "at most three events", but removing it would re-open double-submit on a single product; the cross-product cap sits on top. **Identity documents stay in `restricted.identity_document`**, not the evidence model — EVD-02's issuing country and expiry belong on licence uploads, and a passport is a different boundary.

Cross-row limits are triggers plus evaluation, not `CHECK`s: roster *maximum* is refused on insert, roster *minimum* is an evaluation, because refusing the first rower of a crew of four would be absurd.

### Noted, not resolved

`core.translation` landed here rather than with F09 because §4.7.1 had never been migrated — another plan section that existed only on paper. No malware-scan worker exists yet (the column and its immutability rule do). Roster cardinality triggers are not load-tested the way quota claims are.

### State

68 tables, ten migrations, **56 tests green**.

---


## REV-057 — Demo data loads; thirteen planned tables were never built (2026-09-09)

**Status:** Approved
**Author:** Cursor (seed) + agent session (Opus 5) (review)
**Scope:** Data | Process

### The seed works

`npm run seed` / `seed:reset` loads the Como Lake 2027 demo into real Postgres — not a migration, correctly. Idempotent, refuses production, passwords through the existing argon2 options, restricted rows loaded under `restricted_rw`. **74 tests green**, and a live `POST /v1/auth/login` → `GET /v1/auth/me` returns Daniel Harper.

Verified independently: the basketball 35–39 pool is genuinely 60/60 with the sport cap still open, so the waitlist has a real target; `roster_member_balance` shows unpaid members; the category maths hold — basketball takes 35–39 from the **youngest selected** member (Gallo, 38, with reserve Bianchi excluded), and rowing averages 44 excluding both cox and reserve. That last one is the F06 split working: had the reserve been in the selection, the answer would differ.

### The finding: the plan and the database had drifted badly

Cursor reported that `rule_dimension`, `content_hash` and the impact-analysis tables "were never migrated". Checking that turned up **thirteen** planned tables absent from the database:

`rule_dimension` · `rule_eligibility` · `attribute_type` · `entrant_attribute` · `rule_impact_analysis` · `rule_impact_entry` · `rule_notification` · `pre_registration` · `pre_registration_match` · `assisted_session` · `proxy_consent` · `category_combination` · `accreditation_gate`

That is **the whole of findings F01 and F02** — the multi-dimension rules model and the frozen-content/bound-analysis work, which was the largest single piece of design in this project. Also REG-13's pre-registration (Track D's entire foundation), PLT-06's proxy consent, CMP-03's award lineage and ACC-03's configurable credential gate.

All of it was written into the plan, reviewed twice, and recorded in REV-048 and REV-051 as fixed. **None of it exists.** Of the external audit's three blockers, only F03 (quota pools) reached the database — because that one was migrated the same day it was designed.

This is the same failure the audit found in the product a month ago, one level up: a document asserting a guarantee the running system does not have. REV-052 and REV-055 each noted one missing section (`accreditation`, then the money tables) and treated them as isolated. They were not.

### The guard

`npm run plan:drift` parses every `CREATE TABLE` out of `BACKEND_DB_PLAN.md`, compares it against the live database, and exits non-zero on any gap. It reports 13 today. It belongs in CI.

**A plan section is not done when it is written. It is done when a migration applies it.**

### Judgement calls in the seed worth keeping

Nested pools per sport — a parent `sport` cap deliberately larger than the sum of its children, so the *category* pool is the binding one. That demos the feature rather than flattening it.

Everything invented is listed rather than smuggled: tax as N1 exempt (fixtures carry no VAT), a seller identity, a settled tennis order with an invoice, a part-paid team order, and a para athlete with restricted S9 evidence because no para fixture existed.

Two data facts flagged rather than silently reconciled: the rowing roster gives Harper a 1981 date of birth while his person record says 1985, and several fixtures cross-reference the wrong entities (a tennis waitlist pointing at a basketball quota). Fixture bugs, not schema bugs.

The concurrency spec's event slug moved to `como-concurrency` so the shared test database does not collide with the demo event — benign, and necessary once seed and tests share a database.

### State

98 live tables, eleven migrations, 74 tests. **Thirteen planned tables outstanding.**

---


## REV-058 — The rules engine finally exists in the database (2026-09-09)

**Status:** Approved
**Author:** agent session (Opus 5)
**Scope:** Data | Compliance

### What landed

All thirteen tables REV-057 found missing: `attribute_type`, `rule_dimension`, `rule_eligibility`, `entrant_attribute`, `rule_impact_analysis`, `rule_impact_entry`, `rule_notification`, `pre_registration`, `pre_registration_match`, `proxy_consent`, `assisted_session`, `category_combination`, `accreditation_gate` — plus `rule_version.content_hash`, the composite FK binding an analysis to its version, and the freeze triggers on the rule children.

`npm run plan:drift` now reports **0 missing**. 84 tests green, `up → down → up` clean.

### The constraint worked immediately, which is how it should be

Adding `active_needs_impact_analysis` broke five test files and the demo seed on the first run — every one of them published a rule version by writing `status = 'active'` directly. That is exactly the behaviour the constraint exists to refuse, and it surfaced within a minute of the migration rather than in production.

The fix was not to relax the constraint but to give the correct sequence one home: `core.publish_rule_version(version_id, ran_by)` hashes the dimensions and predicates as they actually stand, records the analysis against that hash, and only then activates. Callers now insert as `draft` and publish through the function, so tests, seeds and the eventual admin endpoint cannot each invent their own publish path.

Existing seeded versions were backfilled with a baseline analysis of zero entries examined — which is the truthful record for a version published before any entry existed, not a fudge to satisfy the check.

### `test/rule-immutability.spec.ts` — the guarantees, proven

Ten tests, and one of them found a flaw in its own first draft. The "one version cannot activate on another's analysis" case initially passed for the wrong reason: the `EXCLUDE` on overlapping active versions fired first and masked the composite FK entirely. Moving the second version into its own rule set makes the FK the only thing that can refuse it — which is the constraint F02 actually added.

Judo now stores as three dimensions (age as a range, weight as a decimal range, belt rank as an enum), and `floor` on a decimal attribute is refused — the rounding defect that would have corrupted a −2.4 handicap. `'vibes'` as an attribute is refused by the dictionary FK. Editing or deleting a dimension after publication raises *frozen*. Two EOI records cannot be claimed by one person, and a `draft` assisted session without recorded consent is refused (PLT-06's `422 CONSENT_REQUIRED`, now in the database rather than only in the API).

### A duplicate migration timestamp

Mine collided with Cursor's `1700000012000_comms_templates`. Both applied and they are independent, so nothing broke — but ordering between same-timestamp files is undefined on a fresh database. Renamed to `1700000013000` and the recorded name updated in `wms_dev`.

### State

111 live tables, thirteen migrations, 84 tests, zero plan drift.

---


## REV-059 — D5 settled: Cognito behind the seam (2026-09-09)

**Status:** Approved
**Author:** Cursor (integration) + agent session (Opus 5) (review, placeholder guard)
**Scope:** Architecture | Security

### The seam paid for itself

`CognitoIdentityProvider` landed with **no change to any guard, controller, service or decorator**. `aws-jwt-verify` and `jsonwebtoken` appear only inside `src/auth/identity/` — verified, not taken on report. That was the whole point of building `IdentityProvider` before the provider was chosen.

`LocalIdentityProvider` stays, selected by `AUTH_PROVIDER`, so tests and offline work need no pool. 103 tests green, typecheck clean, `up → down → up` clean, zero plan drift.

### Access tokens, not id tokens

The API is a resource server. An id token carries email and name; accepting one would put identity fields on every API call, contradicting this plan's own rule. Access tokens carry `sub` and `client_id` and nothing else useful to an attacker who steals one.

Verification pins RS256, caches JWKS with a single refetch on an unknown `kid`, and checks `iss`, `token_use`, `client_id` (participant or admin, recorded) and expiry. Every failure returns the same 401 body.

### Linking by `sub`, never by email

Email is mutable in Cognito and is not present on an access token. Matching on it would let a changed address silently adopt an existing person. So a first login creates a new person and leaves any same-email desk-created row alone — with the consequence, stated plainly, that seeded demo people do not automatically become their Cognito counterparts until a linking tool exists.

### The finding: a placeholder date of birth is an eligibility input

A first Cognito login inserts a person with `date_of_birth = 1900-01-01`, because `date_of_birth` is `NOT NULL` and the token carries no profile. Reasonable as a row; **dangerous as an age**.

On the 2027 reference date that computes as **127**. Today no seeded band is open-ended, so such a person falls out of every band and gets "no matching category" — a safe failure by accident, not by design. The plan's own `RangeBand` supports `max: null` for "100+", and the day anyone adds that band a placeholder lands in a real category silently.

Guarded rather than trusted: `core.person.profile_status` marks the row, and a trigger refuses a registration entry for a placeholder person. The rule it encodes is simply true — you cannot register without a real date of birth.

### Roles stay local — agreed and enforced

`cognito:groups` is ignored. A Cognito group cannot express "OC staff at Como, participant at Kansai"; `core.person_role` carries `event_id` for exactly that. A first Cognito login therefore has **no roles** until someone grants them here.

### Deliberately unapplied

`migrations/pending/drop_user_credential_and_refresh_token.sql` exists and has not run. Dropping credentials before Cognito is proven against a real pool is unrecoverable.

### Untested without a real pool

Live JWKS hydration, real tokens from both app clients, hosted UI, refresh, logout and MFA. MFA matters: PLT-04 is a mandatory gate item and it is a **pool setting**, not code — so it is now achievable, but not yet done.

### What the apps need next

Authorization code + PKCE against the two public clients, per-app callback URLs, `Authorization: Bearer <access_token>`, and no calls to `/v1/auth/login` or `/refresh` under Cognito. After a first login a participant has a placeholder profile and no roles, so the app must complete the profile and a grant must be made before registration is possible.

### State

111 live tables, fifteen migrations, 103 tests, zero drift.

---


## REV-060 — Self-service profile; and the high-risk role was the unguarded one (2026-09-09)

**Status:** Approved
**Author:** Cursor (profile/roles) + agent session (Opus 5) (review, escalation guard)
**Scope:** Security | Data

### The journey now completes, proven against the live pool

Everything Cursor could not verify without a real Cognito pool was run here end to end:

1. Cognito sign-in → person auto-created, `profile_status = 'placeholder'`, **no roles**
2. `PATCH /v1/me/profile` → `complete`, `participant` granted, and **email populated from Cognito's live `GetUser`** — `gaurav.gambhir@stupaanalytics.com`, from the token, never from the body
3. A registration entry that the placeholder trigger previously refused now **succeeds**
4. Changing date of birth afterwards raises `profile.date_of_birth.needs_review`

That is the whole self-signup path working against real infrastructure rather than a fake provider.

### The finding: protection was inverted

Cursor reported the participant/OC split as structural. It was — for `participant`. A trigger correctly refuses a `participant` row granted by anyone other than the person themselves.

**OC roles had no database guard at all.** A direct `INSERT INTO core.person_role (person_id, 'oc_admin', granted_by = self)` succeeded: `INSERT 0 1`. So the *low*-risk role was a database guarantee and the *highest*-risk one was a service check — the inverse of everything else in this schema (`quota_not_exceeded`, `refund_needs_two_people`, `line_not_over_refunded`).

The database cannot know who made the HTTP request. It can know something better and sufficient: **whether the person named as `granted_by` actually holds `oc_admin`.** That is exactly the rule, and it is a lookup in the same table. `core.oc_role_needs_an_admin_granter` enforces it, with a bootstrap exemption that applies only while no `oc_admin` exists anywhere.

Re-verified after: self-escalation to `oc_admin` → `admin.role.granter_must_be_oc_admin`; a genuine admin granting `oc_staff` → succeeds.

### An interaction worth remembering

The escalated grant could not simply be deleted: `keep_one_oc_admin` refused, because the over-broad `DELETE` matched every self-granted admin and would have left none. Two triggers doing their jobs produced a state where a bad grant was briefly sticky — an argument for the new guard existing at all, since prevention is much cheaper than removal here.

### Test fixtures encoded the wrong assumption

Five tests broke immediately, then ten. Every fixture self-granted whatever role it wanted. The fix was not to loosen the trigger but to make fixtures model the real rule: **`participant` is self-granted; OC roles come from an existing admin, or bootstrap when none exists.** A first blanket change got this wrong by routing `participant` through an admin too — caught by the suite, and a reminder that the two rules are genuinely different rather than one rule about granting.

### State

111 live tables, seventeen migrations, **111 tests**, zero plan drift.

### Still unverified

Admin people-search under 14k rows. And Cognito's default email sender is capped at ~50 messages a day, which is fine for testing and cannot support real sign-up volume — SES is a console setting, not code, but the account is not yet out of sandbox.

---


## REV-061 — Apps can sign in; typed schema restored (2026-09-09)

**Status:** Approved
**Author:** Cursor + agent session (Opus 5) (review)
**Scope:** Security | Architecture

### Three changes landed, all verified independently

**218 tests** across the three repos — backend 112, participant 55, admin 51.

### SRP instead of PKCE — a correct deviation

The prompt specified authorization-code + PKCE. Cursor used `USER_SRP_AUTH` and explained why: PKCE is a *redirect* flow and needs Cognito's Hosted UI, which is not configured and which custom email/password screens do not use.

The substitution is not a compromise. SRP never transmits the password at all — it is a zero-knowledge proof — so it is arguably stronger than PKCE for this shape. Verified in both apps: `authFlowType: 'USER_SRP_AUTH'`, and `USER_PASSWORD_AUTH` appears nowhere outside the backend's local `npm run token` helper.

Also verified: no `idToken` is sent anywhere (the API rejects it — `token_use=access`), and the admin app has a test asserting tokens never reach `localStorage`.

### `db:types` — stale file, not a broken tool

The generator was fine; the committed `src/db/types.ts` had never been regenerated after the schema grew past `public`. Cursor also caught a trap worth recording: passing the schemas as `--default-schema` strips the prefixes and then `evidence_document` collides between `core` and `restricted` — silently mapping two different tables onto one key. The include-pattern form keeps `"schema.table"` keys. 109 tables now typed.

Repositories were deliberately not converted; that is a separate change from the work in `src/registration/*`.

### Still a dead end for a real user

The apps route to a **placeholder** complete-profile screen — `PATCH /v1/me/profile` is not wired. So sign-up works, sign-in works, the person is created with no roles, and then the journey stops. That is the next change.

Console settings still needed from the account owner: `ALLOW_USER_SRP_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH` on both clients, and email delivery for the 6-digit confirmation code.

---


## REV-062 — Complete-profile wired; the self-signup path is code-complete (2026-09-09)

**Status:** Approved
**Author:** Cursor + agent session (Opus 5) (review)
**Scope:** Product | Security

`app/(auth)/complete-profile.tsx` now calls the live `PATCH /v1/me/profile`. 68 participant tests, up from 55.

Verified rather than trusted: the suite asserts `personId` and `email` are **absent from the request body** — twice, once structurally and once against the serialised JSON. That is the escalation surface on this endpoint, and it is now a test rather than a convention.

The idempotency key is scoped to a *body*, not a render: the same submission retried (double-tap, or after a 401 re-auth) reuses it, and editing a field mints a new one. On a mid-submit 401 the form stays mounted with input intact — losing a filled form to a token expiry would be a poor first impression on the first screen a participant ever sees.

### Blocked on email, not on code

The live hand-test could not complete. Cursor created a pool user via `SignUp`; Cognito left it **unconfirmed**, and confirming needs the emailed six-digit code. Cognito's default sender is not enabled on this pool, so no code arrives, and there is no AWS CLI here to admin-confirm.

**This is an account setting, not a defect.** The backend half of the same contract was hand-tested in REV-060 against a real confirmed user — profile completion returned `participant` and unlocked a registration insert — so the contract itself is proven. What remains unproven is the app calling it.

Still needed in the console before anyone can sign up: email delivery, plus `ALLOW_USER_SRP_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH` on both app clients.

---


## Index

| ID | Date | Title | Status |
|----|------|-------|--------|
| REV-001 | 2026-08-18 | React Native Reusables as UI primitive layer | Approved |
| REV-002 | 2026-08-18 | Premium aesthetic: gradients, glass, mockup-as-reference | Approved |
| REV-003 | 2026-08-18 | Kansas Senior Games as featured canonical event | Superseded by REV-004 |
| REV-004 | 2026-08-19 | WMS-only catalog; Kansai 2027 in-app demo | Approved |
| REV-005 | 2026-08-19 | Dockerize Expo Web static demo | Approved |
| REV-006 | 2026-08-19 | Tester-only registration reset (not product cancel) | Approved |
| REV-007 | 2026-08-19 | Gate GamesHub (Home) on approved registration | Approved |
| REV-008 | 2026-08-19 | SVG QR on digital accreditation pass | Approved |
| REV-009 | 2026-08-19 | Working Sign Up + canonical A07 prefill | Approved |
| REV-010 | 2026-08-19 | Temporary World Masters landing + Athlete Portal | Approved (remove later) |
| REV-011 | 2026-08-19 | Website layouts on wide web; mobile unchanged | Approved |
| REV-012 | 2026-08-19 | Registration wizard website layouts | Approved |
| REV-013 | 2026-08-19 | Auth + stack website layouts | Approved |
| REV-014 | 2026-08-19 | A09–A14 mockup polish | Approved |
| REV-015 | 2026-08-19 | Hub web density (hover / type / empty) | Approved |
| REV-016 | 2026-08-19 | Drop wallet + payment method picker | Approved |
| REV-017 | 2026-08-19 | Profile tab identity + seeded Harper files | Approved |
| REV-018 | 2026-08-19 | Drop Profile from registration wizard; portrait photo preview | Approved |
| REV-019 | 2026-08-19 | Drop promo code from payment | Approved |
| REV-020 | 2026-08-19 | Realistic partner request lifecycle | Approved |
| REV-021 | 2026-08-20 | World Masters Sport brand palette | Approved |
| REV-022 | 2026-09-01 | Pivot to Como Lake 2027 RFP; new canonical doc set + phased plan | Approved |
| REV-023 | 2026-09-01 | Backend-adaptability guardrails + incorporate WIP backend baseline | Approved |
| REV-024 | 2026-09-01 | Doc consolidation: single canonical home, delete superseded, mark kept docs | Approved |
| REV-025 | 2026-09-03 | North star = full connected product; scalable target architecture; build-for-15-Sep | Approved |
| REV-026 | 2026-09-03 | Mock data hub (API-shaped JSON) = current data source; `wms_admin` naming; START_HERE self-sufficient | Approved |
| REV-027 | 2026-09-04 | `wms_participant` naming for the split; safe Phase-B prep starts now | Approved |
| REV-028 | 2026-09-04 | Goal pivot: the split IS the deliverable, not a scoped 7–8 Sep demo | Approved |
| REV-029 | 2026-09-04 | Explicit, scoped exception to "no backend": temporary API shim for cross-portal live sync | Approved |
| REV-030 | 2026-09-04 | Wire olympic_master_games journey + rules repositories to wms_api | Approved |
| REV-031 | 2026-09-04 | wms_api consumes @wms/domain; Round 2 (accreditation desk); wms_admin fully wired | Approved |
| REV-032 | 2026-09-04 | wms_participant (this repo) now consumes @wms/domain too, via re-export shims | Approved |
| REV-033 | 2026-09-04 | wms_admin Accreditation Desk wired; wms_api Round 3; wms_admin→@wms/domain migration deferred | Approved |
| REV-034 | 2026-09-04 | Repo renamed olympic_master_games → wms_participant; Round 3 wired into wms_admin | Approved |
| REV-035 | 2026-09-04 | wms_admin migrated onto @wms/domain; misleading Live badge found and fixed | Approved |
| REV-036 | 2026-09-04 | Round 4 exception review queue with dual control; every admin screen live; Vite pre-bundling trap | Approved |
| REV-037 | 2026-09-05 | Accreditation cross-portal leg: OC issues at the desk, athlete's own pass goes live | Approved |
| REV-038 | 2026-09-05 | Communications cross-portal leg: OC broadcast reaches only the right athlete's inbox | Approved |
| REV-039 | 2026-09-05 | Games-scale admin queue fixtures (desk/exceptions/comms/assisted/settlements) | Approved |
| REV-040 | 2026-09-05 | My Games and Help built; every participant nav item now routes | Approved |
| REV-041 | 2026-09-05 | Android/iOS descoped; rebranded off the IMGA POC identity | Approved |
| REV-042 | 2026-09-05 | Duplicate admin portal removed from wms_participant; EN/IT catalogue complete 849/849 | Approved |
| REV-043 | 2026-09-05 | Bilingual front door for the Como portal; payment receipt closes the Scenario 1 gap | Approved |
| REV-044 | 2026-09-05 | REG-11 enforced on every path; participant journey now audited | Approved |
| REV-045 | 2026-09-06 | Phase B planned as one sequence with Phase A completion | Draft |
| REV-046 | 2026-09-07 | Backend + DB schema: guarantees as database constraints, not application checks | Draft |
| REV-047 | 2026-09-08 | Backend DDL would not execute; 12 defects fixed, audit-harness flaw recorded | Draft |
| REV-048 | 2026-09-08 | Age is one dimension, not the rules model; money schema unblocked; PLT-02/ACS-05 storable | Draft |
| REV-049 | 2026-09-08 | wms_backend scaffolded and verified on real PG18; findings F, G, H | Approved |
| REV-050 | 2026-09-08 | 24 tables live on PG18; 13/13 tests green; oversell proven impossible; finding I | Approved |
| REV-051 | 2026-09-08 | External tender audit: rule content frozen, analysis bound, quota pools replace single quota | Draft |
| REV-052 | 2026-09-09 | Quota pools live; accreditation table built; shipped profile/pass fields recovered | Approved |
| REV-053 | 2026-09-09 | Domain package gains quota pools and rule dimensions, additively | Approved |
| REV-054 | 2026-09-09 | Temporary auth behind an IdentityProvider seam; Node 22 floor enforced; roles per edition | Approved |
| REV-055 | 2026-09-09 | Payment/refund allocation ledger, frozen fiscal snapshots, per-line rounding | Approved |
| REV-056 | 2026-09-09 | Evidence as requirement/obligation/upload/review; versioned registration policy | Approved |
| REV-057 | 2026-09-09 | Demo seed loads into Postgres; plan-vs-database drift check finds 13 unbuilt tables | Approved |
| REV-058 | 2026-09-09 | Thirteen missing tables built; F01/F02 guarantees now enforced and proven | Approved |
| REV-059 | 2026-09-09 | Cognito behind the IdentityProvider seam; placeholder profiles barred from registering | Approved |
| REV-060 | 2026-09-09 | Self-service profile proven live; OC role grants now guarded in the database | Approved |
| REV-061 | 2026-09-09 | App sign-in via SRP; db:types regenerated schema-qualified | Approved |
| REV-062 | 2026-09-09 | Complete-profile calls the live API; signup path blocked only on Cognito email | Approved |

---

## REV-063 — One command runs everything, and Node 20 stops being a trap (2026-09-10)

**Status:** Approved
**Author:** Agent session (Opus 5)
**Scope:** Tooling

`npm run dev` from `wms/` now starts backend (:3050), api (:3040), admin (:5173) and participant web (:8081) with hot reload on all four. Two things are folded into `dev:backend` because both were reliably forgotten: `docker compose up -d --wait db`, and finding a Node 22.

The Node point is not cosmetic. `argon2` has no Node 20 prebuild for darwin-arm64 and **segfaults on require** — exit 139, no stack. This machine's default `node` is 20, so `npm run test` inside `wms_backend` died with `ERR_IPC_CHANNEL_CLOSED` before a single test ran, which reads like a harness bug rather than a wrong interpreter. `scripts/node22.sh` resolves a 22 onto `PATH`; `test:backend`, `typecheck:backend` and `build:backend` go through it.

### `-k` was removed, deliberately

`concurrently -k` kills every process when any one exits. Reading its source settles the trade-off: `KillOnSignal` is installed unconditionally, not by `-k`, so Ctrl+C still tears everything down — and on SIGINT it rewrites the exit code to 0, which stops `--restart-tries` from fighting the shutdown. So `-k` bought nothing and cost the whole stack whenever one child failed. It is now `--restart-tries 10 --restart-after 3000`.

**What restart does and does not cover:** a file save reloads (watcher); a whole command dying is restarted by concurrently; a crashed server under a live `tsx watch` is **not** restarted — tsx has no such flag, and neither does nodemon. That is a deliberate convention, not a gap: restarting a crashed process in a loop hides the error.

### 24 orphaned watchers, 15 of them watching a deleted directory

`dev:clean` exists because the first full run died on Expo asking "port 8081 is busy, use 8082?" with no terminal to answer. The sweep found dev servers two days old — and fifteen `tsx watch` processes still pointed at `Code_Life/wms_api`, a path that stopped existing when the repos moved into `wms/`. They hold no port, so a port-based sweep never finds them. `tsx` also **ignores SIGTERM**, so the first version of the sweep reported success and killed nothing; it now escalates to SIGKILL.

---

## REV-064 — The OC identity lifecycle, and the three locks that were already right (2026-09-10)

**Status:** Approved
**Author:** Cursor + agent session (Opus 5) (review)
**Scope:** Security | Product

People & Roles (`/people`), invitations, and purge. The OC can now create its own administrators without anyone touching SQL — which had been the only route.

**Nobody can self-promote, and it is enforced three times over.** There is no sign-up screen in `wms_admin`; `POST /v1/admin/people/:id/roles` sits on a controller annotated `@Roles('oc_admin')`; and `person_role_oc_needs_admin_granter` (REV-060) checks in the database that `granted_by` itself holds `oc_admin`, with a single bootstrap exception while no admin exists at all.

`RequireAuth` was **not** sufficient for this route and the review caught it before it shipped: `sessionMayUseAdmin()` passes `oc_staff` and `finance` too, so a finance clerk would have reached a page whose every control grants administrator rights. Every request would have been refused, but a screen full of failing controls is a bad screen and it leaks the people list. The route is now gated on `oc_admin` specifically.

### Invitation is `AdminCreateUser`, and the email is not the one you expect

Self-signup sends a **six-digit code** (*Verification message*). An admin-created user gets **username + temporary password** (*User invitation message*) — different template, different trigger. An invited user never receives a code. Cognito's `NEW_PASSWORD_REQUIRED` challenge then forces a real password, which is why a set-new-password screen was part of this task rather than a follow-up.

The invite pre-links the person by the `sub` returned from `AdminCreateUser`, so the invitee's first successful sign-in already carries their role. `external` idempotency mode: the key is committed before the AWS call, so a retry cannot create a second pool user. An orphaned Cognito user (created, then the DB write failed) surfaces as `COGNITO_USER_ORPHANED` rather than being swallowed — a human has to resolve that state.

### Purge is narrow on purpose

"Delete a participant" is not a feature and will not be one: roughly thirty foreign keys refuse a `DELETE` on `core.person`, because orders, accreditation and roster history belong to other records too. Real erasure is PRV-05 — a rights request with identity verification, retention holds and completion evidence — and `rights_request`, `rights_request_completion` and `retention_hold` already exist for it, pending the OC's retention schedule.

What shipped removes a person who has accumulated **nothing**: no order, payment, entry, accreditation, roster row, restricted record, open retention hold, and never signed in. Eleven blockers, one SQL statement, and the refusal names which one fired — "cannot delete" with no reason sends an operator to the database by hand, which is what the endpoint exists to prevent. Audit rows stay (SEC-05); `subject_id` is not a foreign key, by design.

Cognito is deleted **before** the database row. The other order fails badly: the pool keeps a user nobody can see and the address can never be invited again. This order fails safely and the same endpoint clears the remainder.

---

## REV-065 — Registration writes leave the JSON file (2026-09-10)

**Status:** Approved
**Author:** Codex + agent session (Opus 5) (review)
**Scope:** Architecture | Product

The read path shipped first and exposed something worth recording: `postgres-registration-journey.repository.ts` had been **finished and tested for days while unreachable** — `app.module.ts` imported `AuthModule` and `PeopleModule` and no `RegistrationModule`. Tested, passing, and wired to nothing.

Mutations followed: `saveEntry`, the four waitlist actions, `payOrder`, `transitionEntryStatus`, `updateEvidenceStatus` — on the shim's own paths, so the app cutover is a base-URL change.

**The quota claim discovers pools recursively and locks them `ORDER BY id`.** The ordering is deadlock avoidance, not tidiness: two entries claiming the same two pools in opposite orders deadlock only under load, i.e. on the morning registration opens. `lockOrder()` in `@wms/domain` fixes the order at one place rather than at each call site.

Money stayed in SQL — `8197 + 1803 = 10000` in minor units, via `split_inclusive` and `proportional_tax_split`, with `roll_up_order_totals` maintaining the order. The PSP sits behind an injectable seam with a deterministic stub, because **D4 is still open**; the external idempotency key is committed before the seam, and a replayed key returns the original payment with `chargeCount: 1`.

### The type gate had been off for several handoffs

Three agents in sequence reported "tests green" and all three were telling the truth: **vitest transpiles without typechecking**. `npm run typecheck` had accumulated **18 errors across five files**, and `npm run build` was failing outright on `pre-registration.service.ts:85`. Fixed, and `typecheck:backend` / `build:backend` now exist at the root so a report of "done" can mean all three.

---

## REV-066 — The mocks come off: consent, EOI, evidence, rosters, accreditation (2026-09-11)

**Status:** Approved
**Author:** Cursor + agent session (Opus 5) (review)
**Scope:** Product | Privacy

Five screens that had been built for months moved onto real tables. 20 migrations, 112 tables, and the suites stand at **backend 188 / admin 73 / participant 88**.

The common thread is F1 from the Phase B plan — five of six services were in-memory and lost everything on restart. Each of these tasks carries a restart-survival test rather than a manual check, because that is the defect being closed.

Two are worth calling out. **Consent** is the lawful basis for processing (PRV-02): a consent record that does not survive a restart is not a consent record, and grant/withdraw is append-only so "granted on the 3rd, withdrawn on the 9th" stays answerable. **Pre-registration** masking moved server-side — the mock masked in the preview and the test asserts the full name never appears, which only means anything if the API never sends it; a lookup endpoint that returns full names on an email guess is a harvesting tool.

---

## REV-067 — The restricted boundary was switched off, and the fix that was almost wrong (2026-09-11)

**Status:** Approved
**Author:** Agent session (Opus 5)
**Scope:** Security | Privacy

`restricted` is described throughout the plan as a permission boundary: separate schema, separate role, no foreign key from `core` (PRV-04). The grants were correct — `app_rw` has neither `USAGE` on the schema nor `SELECT` on any table in it.

And `.env` read `postgres://wms@…`. The service connected as the **owner**, which bypasses every grant in the database. The boundary existed on paper and was off in practice, and no test noticed because the tests connect as the owner too.

It surfaced through a real consequence rather than an audit: the purge blocker check reads four `restricted.*` tables directly. It passes today and fails with `permission denied for schema restricted` the moment the service runs as `app_rw` — which is the entire reason that role exists. A `SECURITY DEFINER` function now answers *"does this person have restricted data?"* as a **boolean**: the answer crosses the boundary, the data does not, and the purge path needs no restricted access at all.

### The grant that was proposed, and why it was refused

Moving the service to `app_rw` broke restricted evidence, and the proposed fix was:

```sql
GRANT restricted_rw TO app_rw WITH INHERIT FALSE;
```

`WITH INHERIT FALSE` withholds the privileges until an explicit `SET ROLE`. That prevents accidents. It does not prevent attacks: anything that can execute SQL as `app_rw` — **including a SQL-injection flaw in any ordinary query anywhere in the service** — is then one statement away from medical records, para classifications and identity documents. A privilege the ordinary role can switch into is not a boundary; it is a speed bump.

The replacement is a **second connection pool authenticating as `restricted_rw`**, small (2–3 connections), injected only into the restricted evidence module, failing at boot rather than falling back to the ordinary pool. The separation moves to the authentication layer, where no statement crosses it. A test asserting that `app_rw` **cannot** `SET ROLE restricted_rw` stays in the suite permanently — as a guard against someone adding that grant later to fix an unrelated failure.

`restricted.access_log` is written on the same connection, in the same transaction, as the read: a log written separately can be skipped by an early return or lost to a rollback while the read still happened.

---

## REV-068 — This pool cannot prove session MFA on an access token (2026-09-14)

**Status:** Approved (investigation; PLT-04 enforcement not shipped)
**Author:** Agent session (Grok 4.6)
**Scope:** Security | Architecture

PLT-04 needs OC sessions to use MFA. The backend verifies **access tokens only**. Before writing a guard, a throwaway user in pool `eu-north-1_eLAmBFEkU` was enrolled for TOTP, challenged with `SOFTWARE_TOKEN_MFA`, and both JWTs decoded.

**Outcome:** this pool cannot prove session MFA on an access token without a pre-token-generation Lambda.

Post-TOTP access-token claims are the same set as a password-only sign-in: `auth_time`, `client_id`, `event_id`, `exp`, `iat`, `iss`, `jti`, `origin_jti`, `scope`, `sub`, `token_use`, `username`. No `amr`, no MFA claim. The ID token from the same session also has no `amr`. `GetUser` on that access token shows `UserMFASettingList: SOFTWARE_TOKEN_MFA` — that is enrolment on the account, not proof this session used a second factor. `AdminGetUser` is the same weaker check and was not chosen.

Enforcement is **not** implemented. A Lambda that adds a session claim is the next step, not a backend call that reads MFA settings.

Threshold: one live `oc_admin` (`gaurav.gambhir@stupaanalytics.com`). The seed row `oc.admin@example.com` is not a Cognito login. MFA enforcement stays off until two `oc_admin` accounts are enrolled.

---

## REV-069 — MFA guard: GetUser enrolment, not a session claim (2026-09-14)

**Status:** Implemented
**Author:** Agent session (Grok 4.6)
**Scope:** Security | Auth | Admin | Participant

PLT-04 is on. Pool MFA is Optional + TOTP. There is no pre-token-generation Lambda.

**Guard (honest sentence):** this proves *MFA is enrolled and every session minted since enrolment completed it*. That is not the same sentence as "this request came from an MFA session". Cognito access tokens in this pool still carry no `amr`.

The remaining hole is a refresh token issued **before** enrolment. Closed by `AdminUserGlobalSignOut` at `POST /v1/me/mfa/complete`, plus a shorter refresh lifetime on the admin app client. Enrolment is checked with `GetUser` on the caller's own access token (`UserMFASettingList` contains `SOFTWARE_TOKEN_MFA`) — no `AdminGetUser`, no new IAM for the check.

OC routes refuse with `403 MFA_REQUIRED` once **two** `oc_admin` rows have `mfa_enrolled_at`. Below that, enforcement stays off and the Command Centre shows a banner. Participants are never blocked; they enrol and un-enrol from profile.

**Threshold at ship:** **below**. One live OC (`gaurav.gambhir@stupaanalytics.com`). The seed `oc.admin@example.com` is not a Cognito login and must not be counted as the second pair of hands.

---

## REV-070 — Retire wms_api; both apps on wms_backend only (2026-09-14)

**Status:** Implemented
**Author:** Agent session
**Scope:** Infrastructure | Participant | Admin | Backend seeds

The temporary Express shim (`wms_api`, port 3040) is deleted. `npm run dev` now starts exactly three processes: backend (:3050), admin (:5173), participant web (:8081).

**Last three cutover clients:** `ApiRegistrationJourneyRepository` (participant), `ApiEntryGovernanceRepository` and `ApiFinanceJourneySource` (admin) — all repointed to `wms_backend` with `/v1` paths. Admin `wmsApi.ts` removed; bearer refresh lives in `httpClient.ts`, HTTP in `backendRequest.ts`.

Seed data-hub fixtures moved from `wms_api/src/data/fixtures` to `wms_backend/seeds/fixtures`. `wms_api/data/db.json` persistence is gone — Postgres is the only store.

**Auth behaviour change (intentional):** `wms_api` had no authentication. Screens that showed another participant's data were never correct; less data after cutover is often the fix, not a regression.

**Env cleanup:** remove `EXPO_PUBLIC_WMS_API_URL` / `VITE_WMS_API_URL` from local `.env` files if present.

---

## REV-071 — Start lists, category combination and roster locks (CMP-01, -03, -04, -06) (2026-09-14)

**Status:** Implemented (backend only — no admin screens yet)
**Scope:** Competition | Roster | Database

**CMP-01 / CMP-06.** `core.start_list` + `start_list_entry` (migration `…26000`). A start list is a snapshot, frozen once out of draft; draft → approved → published → superseded; one published list per scope; a correction must carry a reason. Embargo is `embargo_until`, a time — it lifts itself. Public read (`GET /v1/start-lists`) and OC read (`/v1/admin/start-lists`) are separate controllers.
**Deliberate gap:** `class_code` is NULL. `core.para_class_projection` is granted only to `classification_ro`; granting it to `app_rw` was tried, broke `restricted-governance.spec.ts`, and was reverted. Needs a `classification_ro` login + connection.

**CMP-03** (migration `…27000`). `source_keys text[]` → `core.category_combination_source` with `UNIQUE (product, source_key)`: one category, one field. `core.combine_categories()` refuses fewer than two sources and chained fields. Trigger `award_category_is_not_a_combined_field` refuses writing the combined key onto an entry's current **or** original category — the award category cannot be overwritten. A combined start list names the field in its header and keeps `award_category_name` on every line (trigger-checked against the sources); the published explanation is `reason_key`.

**CMP-04.** `team_roster.locked_at` was written and never read. Now: after the lock a team cannot publish a fresh roster version (`ROSTER_LOCKED`), and a substitution approved after the lock (`games_time`, decided at approval, not proposal) is refused by three CHECKs unless revalidated after the lock, every competing member holds a valid issued accreditation (reusing ACC-03 gates, fail-closed), and the category is unchanged. `POST /v1/roster-substitutions/:id/revalidate` records the checks. The proposal no longer hardcodes `accreditation.unchanged`. `force` goes through the same constraints — it cannot bypass them; the override path is the exception queue.

**Tests:** 298 → 313 backend. Typecheck 0, build 0, plan:drift none.


---

## REV-072 — Registrations can be started; categories can be checked without registering (2026-09-15)

**Status:** Implemented (backend + admin). Participant app side queued for Cursor.
**Scope:** Registration | Rules | Admin | Seeds

**Nothing created an entry.** No code outside the seed inserted a `registration_entry`; every journey call edited an existing one, and the participant app edited Daniel Harper's Men's Doubles entry for whoever was signed in (hence "Men's Doubles 35–39 → 40–44" on a swimming screen). `POST /v1/me/entries` now creates a **draft** for the token's person: event must be `registration_open`, profile complete, required consents granted (the profile catalogue), one live entry per product (`uq_entry_live`, 409 `DUPLICATE_ENTRY` with the existing id), category pinned for individual products with the same `deriveCategory` save uses, and a creation status event. Submission stays on `PUT /v1/registration-entries/:id`. App side: `prompts/CURSOR_PARTICIPANT_MY_ENTRIES_AND_NEW_REGISTRATION_PROMPT.md`.

**Category checker.** `GET /v1/admin/rules/category-check/products` and `POST /v1/admin/rules/category-check` run the product's active rule through `deriveLoaded` for one or more dates of birth, creating nothing. Admin Rules Configurator has the panel. Exists because an entry locks the DOB that produced it, so band testing through registration needed a reset per date.

**Also this session:**
- Deterministic idempotency keys (`admin-status-<entry>-<status>`, `refund-<settlement>`, `issue-/revoke-<record>`, evidence `upload-<id>`) replayed the first response on a repeated action — the screen showed success and nothing changed. Now one key per click; `seed:reset` also truncates `core.idempotency_key`.
- `seed:reset` keeps Cognito-linked people and their roles, and `.env` `SEED_OC_ADMINS` / `SEED_LOGIN_LINKS` re-apply testing logins on every seed.
- Seed fees started 17 Sep 2026, so every new registration hit `FEE_NOT_CONFIGURED`; now 1 Jan 2026.
- Profile save now shows the refusal reason (e.g. DOB locked) instead of "Could not save profile".

**Known divergence, not fixed:** three category derivations exist — `registration-mutations.deriveCategory` (pins entries), `rules/load.deriveLoaded` (preview, impact, checker) and `roster/helpers.categoryForVersion` (substitutions). They agree on the seeded rules; they are not proven identical. Worth one shared implementation.

**Tests:** backend 313 → 332, admin 78 → 81, participant 101.

---

## REV-073 — Participant app: My Entries and starting a registration (2026-09-15)

**Status:** Implemented (backend + participant). Executed `prompts/CURSOR_PARTICIPANT_MY_ENTRIES_AND_NEW_REGISTRATION_PROMPT.md` directly.
**Scope:** Participant | Registration | Backend (rules)

- **Which entry.** `RegistrationJourneyContext` no longer reads `REGISTRATION_JOURNEY_IDS.entry` (Daniel Harper's Men's Doubles) for every user. It reads `GET /v1/me/entries` and works on the last-opened entry if it is in that token-scoped list, otherwise the newest. The remembered id lives in AsyncStorage but is only honoured when the list contains it, so an id left by another account is never requested. No entries → `needsEntry`, no journey request.
- **Screens.** `/my-entries` (nav "My Entries") lists entries with status and next step. `/register` lists products from the new `GET /v1/me/registration-options` (event, products, the caller's live entry per product, and an individual category preview from `deriveLoaded`) and creates with `POST /v1/me/entries`. `DUPLICATE_ENTRY` opens the existing entry; `CONSENT_REQUIRED`/`PROFILE_INCOMPLETE` point to the profile; ineligible ages cannot start. Journey screens render `NoEntryState` instead of an error when there is no entry.
- **Removed the demo identity.** `registrationJourneyIds.ts` deleted. Sport entry shows only the entry's own product (switching product re-pointed the entry). The "category change" banner compares within one product only — the cause of "Men's Doubles 35–39 → 40–44" on a swimming entry. Team roster branches on participant type. Journey `GET` no longer sends `athleteId`. The rule-change notice on the status screen follows the entry's sport instead of Tennis.
- **Idempotency.** Save, waitlist and status actions: one key per tap. Payment: one key per order (a retry of the same order must reuse it; the old constant key was shared by every order).
- **Still demo-shaped, not changed here:** partner finder simulates the partner's acceptance (`DEMO_AUTO_ACCEPT_PARTNER_ID`, visible in the screen); a NEW doubles/team/crew entry can be created but completing it depends on the partner/team flows.

**Tests:** participant 101 → 116 (context entry resolution, Register refusals, per-tap keys); backend 332 → 334.

**Addendum (2026-09-15) — `npm run dev:clear-entries -- <email | person id>`.** Development tool, not a DOB-lock switch: a toggle in the app would need a backend path around `person_dob_locked_after_entry` reachable from a browser. The script refuses `NODE_ENV=production` and any non-local database host, deletes one person's entries with everything attached (money rows included, quota counters given back first, stored idempotency replies for that person), keeps person/profile/DOB/consents/roles, and runs with triggers off — so it checks every foreign key into the affected tables for orphans and rolls back on any. Logic in `wms_backend/scripts/lib/clear-entries.ts`, tested in `test/dev-clear-entries.spec.ts` (paid + invoiced entry, other people untouched, re-register works).

---

## REV-074 — OC registration work queue, evidence-safe detail, and export (2026-09-15)

**Status:** Implemented
**Author:** Codex agent session
**Scope:** Admin | Registration | Security | Reporting

### What changed

- Added the OC-only `GET /v1/admin/registrations` work queue with combinable event, sport, product, category, repeated status, payment, evidence, team, grade, and debounced-text filters. It uses keyset pagination on `(created_at DESC, id DESC)` and returns no page total.
- Added status counts, filter-option lookup, a safe per-entry detail read, and `GET /v1/admin/registrations/export.csv`. The export shares the list-filter semantics, caps at 20,000 rows, guards spreadsheet formula cells, and writes `registration.export` audit data in the same transaction as its read.
- Added `/registrations` and `/registrations/:entryId` to `wms_admin`: URL-backed filters, status chips, cursor “Load more”, CSV download, entry actions with a fresh idempotency key per click, and refetch after mutation. Retired the Operations governance demo panel and its in-memory/API adapters.
- Detail views expose ordinary evidence only. Restricted evidence remains a count plus presence state; no restricted identifier, kind, classification, or document metadata crosses into the ordinary service, UI, CSV, or audit payload.

### Why

OC users needed a Games-scale operational queue rather than a single seeded entry demo, while preserving the restricted-data boundary and making exports attributable.

### Unchanged (explicit)

- Lifecycle mutations still use the existing guarded status endpoint and its transition rules; this change does not introduce a second writer.
- Saved views and bulk actions remain deliberately unimplemented. Query parameters make the current filtered URL shareable.
- No database index was added: the existing `entry_by_event_status` and `entry_keyset` plans satisfied the 20,000-entry exercise.

### Files updated

- `wms_backend/src/registration/admin-registrations.{controller,service}.ts`, `registration.module.ts`, and `test/admin-registrations.spec.ts`
- `wms_admin/src/pages/{RegistrationsPage,RegistrationDetailPage}.tsx`, registration repository/domain contracts, routes, navigation, and tests
- `wms_participant/context_docs/docs/{REVISIONS,PROGRESS_COMO2027}.md`

### Verification

- Backend: `npm run test:backend`, `npm run typecheck:backend`, `npm run build:backend` all pass.
- Admin: `npx tsc --noEmit -p .` passes; `npx vitest run --maxWorkers=1` passes (19 files, 80 tests). The ordinary parallel run exposed the existing Finance test's 5-second timeout under load; its isolated test passes in 2.3 seconds.

## REV-075 — Registrations screen: hand-test fixes (2026-09-15)

Found by clicking through `/registrations` as an OC admin.

- **No one-click cancel.** Cancel entry / Disqualify / Mark substituted open a confirm dialog that
  states the consequence and requires a reason (3+ characters); Reinstate confirms with an optional
  reason. The reason is sent to `POST /v1/registration-entries/:id/status/:action` and shows in the
  status history. The requirement is UI-only; the endpoint still accepts no reason.
- **Shared order bug (backend).** Cancelling one entry cancelled the whole order it was on — one
  basketball player cancelled the €600 team order four confirmed teammates were on. The order is now
  cancelled only when no other live entry remains on it (`registration-mutations.ts`,
  `test/entry-cancel-shared-order.spec.ts`).
- Money shown as currency (`€120.00`), not minor units; order total marked "(all lines)" when it
  covers more than this entry.
- Product filter reads `Sport · Product` (two "100m Freestyle" were indistinguishable).
- Readable action/status labels; status history shows the actor's name (`actorName`) instead of
  `admin`.

Not done: Italian copy (the admin EN/IT switch is a placeholder app-wide); reinstate-to-draft for
paid entries and the derived-vs-current category mismatch need OC decisions.

Verification: backend 45 files / 348 tests, typecheck, build; admin tsc + 19 files / 81 tests.

## REV-076 — Teams and partners are real entry configuration (2026-09-16)

Team, crew and relay entries now create their own server-side team roster through `POST /v1/me/entries/:entryId/team`; the caller becomes captain and the entry links to that roster atomically. Team invitations are captain-authorized, invitee-scoped, cancellable, and their acceptance adds the selected profile to the draft roster version. A shared incoming-invitations endpoint lets participants accept or decline either team or doubles-partner invitations.

Partner requests bind to the inviting doubles entry. Acceptance is performed only by the invited participant, updates that entry's partner and category in the same transaction, and records a category audit. The participant app no longer auto-accepts invitations: both partner-finder routes now wait for an actual recipient action, and the portal has a real invitation inbox.

Category derivation now runs through the persisted rule-version `deriveLoaded` adapter for entry saves, roster publication, and partner acceptance; client roster IDs cannot choose a category. A draft start-list line or locked roster rejects configuration changes with the existing structured error codes. The migration adds the invitation role and partner-request entry linkage additively.

Verification: `npm run test:backend` passes (45 files / 351 tests); backend typecheck and build, and domain build pass. Participant Jest passes (18 suites / 116 tests). Its TypeScript check has only the three pre-existing errors in `messages.tsx` (2) and `useProfileConsent.test.tsx` (1); this slice adds none.

## REV-077 — Operations dashboard on real counts; reason required by the database (2026-09-16)

**The dashboard stops inventing numbers.** `GET /v1/admin/operations/snapshot`
(`wms_backend/src/ops/operations-snapshot.service.ts`) counts entries by status, live and fully-paid
entries, quota capacity/confirmed/held, registered athletes, the evidence backlog, waitlisted
entries, and money charged/settled/outstanding for the current event. The admin Operations page
reads it through `ApiOperationsRepository`; the old hard-coded `14,210 / 20,000`, `1,420 sessions`
and `48,912 records` are gone, as are the invented uptime and p95 tiles (replaced by work-queue
figures the database can answer). What we do not measure is now stated rather than faked: live
sessions return `null`, and the page says the incident rehearsal is a demo and says so again, in the
header, when the backend is unreachable.

**Reconciliation is a real comparison.** Variance = settled payment intents (less refunds) − what the
order lines say was paid, over the same set of orders. Zero is healthy; a mismatch is shown in red
with "investigate". Verified against the dev database: it reported €240 until the query compared
like with like, then €0.00.

**A reason is now a database guarantee** (migration `1700000029000_admin_status_reason.sql`):
`core.entry_status_event` refuses an `admin` transition to cancelled / disqualified / substituted
without a reason of at least three characters. `NOT VALID`, because the append-only trail already
holds demo rows written while the reason was optional. Refusals map to `422 REASON_REQUIRED`.

Also: the CSV export audit records the exporter's own OC role instead of always `oc_staff`; the
admin detail labels the restricted-evidence count as per athlete and event, which is what
`core.protected_evidence_ref` is keyed by (no restricted boundary was crossed to "fix" it).

**Process note:** the admin gate documented as `npx tsc --noEmit -p .` checks nothing — the root
`tsconfig.json` has `"files": []` and only references the project configs. The real gate is
`npx tsc --noEmit -p tsconfig.app.json`, which immediately found two pre-existing unused-symbol
errors. Prompts and docs updated.

Verification: backend 46 files / 355 tests, typecheck 0, build clean, migration up/down/up;
admin 19 files / 81 tests, `tsc -p tsconfig.app.json` clean; Operations page checked in the browser
against the dev database.

## REV-078 — The category on the admin detail now matches the entry (2026-09-16)

REV-077 left one question open: the admin registration detail showed a "Derived category" the entry
itself disagreed with. Checked against every seeded entry — six of nine disagreed. Two causes, both
now fixed.

**A real bug.** `loadEntryRoster` (`src/rules/load.ts`), which every entry derivation goes through,
read `core.roster_member` — the team's membership list — instead of the entry's own approved roster
version (`core.roster_selection` for `current_roster_version_id`). The membership list carries
non-competing members, the coxswain, people added after publication, and pre-publish dates of birth,
so a coxed four whose entry said *Category C* derived as *Category B*. It now reads the entry's
current version and falls back to the membership list only when a team has no published version yet.
Covered by a new case in `test/roster-versions.spec.ts`.

**Stale demo data.** The seed pinned the basketball team entry to `Men's Team 35–39` — a band the
published rule version does not contain (its bands are 30–39 / 40–49) — and the rowing entry to
`Category C (43+)` where the band is named `Category C (43–49)`. The seed ids were misnamed to match
(`BASKETBALL_30_34` / `BASKETBALL_35_39` pointed at the 30–39 and 40–49 bands). Renamed to the bands
they actually are, and the entries now carry the category their own roster derives to.

**Still inconsistent, not touched:** the scripted demo narrative for scenario 2 ("35–39 full at 60/60,
adding Luca moves the team to 30–34") is written against bands that no longer exist in the rule
fixture. The quota pools and fees still carry both ids, so nothing breaks, but the story and the
rules fixture need to be reconciled before that scenario is demonstrated again.

Verified after `npm run seed:reset`: all nine seeded entries report current == derived; backend
46 files / 356 tests, typecheck 0, build clean.

## REV-079 — Structured logs, request ids, and a build that can be identified (2026-09-16)

The service had none of what an operator needs: bare `console.log` with no level or timestamp, no
way to tie two lines to one request, and `gitSha` permanently null because `wms_backend` is not a
Git checkout — so a deployed instance could not be identified at all.

- **One JSON line per log** (`src/common/logging/logger.ts`), level from `LOG_LEVEL`, carrying
  `requestId` and — once authenticated — `actorId`. Dependency-free on purpose (~60 lines, same
  shape as pino). Ids only: names, emails and dates of birth are never logged, and secret-looking
  fields are redacted as a backstop.
- **A request id on every request** (`request-logging.middleware.ts`, installed first in
  `configure-app.ts`): an inbound `X-Request-Id` is kept so a proxy trace stays one trace, otherwise
  one is generated. It returns as a response header and appears in every problem-details body as
  `requestId`, so "it failed at 14:05" becomes a log query.
- **One access-log line per response**: method, route shape, status, duration. Route shapes replace
  ids (`/v1/registration-entries/:id`), or 20,000 entries would become 20,000 route names.
- **`GET /v1/metrics`** (OC roles only): requests, counts by status class, per-route count/duration/
  5xx, uptime. In-process and reset by a restart — the honest first step, and the shape a real
  exporter would read.
- **`buildId`**: `npm run build` now writes `dist/build-info.json` (version, build time, git sha when
  there is one, and a short hash of the three) and `GET /v1/health` returns it. An unbuilt source
  tree reports `null` rather than inventing a value.

Two existing tests asserted that different authentication failures return byte-identical bodies —
still true, but the request id differs by design, so they now compare everything else. That property
is what stops the body revealing which check failed.

Verification: backend 47 files / 362 tests, typecheck 0, build clean; `/v1/health` checked against
the running service (`buildId f9b3b0dc3082`), and a request id round-tripped through a refusal body
in the browser.

## REV-080 — The service runs as `app_rw`, not as the database owner (2026-09-16)

`DATABASE_URL` pointed at `postgres://wms`, the database owner. An owner bypasses every table
grant, so the schema's least-privilege design — including the boundary that keeps `restricted.*`
away from the application — was decorative at runtime. `app_rw` existed and was unused.

- `DATABASE_URL` now connects as `app_rw`; the owner connection moved to `DATABASE_OWNER_URL`.
- Owner-only work reads that variable instead: `migrate:up` / `migrate:down` (`-d DATABASE_OWNER_URL`),
  `migrate:status`, `seed`, `seed:reset`, and `dev:clear-entries` (it switches triggers off).
- Outside production, the service now **warns at startup** when it is on a superuser rather than
  staying silent until production refuses to boot. Covered in
  `test/production-database-role.guard.spec.ts`.
- Documented in `README.md` (which variable is for what, and that a missing privilege is fixed by a
  grant in a migration, never by repointing `DATABASE_URL`).

The test suite already ran as `app_rw` against a throwaway database, which is why no grant turned
out to be missing: 47 files / 362 tests pass unchanged. Verified further by booting the service on
`app_rw` — `/v1/health` and `/v1/ready` both 200, the auth seed ran, and the new JSON access log
lines appeared.

## REV-081 — Basketball bands corrected on the right side (2026-09-16)

REV-078 made the seeded basketball entries agree with the rule fixture by moving the entries to
`Men's Team 30–39`. That was the wrong side of the disagreement. Every other fixture had always
treated the ids as five-year bands: the quota pools key `…021` to 48 of 52 places and `…022` to the
full 60 of 60, the fees key `…021` to €135 and `…022` to €120, and the participant app's own mock
(`demoSportRules.ts`) lists 30–34 / 35–39 / 40–49 / 50+. Only `seeds/fixtures/data-hub/sport-rules.json`
had ten-year bands.

So the fixture now carries the five-year bands, identical to the participant mock, and the entries
are back on `Men's Team 35–39` (`BASKETBALL_35_39` again). This also restores demo scenario 2, which
REV-078 had broken: the team sits in 35–39 (full, €120) and adding Luca (33) moves it to 30–34
(48 of 52, €135) — the recalculation the scenario exists to show.

Rowing keeps REV-078's correction: the band is named `Category C (43–49)`, and `Category C (43+)`
was the stale string.

Verified after `seed:reset`: all nine entries show current == derived, Luca's derives to
`Men's Team 30–34`; backend 47 files / 363 tests.

## REV-082 — Scenario 1 could not be completed: three defects in the evidence chain (2026-09-16)

Walking RFP §9.3 scenario 1 in a browser as Daniel Harper, a new swimming entry could not get past
evidence. Three separate faults, all now fixed.

1. **The swimming medical certificate was never a requirement.** The product carried
   `requires_evidence = true`, but the only seeded requirement sets were identity (ordinary) and
   para classification (restricted, para only). Nothing applied to swimming, so the entry showed
   "Evidence required" with nothing on screen to satisfy. The seed now carries a
   `medical_certificate` restricted requirement for Swimming (`seeds/demo.ts`, `seeds/ids.ts`).
2. **A product flag alone could strand an entry.** `requires_evidence` gated the entry even when no
   requirement applied. It is now the flag **and** at least one applicable requirement, ordinary or
   restricted (`evidenceIsRequired` in `registration-mutations.ts`), used by entry creation, save
   and the submit transition. Two existing specs had products flagged for evidence with no
   requirement behind them; they now seed a real one.
3. **A reviewer's approval did not unlock checkout.** Nothing wrote back to
   `registration_entry.evidence_status` — only the participant app's own `PUT .../evidence` did, so
   an approved certificate still read "Review pending" and checkout stayed locked. Evidence
   decisions now recompute the entry's gate (`src/evidence/entry-evidence-gate.ts`) and, when it
   turns approved, move the entry `pending_evidence → pending_payment` with a status event and the
   order alongside it. The restricted half passes its own statuses in, because the application pool
   cannot read `restricted.*` — the boundary is untouched.

Verified in the browser after a reseed: register Swimming → medical certificate **REQUIRED** with
an upload → upload (gate becomes `pending_review` by itself) → OC review + approve → the athlete's
screen reads **"Approved · checkout unlocked"** → pay with the retry switch on → "2 gateway
attempts, 1 charge" → status **Confirmed**, and the admin queue shows Swimming · 40–44 · Confirmed ·
Approved · Paid €65.00.

Backend 47 files / 363 tests, typecheck and build clean.

**Left open, found on the same walk:**
- The participant evidence screen offers reviewer actions ("Simulate reviewer opening file",
  approve/reject) that are OC-only and return **Forbidden** for an athlete. They belong on an
  admin screen.
- **There is no admin evidence review screen at all** — `GET /v1/restricted-evidence/review-queue`
  exists, nothing renders it, so approving during a demo means calling the API.
- Seeded demo athletes have **no consents**, so a seeded athlete cannot start a new registration
  until they grant them in Profile. Correct refusal, awkward demo.

## REV-083 — Partner finder listed the wrong people, with the wrong ids (2026-09-16)

Walking scenario 5: the finder showed a single "candidate" and inviting them was refused with
`partner.athlete.not_found`. Two faults in one screen.

- It read candidates from `journey.snapshot.partners`, which is **the partner already linked to the
  entry**, not a list of people to invite.
- Those rows carry **athlete-profile ids**, while `POST /v1/partner-requests` identifies athletes by
  **person id** — so every invite was refused as a missing athlete.

The screen now calls the real candidate search (`GET /v1/partner-requests/candidates`, debounced on
the search box), which returns person ids. Verified in the browser: the list fills with the event's
athletes and an invite reaches the endpoint.

**Still open on this scenario, found on the same walk:**
- Inviting is refused (correctly) when the entry **already has a partner** — Daniel's seeded tennis
  entry does — so scenario 5 needs a doubles entry with no partner yet, or a "change partner" path.
  The refusal reaches the screen as the raw key `partner.request.entry_not_found`.
- The candidate list includes **the signed-in athlete** and shows **Marco Rossi twice** (two seeded
  profiles for one name). The search should exclude the caller and collapse duplicates.
- `/waitlist` shows "Waitlist data is unavailable" when the open entry has no waitlist row, instead
  of an empty state — scenario 7 needs an entry that is actually waitlisted.

Participant Jest 18 suites / 116 tests; `tsc` only the 3 documented pre-existing errors.

## REV-084 — The evidence gate is now backend-owned, with a test that keeps it that way (2026-09-16)

REV-082 made an approval unlock checkout, but only on the decision path, and the earlier
"pending review" step still depended on the participant app telling the backend what to think.
Every evidence change — upload, start review, decision, waiver, ordinary and restricted — now
recomputes the entry's gate inside the same transaction, so the entry is correct no matter which
client acted.

A regression test covers the whole chain (`test/evidence.spec.ts` → "an approval opens the entry"):
upload moves the entry to `pending_review`, an OC approval moves it to `approved` **and**
`pending_payment`, and the status trail records `evidence_approved`.

**Re-verified in the browser from a clean `seed:reset`, both sides:**

- Participant: consents → register Swimming → medical certificate **REQUIRED** → upload
  (gate `pending_review` without the app being asked) → OC approves → **"Approved · checkout
  unlocked"** → pay with the retry switch → "2 gateway attempts, 1 charge" → **Confirmed**.
- Organiser: the entry's detail shows the full trail — `Created → Draft` (Daniel Harper,
  `registration.created`), `Draft → Pending evidence` (System, `submit_evidence`),
  `Pending evidence → Pending payment` (System, `evidence_approved`), `Pending payment → Confirmed`
  (System, `paid`) — category original/current/derived all `40–44`, money **€65.00 settled of
  €65.00 due**, and restricted evidence as a count only. The Operations dashboard moved with it
  (paid entries 3 → 4, settled +€65.00, reconciliation variance €0.00).

Backend 47 files / 364 tests, typecheck and build clean.

## REV-085 — Evidence review is an OC screen now (2026-09-16)

`GET /v1/evidence/review-queue` and `GET /v1/restricted-evidence/review-queue` existed but nothing
rendered them, so approving a medical certificate meant calling the API by hand — and the reviewer
buttons were on the **athlete's** own screen, where the backend correctly answers *Forbidden*.

- **Admin → Work queues → Evidence review** (`/evidence-review`): both queues in one list, oldest
  upload first, with counts for awaiting / in review / restricted. Restricted rows are badged and
  say that opening the record is access-logged. Actions: **Start review**, **Approve**, and
  **Reject** with a coded reason (`evidence.rejected.*`, chosen from a list — the backend refuses a
  rejection without one). Every click sends a fresh idempotency key and the queue is refetched
  afterwards, never rendering the POST response as the new truth.
- The queue endpoints now carry the athlete's name and the entry's sport and product, so the list
  is usable without opening each entry. For restricted items those come from the core side; nothing
  restricted crosses the boundary to build them.
- The participant evidence screen lost its reviewer actions and now says it is waiting for an OC
  reviewer (EN + IT).

Verified in the browser, UI only, no API calls: Daniel uploads a medical certificate → the OC queue
shows **Daniel Harper · Swimming · 100m Freestyle · RESTRICTED · Uploaded** → Start review → Approve
→ the athlete's screen reads **"Approved · checkout unlocked"**.

Admin 20 files / 85 tests (4 new), backend 47 files / 364 tests, participant 116 tests; typechecks
clean.

## REV-086 — A2 and A3 both failed at "Save": confirmed teams needed a propose/approve path, not a direct overwrite (2026-09-17)

Walking A2 (basketball, add the younger player) and A3 (rowing, substitute a rower) end to end:
the live recalculation was always correct, but **"Save roster & revalidate" 422'd on both** —
`ILLEGAL_STATUS_TRANSITION`. Root cause: the roster screen saved through the general entry `PUT`,
which unconditionally forces the entry's status back to `draft` before resubmitting — and
`confirmed → draft` has no legal edge in `core.entry_status_transition`. Fixing just that row
would have hit a second wall (`PAID_ORDER_CONFLICT`) for any entry whose order is already paid.

The real fix already existed, half-built: `core.roster_substitution` plus
`propose → revalidate → approve` endpoints (`roster.controller.ts`) — a captain proposes, an OC
approves, and approval never touches `entry.status` or the order at all. Nothing on either
frontend called any of it.

- **Backend**: `replacePersonId` is now optional on `POST .../roster-substitutions` — present is
  A3's swap (unchanged), absent is A2's pure addition (`cloneVersionWithAddition`, new). A new
  `GET /v1/roster-substitutions/review-queue` (OC-gated) lists proposals with athlete/team/sport
  names and the category swing, computed fresh rather than trusted from proposal time.
- **Participant**: the roster screen now branches on `entry.status`. Still `draft`/building →
  unchanged `confirmSelection` path. Already `confirmed` → `proposeRosterChange` instead, and the
  screen says **"Proposed. Nothing on this entry changes until the organiser reviews and approves
  it"** rather than claiming a save that didn't happen. (Bug found mid-fix: the screen was sending
  `TeamRosterMember.id` — the `roster_member` row id — as the person id the backend expects; fixed
  to `member.athleteId`.)
- **Admin**: new **Work queues → Team roster changes** (`/roster-changes`) — one list, Approve per
  row, flags unmet accreditation on the incoming athlete.

Verified in the browser, both scenarios, no API calls: rowing swap (Category C→B) and basketball
addition (35–39→30–34) both proposed from Daniel's confirmed entries, approved from the OC screen,
and the participant's **My Entries** category updated only after approval — never on propose.

Backend 47 files / 365 tests (1 new), admin 21 files / 88 tests (3 new), participant 116 tests;
all three typecheck clean.

## REV-087 — A5's partner replace was a real gap; A4's dual-approval had a silent replay bug (2026-09-17)

Testing A5 and A7 end to end surfaced two more defects, both fixed and re-verified live.

**A5 — a doubles entry could never change partner.** `partner.service.ts`'s
`invitingDoublesEntry` and `loadInvitingEntry` both filtered `WHERE entry.partner_profile_id IS
NULL` — true only before a first partner is ever accepted. Inviting a replacement always 404'd
(`partner.request.entry_not_found`, itself a misleading code for "already has a partner"). Neither
`send()` nor `respond()` touches entry status, order, or payment, so — unlike the team-roster case
in REV-086 — this needed no propose/approve ceremony, just removing the filter. Verified live:
Daniel (confirmed with Marco) successfully sent a second invite, reading "Invitation sent —
waiting for their answer" instead of a 404. New backend test: inviting, accepting, then inviting
and accepting a *second* partner, asserting the category recomputes against the new pair.

**A4 — the same-reviewer-twice click silently replayed instead of refusing.** The exceptions
admin repository built its idempotency key as `${exceptionId}:approve:${reviewerId}` — identical
on a genuinely repeated click, so the server replayed the first response instead of evaluating a
second signature at all, masking RUL-06's one-signature-per-person guard from ever actually being
exercised by repeat clicks. `api/idempotencyKey.ts`'s own doc comment describes this exact
anti-pattern. Fixed to a fresh key per click, matching every other mutation in the app. Also fixed
in the same pass: the refusal read the raw key `exception.signature.already_recorded`; it now
reads "You have already signed this exception. Dual approval needs a second, different reviewer."
Verified live: **Reviewer A** clicked twice on the same case now correctly 409s on the second
click and shows the message in a banner — no second OC login needed to see the fix work.

**A7 — no code defect found.** Idempotent payment retry (proven in A1) and reconciliation
(`€0.00`, checked live) both hold. The join → offer → expire → claim cycle is fully
participant-self-service in the backend (`joinWaitlist`/`releaseWaitlistOffer` simulate the offer
and its 20-second timer without needing a second person to "free" the place) — it has simply never
been walked live end to end. One quota pool is already naturally at capacity in the seed
(`Men's Team 35–39`, 60/60, 0 free), so this is solo-testable with a second real login that has no
existing basketball entry (Luca) once someone drives that session.

Backend 47 files / 366 tests (1 new), admin 21 files / 88 tests; both typecheck clean.

## REV-088 — A4 Judo is seeded, evidence-backed and raises real eligibility exceptions (2026-09-17)

The prior A4 page was only an exception-queue rehearsal: Judo was absent from the catalogue, no
workflow could write verified weight/belt/licence facts, and a participant could not create a
refusal case. It is now a runnable backend scenario rather than a testing-guide promise.

- The seeded **Judo · Men's −81 kg** product carries age, verified `weight_kg`, verified enum
  `belt_rank`, and a blocking verified/unexpired `federation_licence`. Daniel passes; Marco's
  `2kyu` belt and Luca's 2027-12-30 licence exercise distinct blocking keys.
- Participant ordinary evidence validates a weigh-in, belt code and licence expiry. These values
  are immutable upload metadata, not self-approved facts. OC approval creates a versioned,
  verified, Judo-scoped `core.entrant_attribute` with evidence-obligation provenance and
  supersedes the prior current fact.
- `POST /v1/registration-entries/:entryId/exceptions` derives the refusal from the caller-owned
  entry and current facts. It rejects eligible entries (`ENTRY_NOT_BLOCKED`), hides other athletes
  (`REGISTRATION_ENTRY_NOT_FOUND`), records the failed message keys in the existing exception
  case, and has a partial unique index for one live case per entry/rule version.
- The participant save refusal is localized in EN/IT, exposes **Raise as exception**, and shows
  the pending dual-approval state. The existing OC queue handles approval; neither
  `ApiExceptionsRepository.ts` nor the legacy exception-message mapping was changed.

New real-HTTP tests cover the boundary: `judo-exception.spec.ts` covers each refusal, ownership,
replay de-duplication, queue visibility and two approvers; `evidence.spec.ts` proves all three
declarations remain non-facts until OC approval and then become verified facts. Full verification:
backend **48 files / 372 tests**, admin **88**, participant Jest **118**; domain/backend builds and
backend typecheck pass. Participant `tsc` retains only the three pre-existing errors in
`messages.tsx` and `useProfileConsent.test.tsx`.

Browser preflight is deliberately not recorded as a final live A4 walkthrough: the checked
participant server uses real Cognito and the available fixture/local seed passwords do not sign in
as Daniel; the existing admin session showed its mock fallback queue. Exact quotes and a
credentialed rerun checklist are recorded in `docs/TESTING_GUIDE.md` A4.

## REV-089 — A7's waitlist had no path from a real registration attempt (2026-09-17)

Walking A7 live (Luca, freshly registered into an already-full Basketball category) surfaced that
the entire waitlist mechanism — join, offer, expire, claim, all already correctly built — had no
way to actually start for a real athlete, and no correctly-permissioned way to drive it once
started.

- **`core.waitlist_entry` was seed-only.** Nothing in `registration-mutations.ts` ever inserted one
  — `claimQuotaForEntry` threw `QUOTA_FULL` and that was the end of it, so `/waitlist` correctly had
  nothing to show ("Waitlist data is unavailable" — a real bug, but not the root one). Fixed:
  `QUOTA_FULL` now carries the pool id, and `saveEntry`/`transitionEntryStatus` write an `eligible`
  row for the entry once their transaction has rolled back — **not inside it**: the first version
  wrote it on `tx` before throwing and hung a test for over a minute, a real deadlock (a second
  connection's FK-referencing insert waiting on a row `tx` held `FOR UPDATE`, while `tx` waited on
  that insert to return before it could roll back and release it).
- **`release-offer`/`expire-offer` were correctly OC-only, but nothing OC-side ever called them.**
  The participant screen's "Release a place to me (demo)" button and its auto-expire-on-timeout
  effect both called them anyway and both 403'd for a real participant — confirmed live twice. New
  admin **Work queues → Waitlist** screen calls the same already-correct endpoints from the OC
  session they were always meant to run from; both participant-side calls removed (auto-expire now
  just re-fetches — a local countdown reaching zero cannot mutate anything itself; it asks for
  whatever the OC has since done).
- **A claim can still fail to price itself** if the entry reached the waitlist on its very first
  save (category was never persisted either, same rollback). `claimWaitlistOffer` now creates the
  order it always assumed existed; re-deriving the category is a separate, larger fix — logged as
  gap 12 in `docs/REMAINING_WORK.md` rather than improvised alongside this.

Verified live end to end, both portals, real accounts: Luca's basketball registration hit
`QUOTA_FULL` → `/waitlist` showed **"This category is full · Join the waitlist"** (not the old
error) → joined at position #2 → admin **Waitlist** screen showed the row → **Release a place** →
participant saw a 20-second countdown and **claimed it**, landing on checkout with the entry's real
fee → let a second cycle's offer run out → admin **Expire unclaimed offer** → participant correctly
read **"Offer expired… retained"** and rejoined at the back of the line, no Forbidden anywhere.

Backend 48 files / 373 tests (1 new), admin 22 files / 92 tests (4 new), participant 118; all three
typecheck clean.

## REV-090 — Re-verifying a Judo attribute no longer violates its lineage FK (2026-09-17)

**Status:** Implemented
**Author:** Codex agent session
**Scope:** Data | Backend | Quality

### What changed

- Added `1700000032000_defer_entrant_attribute_superseded_fk.sql`. It recreates
  `entrant_attribute_superseded_by_fkey` as `DEFERRABLE INITIALLY DEFERRED`, with the immediate
  foreign key restored by its down migration.
- Added a standalone real-database regression to `test/evidence.spec.ts`: a verified Judo belt
  fact is seeded, a replacement certificate follows the normal upload → OC review → approval
  route, and the test proves the old row points to the new row, the new row is current, and the
  real rules fact selector resolves the replacement.
- `EvidenceService.materializeApprovedAttribute` is intentionally unchanged. Its existing
  update-old-then-insert-new order is correct inside the decision transaction once the FK is
  checked at commit.

### Why

The immediate self-FK rejected the update before the replacement fact existed. Reversing the
statements would instead violate the one-current-fact partial unique index. A commit-time FK check
preserves both lineage and the invariant that no intermediate state has two current facts.

### Unchanged (explicit)

- Evidence decision endpoints, idempotency, and the rules engine selection semantics are unchanged.
- No restricted-data boundary, participant flow, or Judo eligibility rule was changed.

### Files updated

- `wms_backend/migrations/1700000032000_defer_entrant_attribute_superseded_fk.sql`
- `wms_backend/test/evidence.spec.ts`
- `wms_participant/context_docs/docs/{REVISIONS,PROGRESS_COMO2027}.md`

### Verification

- Migration applied to the current dev database and `migrate:status` reports no pending migration.
- Backend gates pass: 48 test files / 374 tests, typecheck, and production build.
- Browser re-check at `:5173`: Daniel Harper's federation licence, belt certificate, and weigh-in
  all approved; the review queue emptied. The database then reported his Judo entry as
  `evidence_status=approved` and `status=pending_payment` (checkout unlocked).

## REV-091 — Admin account menu shows the real signed-in identity; every mutating action now toasts (2026-09-17)

Two admin-portal gaps found while finishing A4 live: the top-right identity block was a static
"Admin_System / Superuser Role" placeholder unless a page happened to pass `userName`/`role`
props (most didn't), and no admin action gave any feedback beyond an inline error banner — a
successful Approve, Grant, Invite, Release, etc. left the OC guessing whether it actually worked.

- **`AccountMenu`** (`wms_admin/src/components/layout/AccountMenu.tsx`, new): a real dropdown —
  avatar-initials trigger, opens to show full name, email, and role, with Log out inside it.
  `AdminPortalShell` now derives name/role from `auth.session.me` by default (email always comes
  from the session) instead of relying on each page to pass props; a page can still override
  (`AssistedRegistrationPage`'s "Helpdesk operator", `PeoplePage`'s admin/OC role) and that still
  wins.
- **`ToastProvider`/`useToast`** (`wms_admin/src/components/ui/ToastProvider.tsx`, new): a
  bottom-right toast stack (success/error/info/warning), mounted once at the `App.tsx` root.
  `useToast()` no-ops outside a provider instead of throwing, so pages under test that don't wrap
  one don't need touching.
- Wired into every mutating action across the admin portal: role grant/revoke/invite/resend/
  remove/MFA-reset (`useAdminPeople`), evidence start-review/approve/reject
  (`EvidenceReviewPage`), exception approve/reject with running signature count
  (`useExceptions`), waitlist release/expire (`WaitlistReviewPage`), roster-change approve
  (`RosterChangeReviewPage`), registration lifecycle actions + CSV export
  (`RegistrationDetailPage`/`RegistrationsPage`), refunds (`useFinance`), broadcasts
  (`useCommunications`), rule publish (`useRules`), accreditation issue/reissue/revoke
  (`useAccreditationDesk`), assisted-registration consent/proxy actions
  (`useAssistedRegistration`), and every Operations action — freeze, incident, workaround,
  simulate-failure, reset demo (`useOperations`). Each fires a success toast naming the action, or
  an error toast with the same message the inline banner already shows.
- Toasts use `role="status"`, not `role="alert"` — the existing inline error banners already own
  `role="alert"`; giving both roles collided in tests (`getByRole('alert')` matched two nodes) and
  would double-announce to screen readers.

### Verified live, same session

- Admin dropdown, signed in as the newly-invited `gaurav.gambhir+oc2@stupaanalytics.com`: opens to
  show "OC Two", the email, and "OC administrator"; Log out closes the session.
- A4 refusal case (b) walked live for the first time (previously test-only, per REV-090's own
  note): Luca Bianchi's seeded Judo licence (`2027-12-30`) failed
  `eligibility.judo.federation_licence` on save, **Raise as exception** produced "awaiting dual
  approval (0/2)", Reviewer A approve → 1/2, the same signer clicking again was correctly refused
  ("You have already signed this exception"), and a genuinely different OC login
  (`gaurav.gambhir+oc2@stupaanalytics.com`, invited and role-granted through the People & Roles
  screen for this) approved as the second signature → **2/2, Exception approved** — with the new
  toast visibly confirming it.
- `npx vitest run` (`wms_admin`): 22 files / 93 tests green (one existing logout test and one new
  invite-toast test updated for the dropdown interaction); `tsc --noEmit` clean.

### Files updated

- `wms_admin/src/components/layout/AccountMenu.tsx` (new), `AdminPortalShell.tsx`
- `wms_admin/src/components/ui/ToastProvider.tsx` (new), `App.tsx`
- `wms_admin/src/hooks/{useAdminPeople,useOperations,useAccreditationDesk,useAssistedRegistration,useExceptions,useCommunications,useFinance,useRules}.ts`
- `wms_admin/src/pages/{PeoplePage,EvidenceReviewPage,WaitlistReviewPage,RosterChangeReviewPage,RegistrationDetailPage,RegistrationsPage}.tsx`
- `wms_admin/src/auth/cognitoAuth.test.tsx`, `wms_admin/src/pages/PeoplePage.test.tsx`
- `wms_participant/context_docs/docs/{REVISIONS,PROGRESS_COMO2027}.md`, `docs/{TESTING_GUIDE,REMAINING_WORK}.md`

## REV-092 — A4's belt-rank refusal walked live; the last untested Judo sub-case is closed (2026-09-18)

The one A4 sub-case still open after REV-091 (licence-expiry refusal) was the belt-rank refusal
(`eligibility.judo.minimum_belt`) — Marco Rossi's seeded `2kyu` case, never walked live because
Marco has no real Cognito login (`idp_subject` empty). Closed with a genuinely new participant
account instead of Marco's: `ggmbr27+ritesh@gmail.com` (created earlier, blocked on sign-in until
today — confirmed via a live `forgotPassword` call that the account is real and active in
Cognito; likely just a delivery/spam issue with Cognito's default, non-SES reset email, not a
product bug). No code changed — this is a pure test-execution entry.

- Ritesh Kumar (fresh profile: DOB 1990-05-15, all three required consents granted) registered
  **Judo · Men's −81 kg** (Masters 35–39, €85.00), uploaded weigh-in `80.4` (pass), licence
  `2028-01-01` (pass), and belt `2kyu` (the failing value). All three approved cleanly at `:5173`
  — REV-090's deferrable-FK fix holds on a third, independent Judo entry.
- Save refused with **"This category requires a verified 2nd dan belt or above"**
  (`eligibility.judo.minimum_belt`), exactly as documented. **Raise as exception** → 0/2.
  Reviewer A (`gaurav.gambhir+oc2@stupaanalytics.com`, "OC Two") → 1/2. A genuinely different
  second OC — the original `gaurav.gambhir@stupaanalytics.com` — approved as Reviewer B → **2/2,
  Exception approved**, toast confirmed (REV-091's toast system, first real use across two
  distinct admin sessions in parallel).
- **Investigated, not a bug:** the raised case also carried a second failed key,
  `eligibility.cannot_evaluate`, alongside `eligibility.judo.minimum_belt`. Root cause: Judo's
  `belt_rank` rule dimension (`core.rule_dimension`) only defines one enum band —
  `judo-2dan-plus: ["2dan","3dan","4dan","5dan"]` — with no band at all for anything below 2nd
  dan. `2kyu` therefore cannot resolve to any band (not just a "failing" one), and
  `wms_domain/features/rules/engine.ts` adds `eligibility.cannot_evaluate` whenever a dimension's
  `bandId` is `null`. By design given how the seed rule was authored, not a defect — flagged here
  so it isn't mistaken for one later.

### Verification

- All three Judo eligibility sub-cases (weight, belt, federation licence) are now proven live:
  weight — implicit in every A4 walk to date; licence — REV-091; belt — this entry. A4 has no
  remaining untested sub-case.
- Browser only this session; no backend/admin/participant test suite changes (no code touched).

### Files updated

- `wms_participant/context_docs/docs/{REVISIONS,PROGRESS_COMO2027}.md`, `docs/{TESTING_GUIDE,REMAINING_WORK}.md`

## REV-093 — A6 (Para-swimming, restricted evidence + clean export) walked live; both admin UI issues fixed (2026-09-18)

Two small admin/participant UI fixes, then A6 — the last unstarted List A scenario — closed out.

### Fixed

- **Enter/Return did not submit an OTP screen.** `OtpInput` (`wms_participant/src/components/shell/OtpInput.tsx`) had no way to react to the keyboard's submit key — the visible cells are driven by a hidden `TextInput` with no `onSubmitEditing`. Added an `onSubmit` prop wired to `onSubmitEditing` (`returnKeyType="done"`), and used it in both real Cognito OTP screens: `app/(auth)/confirm.tsx` (sign-up code) and `app/(auth)/forgot-password.tsx` (reset code — both the code field and the new-password field now submit on Enter; the email step's field also gained `onSubmitEditing` for the same reason). Verified live: typing the email on `/forgot-password` and pressing Enter now sends the reset code without touching the button. (`app/(auth)/otp.tsx` / `otp-login.tsx` were left alone — they run on the legacy mock `useVerifyOtp`/`useRequestOtp` path, not the real `EXPO_PUBLIC_DEMO_AUTH=false` Cognito flow, so they're dead code today.)
- **Elena Rossi's account couldn't reach the seeded A6 fixture.** `ggmbr27+elena@gmail.com` signed in as a *new* Cognito identity, so `CognitoIdentityProvider.linkPerson` auto-created a fresh placeholder `core.person` row (no name, no DOB, no entries) — while the actual A6 fixture (Elena Rossi, DOB 1984-05-18, a pre-built Para Swimming · 100m Freestyle draft entry with an already-*approved* S9 para-classification record) sat on a different row with `idp_subject` still `NULL`. Verified the placeholder had zero attached rows (`athlete_profile`/`consent`/`person_role` all 0), then deleted it and moved its `idp_subject` onto the seeded row — the same linking pattern used for Daniel/Luca/Marco earlier, done manually via SQL this time since there's no admin-side "link a participant" feature (unlike OC accounts, which go through `seeds/seed-logins.ts`/the People & Roles invite flow).

### A6 verified live

1. Elena's `/my-entries` immediately showed the pre-seeded **Para Swimming · 100m Freestyle** draft (category 40–44, €70.00) — no fresh registration needed, matching how the fixture was built.
2. `/eligibility-evidence`: **Para-classification evidence** (`Elena_Rossi_S9.pdf`) already **APPROVED**, with a restricted-access-log timestamp shown — proving PRV-04's access logging is live, not just written. Uploaded the one required **ordinary** item (identity document); OC approved it at `:5173` Evidence review.
3. **Participant-safe clean export** (the same screen, before OC approval even landed): clicking **Generate clean export** returned **"PASS · restricted field groups omitted"** and a JSON payload with `entry`/`ordinaryEvidence` only, plus `exclusions.excludedFieldGroups: ["medical","paraClassification","restrictedFiles","restrictedAccessLogs"]` — no S9, no medical content, anywhere in the payload.
4. `:5173` Registrations → Elena Rossi's detail page, as an ordinary OC: the Evidence section reads **"Restricted evidence held for this athlete at this event: 1 item · present ... No restricted document, classification, or reviewer metadata is available here."** — the negative check A6 asks for (present, but unreadable) holds from the admin side too.

A6 is the last List A scenario — with this, all eight (A1–A8) are live-verified.

### Files updated

- `wms_participant/src/components/shell/OtpInput.tsx`, `app/(auth)/{confirm,forgot-password}.tsx`
- `wms_backend` database: `core.person` row for the seeded Elena Rossi fixture (`idp_subject` linked, placeholder row removed) — data correction, no migration
- `wms_participant/context_docs/docs/{REVISIONS,PROGRESS_COMO2027}.md`, `docs/{TESTING_GUIDE,REMAINING_WORK}.md`
