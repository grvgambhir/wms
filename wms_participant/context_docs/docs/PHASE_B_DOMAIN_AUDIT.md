# Phase B — Domain / rules layer purity audit

**Date:** 2026-09-04  
**Scope:** read-only. No code was changed.  
**Question:** can these files move into a shared TypeScript package consumed by the Expo participant app **and** the plain-React `wms_admin` app with **zero** React / React Native / NativeWind / expo-router?

**Purity bar (this audit):**
- No imports from `react`, `react-native`, `expo-router`, `lucide-react-native`
- No imports from `@/components/*`, `@/i18n`, `@/theme/*`, or other app-specific (non-domain) modules
- No NativeWind / `className` usage
- Plain TypeScript only (types, pure functions, enums)

**Method:** glob of every file under `src/domain/**`, `src/features/rules/engine*.ts`, plus the two registration modules and `src/lib/format.ts` named in the brief. Every import line was recorded. Forbidden tokens (`react`, `react-native`, `expo-router`, `lucide-react-native`, `className`, NativeWind, `@/components`, `@/i18n`, `@/theme`, `@/data/`, `@/constants/`) were grepped across the domain tree and the named files.

**Not in scope (found, left out):** `src/features/rules/hooks/useRules.ts` (TanStack Query + `repositories` — a React hook, not an engine). `src/features/registration/utils/categorySelection.ts` is a pure helper but is not under `src/domain/*` and is not an `engine*.ts` file.

---

## Headline

| Bucket | Count |
|---|---|
| Files audited | **52** |
| Pure — ready to extract unchanged | **48** |
| Needs a small trivial fix first | **1** |
| Needs a design decision | **3** |
| Files that mix pure logic + impure bits in the same file | **0** (one *localisation* mix in `engine.ts` — see caveats; not a framework mix) |

**No audited file imports React, React Native, expo-router, lucide, NativeWind, `@/components/*`, or `@/theme/*`.** The only forbidden-class import in the named set is `statusLabels.ts` → `@/i18n`. The only other app-specific imports are the two engine test files → `@/data/mock/fixtures/sport-rules.json`.

---

## Summary table

### `src/domain/models/` (24)

| File | Pure | Impurities found | Effort |
|---|---|---|---|
| `src/domain/models/accreditation.ts` | yes | none | none |
| `src/domain/models/accreditationDesk.ts` | yes | none (type-only `@/domain/models/api`) | none |
| `src/domain/models/api.ts` | yes | none | none |
| `src/domain/models/assistedRegistration.ts` | yes | none (type-only `@/domain/models/api`) | none |
| `src/domain/models/athlete.ts` | yes | none | none |
| `src/domain/models/auth.ts` | yes | none | none |
| `src/domain/models/communications.ts` | yes | none (type-only `@/domain/models/api`) | none |
| `src/domain/models/consent.ts` | yes | none (type-only `@/domain/models/api`) | none |
| `src/domain/models/document.ts` | yes | none | none |
| `src/domain/models/event.ts` | yes | none | none |
| `src/domain/models/evidence.ts` | yes | none (type-only `@/domain/models/api`) | none |
| `src/domain/models/finance.ts` | yes | none (type-only `@/domain/models/api`) | none |
| `src/domain/models/gameshub.ts` | yes | none | none |
| `src/domain/models/index.ts` | yes | none (re-exports sibling models only) | none |
| `src/domain/models/match.ts` | yes | none | none |
| `src/domain/models/partner.ts` | yes | none | none |
| `src/domain/models/payment.ts` | yes | none | none |
| `src/domain/models/preRegistration.ts` | yes | none (type-only `@/domain/models/api`) | none |
| `src/domain/models/registration.ts` | yes | none | none |
| `src/domain/models/registrationJourney.ts` | yes | none (type-only other `@/domain/models/*`) | none |
| `src/domain/models/restrictedEvidence.ts` | yes | none (type-only `@/domain/models/evidence`) | none |
| `src/domain/models/rule.ts` | yes | none | none |
| `src/domain/models/sport.ts` | yes | none | none |
| `src/domain/models/teamRoster.ts` | yes | none (type-only `@/domain/models/rule`) | none |

### `src/domain/repositories/` (22)

Every repository file is a TypeScript `interface` (plus request/input types) importing **only** `@/domain/models/*`. No storage, no React, no Expo.

| File | Pure | Impurities found | Effort |
|---|---|---|---|
| `src/domain/repositories/accreditation.repository.ts` | yes | none | none |
| `src/domain/repositories/accreditationDesk.repository.ts` | yes | none | none |
| `src/domain/repositories/assistedRegistration.repository.ts` | yes | none | none |
| `src/domain/repositories/athlete.repository.ts` | yes | none | none |
| `src/domain/repositories/auth.repository.ts` | yes | none | none |
| `src/domain/repositories/communications.repository.ts` | yes | none | none |
| `src/domain/repositories/consent.repository.ts` | yes | none | none |
| `src/domain/repositories/documents.repository.ts` | yes | none | none |
| `src/domain/repositories/events.repository.ts` | yes | none | none |
| `src/domain/repositories/evidence.repository.ts` | yes | none | none |
| `src/domain/repositories/finance.repository.ts` | yes | none | none |
| `src/domain/repositories/gameshub.repository.ts` | yes | none | none |
| `src/domain/repositories/index.ts` | yes | none (re-exports sibling repos only) | none |
| `src/domain/repositories/partner.repository.ts` | yes | none | none |
| `src/domain/repositories/payment.repository.ts` | yes | none | none |
| `src/domain/repositories/preRegistration.repository.ts` | yes | none | none |
| `src/domain/repositories/registration.repository.ts` | yes | none | none |
| `src/domain/repositories/registrationJourney.repository.ts` | yes | none | none |
| `src/domain/repositories/restrictedEvidence.repository.ts` | yes | none | none |
| `src/domain/repositories/results.repository.ts` | yes | none | none |
| `src/domain/repositories/rules.repository.ts` | yes | none | none |
| `src/domain/repositories/teamRoster.repository.ts` | yes | none | none |

### Engine, registration lifecycle, format (6)

| File | Pure | Impurities found | Effort |
|---|---|---|---|
| `src/features/rules/engine.ts` | yes | none (type-only `@/domain/models/rule`) | none |
| `src/features/rules/engine.test.ts` | no | line 4: `import sportRulesFixture from '@/data/mock/fixtures/sport-rules.json'` | needs-design-decision |
| `src/features/rules/engine.edge.test.ts` | no | line 4: `import sportRulesFixture from '@/data/mock/fixtures/sport-rules.json'` | needs-design-decision |
| `src/features/registration/statusLifecycle.ts` | yes | none (type-only `@/domain/models/registrationJourney`) | none |
| `src/features/registration/statusLabels.ts` | no | line 6: `import type { CopyDict } from '@/i18n'` | trivial |
| `src/lib/format.ts` | no\* | no React/RN/Expo imports, **but** `date-fns` + hardcoded `en-GB`/`en-US` locales (see below) | needs-design-decision |

\*Framework-forbidden imports: **none**. Flagged as not-pure-for-extraction because of the date-library / locale assumptions the brief asked to check, and because every current consumer is a UI component.

---

## Ready to extract today, unchanged (48)

All of `src/domain/models/*` (24) and `src/domain/repositories/*` (22), plus:

- `src/features/rules/engine.ts` — pure functions (`ageOn`, `findBand`, `deriveCategory`, `categoryImpact`). Only dependency is `SportRule` / roster types from `src/domain/models/rule.ts`.
- `src/features/registration/statusLifecycle.ts` — pure state machine over `JourneyEntryStatus` (`TRANSITIONS`, `canTransition`, `spineForEntry`, …). File comment already states this is the lift candidate; labels were deliberately kept out.

**Extraction plumbing (not an impurity, applies to all 48):** intra-domain imports use the Expo path alias `@/domain/models/...`. In the shared package those become relative imports or a package-internal alias. Mechanical rewrite; no behaviour change.

---

## Needs a small trivial fix first (1)

### `src/features/registration/statusLabels.ts`

**Impurity (exact line):**

```ts
import type { CopyDict } from '@/i18n';   // line 6
```

That is a **type-only** import. Runtime code is two pure functions (`statusLabel`, `actionLabel`) that take a copy bag and return a string. They do not call `useCopy()`, React, or storage.

**However:** `@/i18n` is the app i18n barrel. It **re-exports React** (`LocaleProvider`, `useLocale`, `useCopy` from `LocaleContext.tsx`, which also uses AsyncStorage). `CopyDict` itself is `Record<CopyKey, string>` where `CopyKey` is `keyof typeof copy` from `@/constants/copy` — the entire Expo copy catalogue. A shared package that imported `@/i18n` would pull React + the participant-app dictionary.

The file’s own header already says labels were kept **out** of `statusLifecycle.ts` so the lifecycle can lift without a copy dictionary.

**Suggested one-line-shaped fix (do not apply in this audit):** drop the `@/i18n` import and type `copy` as a local interface of the 14 keys these functions actually read:

`statusLabelDraft`, `statusLabelPendingEvidence`, `statusLabelPendingTeam`, `statusLabelPendingPayment`, `statusLabelWaitlisted`, `statusLabelConfirmed`, `statusLabelCancelled`, `statusLabelSubstituted`, `statusLabelWithdrawn`, `statusLabelDisqualified`, `govActionCancel`, `govActionDisqualify`, `govActionSubstitute`, `govActionReinstate`.

Call sites already pass `useCopy()`’s object; structural typing keeps them compiling.

**Still a human call after that fix:** whether *any* label helper belongs in the shared domain package, vs leaving this file in each app (Expo already uses it from `registration-status.tsx` and `operations.tsx`; `wms_admin` would supply its own). The mechanical purity fix does not decide that.

---

## Needs a design decision (3)

### 1. `src/features/rules/engine.test.ts` and `src/features/rules/engine.edge.test.ts`

**Impurity (exact line, both files):**

```ts
import sportRulesFixture from '@/data/mock/fixtures/sport-rules.json';
```

No React/RN. The coupling is to the **Expo mock data hub** (`src/data/mock/fixtures/`). The tests’ documented value is that they exercise **real** `sport-rules.json` bands — they must not bypass `deriveCategory` / `findBand`.

That is not a one-line fix. A human has to pick:

1. **Tests travel with the shared package** — copy (or move) `sport-rules.json` into the package’s test fixtures, so the tests keep asserting against the canonical bands.
2. **Inline the few `SportRule` objects** the tests need — loses the “real fixture” guarantee unless someone keeps them in sync by hand.
3. **Leave tests in the Expo app** — they import `deriveCategory` from the published package and keep reading the app’s mock hub. Admin never sees them.

Option 1 preserves the current guarantee. Option 3 is the smallest move on extract day. Do not silently inline.

### 2. `src/lib/format.ts`

**Forbidden-framework imports:** none. Single import:

```ts
import { format, parseISO } from 'date-fns';   // line 1
```

**Why it is not “extract as-is” into the shared *domain* package:**

1. **It is presentation, not domain.** Every current importer is a UI component (`EventListRow`, `AccreditationCard`, `PartnerCard`, `AthleteProfileForm`, GamesHub cards, …). No file under `src/domain/*` imports it. Putting display formatters in the shared *domain* package mixes layers.
2. **Date library + English-only locale.** `date-fns` `format()` uses the default English locale (`d MMM yyyy`, `h:mm a`, `d MMMM, yyyy`). `formatEventDateRangeInTimeZone` hardcodes `Intl.DateTimeFormat('en-GB', …)`. `formatMoney` hardcodes `'en-US'`. `formatMoneyMinor` defaults `locale = 'en-GB'`. That will not satisfy PLT-02 (EN + IT) if both apps share this module unchanged.
3. **New shared-package dependency.** Extracting as-is means `date-fns` becomes a runtime dependency of the domain package. `Intl` alone would cover most of these helpers without that.

**Decisions a human needs to make (not a one-line edit):**

- Does format even belong in the shared package, or does each app keep its own formatters?
- If shared: locale as a required argument (or a small `format` subpath that is *not* the domain kernel), and whether to drop `date-fns` for `Intl`.
- `flagEmoji` / `countryName` / `PROFILE_NATIONALITIES` are display helpers with a hardcoded GB/IT/JP/… map — same question.

`date-fns` and `Intl` both run in Expo (Hermes) and in a browser React app; this is **not** a “web-only Date API” break. The issue is **locale + layering**, not a missing polyfill.

---

## Mix / split candidates

**No file mixes framework-pure logic with React/RN/storage in the same file.** The one close call is localisation, not framework:

- `src/features/rules/engine.ts` is framework-pure, but `deriveCategory` writes **English** `note` / fallback `categoryName` strings (`'Category set by the youngest included member'`, `'No matching category'`, the crew-average template, `'Aggregate (sum) of member ages'`). Those strings surface on screen as rule-effect copy. If the shared engine must be bilingual, split “numeric derivation” from “note text” (return a stable note *code*, let each app’s i18n resolve it). That is a product/i18n decision, not a purity blocker for extraction.

`statusLifecycle.ts` `STATUS_KIND` (`progress` / `success` / `terminal_bad` / …) is a presentation taxonomy stored as data. Still plain TS; both apps can map kinds to colours locally.

---

## Packaging notes (not impurities)

These do not fail the purity bar. They will surprise whoever copies the folder.

1. **Barrel files are incomplete.** `src/domain/models/index.ts` does **not** re-export `finance`, `communications`, `preRegistration`, or `accreditationDesk`. `src/domain/repositories/index.ts` does **not** re-export the matching four repository files. Those files are still pure and extractable; a consumer that only imports the barrel will miss them.
2. **Path alias `@/`** is an Expo `tsconfig` path (`"@/*": ["./src/*"]`). The shared package needs its own `tsconfig` (and must not extend `expo/tsconfig.base`).
3. **`COMO_DEMO_PARTICIPANT_ID`** in `src/domain/models/consent.ts` is a demo UUID constant inside the domain model. Fine as TS; decide whether seed IDs belong in the shared package or in app fixtures.
4. **`Event` still carries listing-UI fields** (`statusBanner`, `ctaLabel`, `cardImageKey`, `heroImageKey`, …). Types-only, so still extractable; they are leftover POC presentation on a domain type, not a React import.
5. **`ResultsRepository.subscribeToMatch`** is a callback + unsubscribe function, not a REST verb. Still pure TS. Backend mapping later is a separate conversation.
6. **`PaymentRepository.processMockPayment`** — the `Mock` in the method name is POC naming on an otherwise clean interface.

---

## What was *not* found

- Zero `react` / `react-native` / `expo-router` / `lucide-react-native` imports under `src/domain/**`
- Zero `className` / NativeWind under `src/domain/**`, `engine.ts`, `statusLifecycle.ts`, `statusLabels.ts`, `format.ts`
- Zero `zod`, AsyncStorage, or `@/components` / `@/theme` in the audited set
- No `src/domain/**/*.tsx` files
- No other `src/features/*/engine*.ts` besides the rules engine + its two test files

---

## Suggested extract-day split (opinion, not a change)

| Goes into the shared package as-is | Stays in each app (or waits for a decision) |
|---|---|
| `src/domain/models/*` | `statusLabels.ts` (until CopyDict is inlined **and** someone decides labels are shared) |
| `src/domain/repositories/*` | `src/lib/format.ts` (UI formatters + English locale) |
| `src/features/rules/engine.ts` | engine `*.test.ts` until fixture ownership is decided |
| `src/features/registration/statusLifecycle.ts` | `useRules.ts` and every mock repository (never candidates) |
