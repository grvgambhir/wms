<!-- COMO2027-CURRENT-ENGAGEMENT -->
> 🎯 **CURRENT ENGAGEMENT — Como Lake 2027 (read this first).**
> This project has pivoted to the revised **World Masters Sport / Como Lake 2027** RFP (REV-022, 2026-09-01).
> **Canonical entry point:** `context_docs/docs/START_HERE.md` (path from repo root).
> The **engineering rules** below (stack, TypeScript strict, Expo Router, NativeWind, repository pattern, DoD, Expo-Web-first) **still apply**.
> But any **scope, source-of-truth list, screen flow, or "Main demo path (A01–A18)"** below is **superseded** — take scope from `context_docs/docs/DELIVERY_PLAN_COMO2027.md` and the screen map in `context_docs/docs/BUSINESS_OVERVIEW_COMO2027.md` §7, not from the old lists.

# AGENTS.md

## Project
IMGA Athlete Mobile POC — a fast, polished proof of concept for the athlete-facing side of a broader Games Management System for IMGA Masters Events.

The product intent is to demonstrate a complete athlete journey:
account validation → event discovery → sport registration → eligibility/documents → accreditation photo → partner/team flow → review/T&C → mock payment → registration status → digital accreditation → GamesHub → live results.

The app is a POC, but it must be structured so that most UI, navigation, validation, state handling, domain types, components, and feature structure can be reused when a real backend is added.

## Source-of-truth priority
All canonical docs live in `context_docs/docs/`. When requirements conflict, follow this order:
1. `context_docs/docs/START_HERE.md` (index/router — read first)
2. `context_docs/docs/RFP_COMO2027.md` (contractual source of truth)
3. `context_docs/docs/BUSINESS_OVERVIEW_COMO2027.md` (business + screen map §7)
4. `context_docs/docs/DELIVERY_PLAN_COMO2027.md` (scope, phases, tasks, acceptance)
5. `context_docs/docs/ARCHITECTURE.md` (stack/layering — still valid)
6. `context_docs/docs/DATA_MODEL.md` (entities — extend)
7. `context_docs/docs/DESIGN_SYSTEM.md` (tokens/primitives — extend)
8. `context_docs/docs/MOCK_DATA.md` (transitional — current fixtures only)

**Progress and revision tracking** (operational — read at session start, update at session end):
- `context_docs/docs/PROGRESS_COMO2027.md` — what is done, in progress, and remaining
- `context_docs/docs/REVISIONS.md` — log of approved plan/stack/architecture changes

Do not invent major product flows outside these files without explicit approval.

Before making product/domain decisions, read `context_docs/docs/BUSINESS_OVERVIEW_COMO2027.md` so implementation choices reflect the Como Lake 2027 RFP, not only the current app.

## Mandatory technical rules
- React Native with Expo.
- TypeScript strict mode.
- Expo Router for navigation.
- **React Native Reusables** for UI primitives (add incrementally via CLI; do not install all components upfront).
- **NativeWind v4** as the styling foundation (map IMGA tokens via CSS variables + Tailwind).
- TanStack Query for data fetching/caching abstraction.
- React Hook Form + Zod for forms/validation.
- AsyncStorage only for temporary local persistence.
- Keep mock data behind repository/service interfaces.
- Screens and presentational components must never import JSON fixtures directly.
- No direct storage access from UI components.
- No direct API calls from UI components.
- Avoid `any`; use explicit domain types.
- Reusable UI components and centralized design tokens are mandatory.
- Prefer feature folders and domain boundaries over giant shared utility files.
- All loading, empty, error, disabled, success, pending, rejected, waitlisted, and approved states should be modeled deliberately where relevant.
- Keep user-facing text centralized where practical so localization can be added later.
- POC data may be local/mock, but IDs and entity relationships must be realistic and stable.

## Architecture principle
UI must not care whether data comes from JSON, AsyncStorage, a mock server, REST, GraphQL, or WebSockets.

Expected dependency flow:

`Screen -> feature hook/use-case -> repository interface -> mock repository now / API repository later`

Example:

`EventsScreen -> useEvents() -> EventsRepository -> MockEventsRepository -> events.json`

Later, replace only the repository implementation with `ApiEventsRepository`.

## POC rules
- Prefer speed and clarity over premature infrastructure.
- Do not build a real backend yet.
- Do not integrate a real OTP provider.
- Do not integrate a real payment gateway.
- Do not build a scoring engine.
- Documents and photos may use local device URIs in the POC.
- Live results should be simulated through a mock results provider.
- Use deterministic mock data so demos are repeatable.

## Reusability expectations
Reusable later:
- screen composition
- navigation
- design system
- forms
- validation
- domain types
- repositories/contracts
- hooks
- state transitions
- status components
- empty/loading/error states

Expected to be replaced later:
- auth provider
- payment implementation
- document upload storage
- mock repositories
- result provider
- AsyncStorage persistence

## Code quality
- Keep files focused.
- Prefer composition over prop-heavy mega-components.
- Do not duplicate UI patterns across screens.
- Extract components only when reuse or clarity justifies it.
- Write small typed helpers.
- Keep business rules outside presentational components.
- Use stable IDs instead of display names as relations.
- Add comments only for non-obvious decisions.
- Avoid speculative abstractions with no current use.

## Demo identity consistency
Target demo entities = the deterministic seed in `context_docs/docs/DELIVERY_PLAN_COMO2027.md` §6.3 (Como Lake 2027; swimming/basketball/rowing/tennis). `context_docs/docs/MOCK_DATA.md` documents the *current* pre-reskin fixtures only.
Keep **Daniel Harper** + **Marco Rossi** as the demo characters; do not rename them or the canonical event in one screen without updating the shared seed.

## Visual intent
Athlete experience should feel like a **premium, cool, aesthetic international sports event app** — not an enterprise admin portal.

**Mockups guide flow and content; they are not a pixel-perfect ceiling.** Elevate with depth, gradients, and transparency where it improves the product.

Use:
- clean light surfaces with optional soft atmospheric backgrounds
- World Masters Sport blue (`#4887CA`) + **gradient variants** on heroes, CTAs, and featured cards
- **glass / semi-transparent** cards and overlays where hierarchy benefits
- bold sports/event imagery and confident typography
- rounded cards with depth (shadow or layer, not flat generic UI)
- strong hierarchy, status chips, clear progress
- large tap targets, minimal clutter

Do not:
- blindly copy mockups without improving visual quality when a cooler treatment is possible
- paste gradients on every element (forms, list rows, all badges)
- use excessive glow/neon or illegible text on glass/photos
- expose technical/debug wording to athletes
- turn long registration steps into one giant form
- hardcode random colors outside centralized tokens

See `docs/DESIGN_SYSTEM.md` → **Aesthetic direction** and **Gradient & transparency rules**.

## Before implementing a screen
1. Read its purpose in the Como screen map: `context_docs/docs/BUSINESS_OVERVIEW_COMO2027.md` §7.
2. Read the task + acceptance in `context_docs/docs/DELIVERY_PLAN_COMO2027.md` (and verify against `RFP_COMO2027.md`).
3. Check required data in `context_docs/docs/DATA_MODEL.md` (extend as needed).
4. Reuse design primitives + portal shells from `context_docs/docs/DESIGN_SYSTEM.md`.
5. Use repository/service abstractions for all external or persisted data (backend-adaptable — DELIVERY_PLAN §6.6).

## Definition of done for a P1 screen
- visually consistent with the design system
- correct navigation
- uses canonical mock data
- supports primary interaction
- handles relevant state(s)
- no direct JSON import in the screen
- no broken TypeScript
- works on common iPhone and Android phone sizes
- no unnecessary production integrations


## POC development mode: Expo Web first
For the fastest POC iteration cycle, develop and review the app primarily through **Expo Web in the browser first**, while keeping the codebase React Native compatible.

The intent is:
`Expo React Native codebase -> fast browser iteration now -> Android/iOS validation later -> same codebase for production mobile`

Rules:
- Prefer cross-platform React Native components that work on Expo Web, Android, and iOS.
- Do not use DOM-only React components or browser-only APIs inside feature screens.
- Do not rewrite screens as a separate React/Vite web app.
- During the POC, avoid native-only implementation work unless it is necessary to prove the flow.
- Camera, wallet, push notifications, native payment sheets, biometrics, deep links, and similar native integrations may be represented by mocked or simplified POC behavior first.
- Use Expo Web as the default feedback loop for screen building and visual review.
- After each major batch is stable on web, perform a focused Android/iOS compatibility pass.
- If a package works on native but poorly on Expo Web, prefer a simpler cross-platform alternative for the POC unless the native behavior is essential.
- Do not sacrifice future mobile compatibility just to make the web preview easier.

## Progress and revision documentation (mandatory for agents)

At the **start** of every implementation session:
1. Read `context_docs/docs/START_HERE.md`, then `context_docs/docs/PROGRESS_COMO2027.md` for current phase and next action.
2. Read `context_docs/docs/REVISIONS.md` for recent plan/stack changes (latest `REV-###`).

At the **end** of every session that changes code, docs, or plan:
1. Update `context_docs/docs/PROGRESS_COMO2027.md` — checkboxes, phase status, session log row, `Last updated` date.
2. If anything about **stack, architecture, screen flow, scope, or folder structure** changed, add a new entry to `context_docs/docs/REVISIONS.md` **before** marking work complete.
3. Update any affected source-of-truth docs (`DELIVERY_PLAN_COMO2027.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, etc.) in the same change.

**Revision rule:** Never silently change the approved plan. Log it in `REVISIONS.md` with a new `REV-###` ID, state what is unchanged, and list files updated.

**UI stack note (REV-001):** React Native Reusables is the primitive layer only. IMGA visual identity comes from mockups, `DESIGN_SYSTEM.md`, and centralized tokens — not default shadcn/RNR styling.
