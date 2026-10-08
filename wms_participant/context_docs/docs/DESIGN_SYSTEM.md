# DESIGN_SYSTEM.md

<!-- STATE-COMO2027 -->
> ✅ **CURRENT — tokens/primitives still valid; EXTEND for the Como portals.**
> Participant WMS-blue palette + RNR primitives carry over. Como work **adds**: the responsive **portal shells** (participant left-nav + admin "OC Command Centre" dark navy) and any admin-specific tokens. The "premium mobile app" intent below now applies to the **participant mobile** view; the **desktop portal** look follows the Como mockups (verified against the RFP). Scope/screens: [`START_HERE.md`](./START_HERE.md) → `DELIVERY_PLAN_COMO2027.md`.

## Design intent
Premium international sports event app — **cool, aesthetic, modern, energetic, trustworthy**.

It should feel like a **premium consumer sports product** (event app / lifestyle), not an enterprise admin portal or generic form UI.

**Mockups are directional references, not pixel-perfect specs.** Improve layout, depth, motion, and visual drama where it makes the product feel more premium — as long as flow, hierarchy, and screen purpose stay aligned with the Como screen map in `BUSINESS_OVERVIEW_COMO2027.md` §7 (verified against the RFP; RFP wins).

## Aesthetic direction (mandatory)

Aim for the **coolest credible athlete-app aesthetic** within POC speed:

- **Depth & atmosphere:** subtle background gradients, layered surfaces, soft shadows where helpful
- **Transparency / glass:** frosted or semi-transparent cards, overlays, and hero treatments where they improve hierarchy (e.g. event heroes, GamesHub, accreditation pass)
- **Gradients:** use on heroes, primary CTAs, key cards, and accent moments — **not** on every control or every row
- **Sports energy:** bold typography, confident spacing, event imagery, status chips that feel alive
- **Restraint with flair:** premium ≠ cluttered; one strong visual moment per screen is often enough

Use mockups + `context_docs/imga-athlete-single-screens/` for **layout, flow, and content** — then **elevate** with gradients, transparency, and polish per this doc.

## Core visual principles
- light neutral surfaces with optional soft gradient backgrounds
- World Masters Sport blue (`#4887CA`) + gradient variants for heroes/CTAs
- clear visual hierarchy
- restrained but impactful event imagery
- rounded cards (including glass / translucent variants where appropriate)
- generous spacing
- clear status colors
- strong but simple typography
- compact forms split into logical steps
- large touch targets
- consistent bottom/action areas
- subtle motion on press, progress, and key transitions (Reanimated where worthwhile)

## Gradient & transparency rules

| Use freely | Use sparingly | Avoid |
|------------|---------------|--------|
| Event hero headers | Full-screen rainbow gradients | Gradient on every list row |
| Primary CTA buttons | Heavy glow / neon effects | Low-contrast text on glass |
| Featured cards (event, match, accreditation) | Multiple competing gradients on one screen | Illegible overlays on photos |
| App background atmosphere (soft) | Frosted nav / bottom bars | Desktop-dense form layouts |
| Status accent strips / chips | | Random hex outside tokens |

Implement via **central tokens** (`src/theme/`, `global.css`) — e.g. `gradientPrimary`, `glassSurface`, `heroOverlay` — not one-off values per screen.

## Suggested tokens

### Colors
Use semantic tokens rather than hardcoded colors in components.

```ts
colors = {
  background: "#F5F8FB",
  surface: "#FFFFFF",
  surfaceMuted: "#EEF3F8",
  primary: "#4887CA",
  primaryDark: "#0C71C3",
  text: "#1A1A1A",
  textMuted: "#666666",
  border: "#E3EDF5",
  success: "#16A34A",
  warning: "#F59E0B",
  danger: "#DC2626",
  info: "#0C71C3",
  // Gradient / glass tokens — map in theme + global.css
  gradientPrimaryStart: "#0C71C3",
  gradientPrimaryEnd: "#4887CA",
  gradientHeroStart: "#0A4F8C",
  gradientHeroEnd: "#008FD5",
  glassSurface: "rgba(255, 255, 255, 0.72)",
  glassBorder: "rgba(255, 255, 255, 0.35)",
}
```

Palette is matched to the World Masters Sport site (`worlmasters.html`, REV-021). Use centralized tokens — do not hardcode brand hex in screens.

### Radius
```ts
radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
}
```

### Spacing
Use a 4pt/8pt-friendly scale.

```ts
spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
}
```

## Typography
Prioritize legibility over novelty.

Suggested hierarchy:
- Display / event hero
- H1 screen title
- H2 section title
- Body
- Small/meta
- Button label
- Status label

Use one modern sans-serif family consistently.

## Core reusable components
Build these before or during the first screens:

### Foundation
- `AppScreen`
- `AppHeader`
- `SafeAreaContainer`
- `Section`
- `Divider`
- `BottomActionBar`

### Inputs
- `TextField`
- `SelectField`
- `DateField`
- `OtpInput`
- `CheckboxRow`
- `SearchField`

### Actions
- `PrimaryButton`
- `SecondaryButton`
- `TextButton`
- `IconButton`

### Cards
- `EventCard`
- `SportCard`
- `RegistrationSummaryCard`
- `DocumentCard`
- `PartnerCard`
- `MatchCard`
- `AccreditationCard`
- `InfoCard`

### Status
- `StatusBadge`
- `ProgressStepper`
- `RegistrationTimeline`
- `QuotaBadge`

### Feedback
- `LoadingState`
- `EmptyState`
- `ErrorState`
- `SuccessBanner`
- `ActionRequiredBanner`

## Navigation patterns
Pre-registration:
- back navigation
- screen titles
- registration progress stepper

Event-time:
- bottom navigation or tab structure
- GamesHub as primary home

## Registration UX
Do not show one massive form.

One logical task per screen:
- profile
- entry
- documents
- photo
- partner
- review
- payment

Each screen should:
- explain why the information is needed
- show a clear primary action
- allow safe save/exit if useful
- preserve entered data

## Status language
Use user-friendly states:
- Under Review
- Action Required
- Waitlisted
- Approved
- Accreditation Ready
- Live
- Completed

Avoid internal backend names in UI.

## Accessibility
- minimum comfortable tap targets
- sufficient text contrast
- do not rely only on color for state
- readable type sizes
- support dynamic content without clipping
- avoid dense information at small sizes

## Responsive target
Optimize for common phones first:
- iPhone 15/16 class widths
- typical Android 360–430dp widths

Avoid pixel-perfect assumptions tied to one screenshot size.

## Asset strategy
Keep local POC assets organized:
```text
assets/
  branding/
  events/
  sports/
  athletes/
```

Mock fixture data should use stable asset keys rather than importing images inside screen code.

Example:
```ts
event.heroImageKey = "como2027Hero"
```

Resolve keys through a single asset registry.


## Expo Web layout (REV-011)
The same React Native screens present as a **mobile app** under 768px and as a **website** at 768px and above.

When running on Expo Web:
- **compact** (`<768` or `m.*` host, plus native): stacked content, bottom nav, mockup-aligned spacing
- **tablet / desktop** (`≥768`): top `WebAppHeader`, `max-w-7xl` page container, multi-column (`SplitPageLayout`, grids)
- **auth** (`≥768`): full-viewport split (hero | form). Do not center a `max-w-5xl` card. OTP CTAs sit under the form — not pinned to the bottom of the viewport.
- **stack screens** (`≥768`): `WebAppHeader` via `StackWebChrome` / `RegistrationFormLayout` site nav
- **density (REV-015):** pressable hub cards use `CARD_HOVER`; page titles use `PAGE_TITLE` / `PAGE_LEAD` (laptop steps up; compact stays mockup-sized)
- **empty states:** `EmptyState` tones (`search` | `calendar` | `lock` | `inbox` | `folder`) plus a description — not a search icon for every empty
- **hub CTAs:** do not drop a lone `w-full` GradientButton in a `SplitPageLayout` rail. Put the button in `EmptyState.action` (empty hubs) or `PageCtaPanel` (aside with title + copy)
- do not pin main pages to `max-w-2xl` / `max-w-3xl` phone strips on laptop widths
- do not stretch readable text edge-to-edge on ultra-wide (cap at `max-w-7xl` + gutters)

The source UI must still behave correctly on real phone dimensions. Do not fork a separate React/Vite athlete site.

Primitives: `WebPageLayout`, `SplitPageLayout`, `PageCtaPanel`, `ResponsiveGrid`, `RegistrationFormLayout` (wizard rail + site nav), `AuthFormLayout` (full-bleed split), `StackWebChrome`, `src/constants/layout.ts` (`CARD_HOVER`, `PAGE_TITLE`, `PAGE_LEAD`).
