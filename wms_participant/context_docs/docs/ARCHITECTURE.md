# ARCHITECTURE.md

<!-- STATE-COMO2027 -->
> ✅ **CURRENT — still valid for Como Lake 2027. Extend, don't discard.**
> Written pre-Como pivot, but the **stack + layering it defines are unchanged** (Expo/Expo Router/TypeScript/NativeWind/TanStack/RHF+Zod, `Screen → hook → repository interface → mock repo`). Trust it fully for *how the code is structured*. For **scope/screens/phases**, use [`START_HERE.md`](./START_HERE.md) → `DELIVERY_PLAN_COMO2027.md`. New backend-adaptability rules extend this: [`DELIVERY_PLAN_COMO2027.md`](./DELIVERY_PLAN_COMO2027.md) §6.6.
>
> **⚠️ Target production shape (REV-025):** this doc describes the **single Expo codebase = the P0 demo vehicle + participant-app prototype.** The *full product* is **not one Expo app** — it is a **shared backend + shared TS domain package + Participant (Expo) app + a separate plain-React Admin web app**. See [`DELIVERY_PLAN_COMO2027.md`](./DELIVERY_PLAN_COMO2027.md) **§7** for the target architecture, the split plan, and scalability guardrails. Keep the **domain layer pure/framework-agnostic** (it becomes the shared package). Where this doc says "one codebase / no separate web app," read it as scoped to the **athlete client during the POC** — §13 below and §7 of the plan govern the admin split.

## 1. Recommended stack
- React Native
- Expo
- TypeScript
- Expo Router
- **React Native Reusables** (UI primitives — add via CLI, customize with IMGA tokens)
- **NativeWind v4** + Tailwind CSS 3.4.x (styling foundation)
- TanStack Query
- React Hook Form
- Zod
- AsyncStorage
- Expo Image Picker
- Expo Document Picker
- Reanimated only where motion materially improves the experience
- `lucide-react-native` for icons (standard with RNR)

> Stack changes are logged in `docs/REVISIONS.md`. Current: **REV-001**.

## 1.1 UI layer (primitive vs IMGA)

```text
IMGA custom components (EventCard, RegistrationStepper, …)
        ↓ composes
React Native Reusables primitives (Button, Input, Card, …)
        ↓ styled by
NativeWind + IMGA CSS variables / tokens
        ↓ runs on
React Native / Expo (Web, iOS, Android)
```

- **Do not** treat RNR defaults as the product visual identity.
- **Do not** install every RNR component upfront — add per screen batch.
- **Do not** fork RNR primitives unless required for Expo Web compatibility.
- Generic controls → RNR. Sports/event-specific layout → `src/components/{event,registration,…}/`.

## 2. Core rule
The UI must never depend directly on the mock-data implementation.

Use:

`UI -> hook/use-case -> repository contract -> implementation`

Current implementation:
`repository contract -> mock JSON / AsyncStorage`

Future implementation:
`repository contract -> real API -> backend -> database`

## 3. Suggested source structure

```text
app/                          # Expo Router routes (root)
src/
  components/
    ui/                       # React Native Reusables primitives (CLI-generated)
    shell/                    # AppScreen, AppHeader, BottomActionBar
    event/
    registration/
    athlete/
    accreditation/
    results/
  lib/
    utils.ts                  # cn() helper for RNR
    navigation-theme.ts       # Expo Router / React Navigation theme bridge
  features/
    auth/
    events/
    registration/
    partners/
    payment/
    accreditation/
    results/
  domain/
    models/
    repositories/
  data/
    mock/
      fixtures/
      repositories/
    storage/
    api/
  theme/
    colors.ts                 # IMGA semantic tokens (source of truth)
    typography.ts
    spacing.ts
    radius.ts
    tokens.ts
  constants/
assets/
  branding/
  events/
  sports/
  athletes/
global.css                    # Tailwind + IMGA CSS variables
tailwind.config.js
components.json               # React Native Reusables CLI config
docs/
  PROGRESS.md                 # implementation status tracker
  REVISIONS.md                # plan/stack change log
```

If Expo Router is kept under `/app` at repository root instead of `src/app`, preserve the same logical grouping.

## 4. Repository contracts
Expected repositories/services:

```ts
interface AuthRepository {
  requestOtp(identifier: string): Promise<void>;
  verifyOtp(identifier: string, code: string): Promise<AuthSession>;
}

interface EventsRepository {
  listEvents(): Promise<Event[]>;
  getEvent(id: string): Promise<Event | null>;
  listSports(eventId: string): Promise<Sport[]>;
}

interface AthleteRepository {
  getCurrentProfile(): Promise<AthleteProfile | null>;
  saveProfile(input: AthleteProfileInput): Promise<AthleteProfile>;
}

interface RegistrationRepository {
  getDraft(eventId: string): Promise<RegistrationDraft | null>;
  saveDraft(draft: RegistrationDraft): Promise<void>;
  submitRegistration(draft: RegistrationDraft): Promise<Registration>;
  getRegistration(id: string): Promise<Registration | null>;
}

interface PartnerRepository {
  searchPartners(filters: PartnerFilters): Promise<AthleteSummary[]>;
  sendPartnerRequest(input: Omit<PartnerRequest, 'id' | 'status' | 'createdAt'>): Promise<PartnerRequest>;
  respondToPartnerRequest(requestId: string, status: PartnerRequestStatus): Promise<PartnerRequest>;
  listRequests(eventId: string, athleteId: string): Promise<PartnerRequest[]>;
  cancelPendingOutgoing(eventId: string, fromAthleteId: string, exceptToAthleteId?: string): Promise<void>;
}

interface PaymentRepository {
  processMockPayment(input: PaymentInput): Promise<PaymentResult>;
}

interface AccreditationRepository {
  getAccreditation(registrationId: string): Promise<Accreditation | null>;
}

interface ResultsRepository {
  getMatch(matchId: string): Promise<MatchResult | null>;
  subscribeToMatch?(
    matchId: string,
    onUpdate: (result: MatchResult) => void
  ): () => void;
}
```

Exact names may change, but the boundaries should remain.

## 5. State strategy
Use TanStack Query for repository-backed reads and invalidation.

Use React Hook Form for editable forms.

Use local component state only for ephemeral UI state.

Use AsyncStorage for:
- mock auth session
- in-progress registration draft
- small POC state that must survive app restart

Do not use AsyncStorage as a pretend production database.

## 6. Navigation
Logical groups:

```text
(auth)
  login
  otp

(discovery/main)
  events
  event/[id]
  event/[id]/sports

(registration)
  overview
  profile
  category
  documents
  photo
  partner
  partner-finder
  review
  payment
  status

(main)
  accreditation
  gameshub
  match/[id]
```

Preserve the documented A01–A18 experience even if route file names differ.

## 7. Forms
Use React Hook Form + Zod.

Validation belongs in feature/domain schemas, not embedded as random screen conditions.

Examples:
- required profile fields
- date of birth format
- category selection
- T&C acceptance
- required document completion
- partner requirement for doubles

## 8. Mock-to-production migration
POC:
```text
Screen
 -> useEvents()
 -> EventsRepository
 -> MockEventsRepository
 -> events.json
```

Production:
```text
Screen
 -> useEvents()
 -> EventsRepository
 -> ApiEventsRepository
 -> /events API
```

The screen should not change.

## 9. Auth
POC:
- any valid-looking email/mobile may request OTP
- canonical demo OTP: `123456`
- session persisted locally

Production replacement:
- real auth provider or backend OTP

Do not design UI around the fact that OTP is mocked.

## 10. Payment
POC:
- fully designed checkout UI
- simulated processing delay
- deterministic success by default
- optional demo failure state
- generated mock payment/receipt ID

Production replacement:
- real payment gateway behind the same service/repository boundary

## 11. Documents and photos
POC:
- use Expo Document Picker and Image Picker
- save local file URI + metadata
- display upload/verified-like demo states as defined by the POC

Production:
- upload to backend/object storage
- receive remote URL/status

## 12. Results
Do not implement a scoring engine.

POC:
- local result fixture
- timed or scripted updates through a mock results provider

Production:
- WebSocket/SSE/polling integration with external/central result systems

## 13. Admin compatibility & the production split (REV-025, REV-027)
Both clients target **compatible entities and statuses** on a **shared API**. The admin is prototyped inside this Expo codebase for the P0 demo (D3), but the **production admin is a separate plain-React web app** — future repo/folder **`wms_admin`** (Vite/Next, desktop-first, data-dense) — see `DELIVERY_PLAN_COMO2027.md` §7. At split time (post-demo), **this Expo codebase becomes `wms_participant`**. The **backend is built by a separate developer** (not us); we integrate against its API later. Until then both frontends read the **mock data hub** — API-shaped JSON behind repositories (`DELIVERY_PLAN_COMO2027.md` §6.7).

Target (full product):
```text
   Participant app (Expo/RN, web+mobile)      Admin web app (plain React, desktop)
                    \                          /
                     \      shared TS domain/contract package
                      \    (models + DTOs + rules engine, pure TS)
                       \                      /
                        ────  Shared Backend API (NestJS/FastAPI)  ────
```

Rules that keep the split cheap:
- **Keep the domain layer pure/framework-agnostic** — `src/domain/*`, `src/features/rules/engine.ts`, and DTO types must have **no React Native imports**. They become the shared package used by the participant app, the admin app, and (for validation) the backend.
- Do not create athlete-specific data structures that make admin workflows impossible later.
- Treat the current `app/(admin)/*` screens as the **behavioural + visual spec** for the future React admin — reuse the logic, re-implement the shell; don't add Expo-Web-only admin hacks that can't port.
- Design each repository method as a real endpoint (verb + DTO + error shape, §6.6 of the plan) so the same contract serves both frontends.


## POC platform strategy: web-first iteration, mobile-first codebase
The Athlete POC should be implemented as **React Native with Expo**, but the primary development/review environment should initially be **Expo Web**.

Why:
- browser refresh/iteration is faster for AI-agent-driven UI work
- reviewers can validate flows without waiting for native builds
- we preserve one React Native codebase for future Android/iOS
- the POC UI does not need to be rewritten when moving to native

Target flow:

```text
React Native + Expo source
        |
        +--> Expo Web: primary POC iteration/review
        |
        +--> Android: batch compatibility validation
        |
        +--> iOS: batch compatibility validation
```

Do not create a separate React/Vite web implementation **of the participant/athlete client** — it stays one Expo codebase across web + native. *(This rule is scoped to the athlete client. The **production admin** is intentionally a separate plain-React web app — see §13 and `DELIVERY_PLAN_COMO2027.md` §7. REV-025.)*

On Expo Web ≥768px, screens should **rearrange** into website layouts (multi-column, `max-w-7xl`) while compact/native stay stacked. See **REV-011** (hub pages), **REV-012** (wizard rail), and **REV-013** (auth split + stack site nav).

**TEMPORARY (REV-010 — remove later):** Docker may put a saved World Masters Sport HTML snapshot at `/` with an Athlete Portal link into Expo `/login`. That snapshot is demo glue only, not a second web app. The athlete product remains this Expo RN codebase.

### Native-only capabilities during POC
Prefer simplified/mock behavior for:
- camera capture
- wallet integration
- push notifications
- real payment sheets
- biometrics
- deep links
- QR scanning
- background services

Use real native APIs only when they are cheap, stable, cross-platform enough, and materially improve the demo.

### Compatibility rule
Every screen must remain capable of running on Android/iOS from the same Expo project.

Avoid:
- DOM elements in feature UI
- `window` / `document` dependencies in screen logic
- CSS-only web implementations that cannot map to React Native
- web-only component libraries for core screens
