<!-- COMO2027-CURRENT-ENGAGEMENT -->
> 🎯 **CURRENT ENGAGEMENT — Como Lake 2027 (read this first).**
> This project has pivoted to the revised **World Masters Sport / Como Lake 2027** RFP (REV-022, 2026-09-01).
> **Canonical entry point:** `context_docs/docs/START_HERE.md` (path from repo root).
> The **engineering rules** below (stack, TypeScript strict, Expo Router, NativeWind, repository pattern, DoD, Expo-Web-first) **still apply**.
> But any **scope, source-of-truth list, screen flow, or "Main demo path (A01–A18)"** below is **superseded** — take scope from `context_docs/docs/DELIVERY_PLAN_COMO2027.md` and the screen map in `context_docs/docs/BUSINESS_OVERVIEW_COMO2027.md` §7, not from the old lists.

# CLAUDE.md

Read `AGENTS.md` first and treat it as the primary engineering instruction file.

**Before any implementation session**, also read (all under `context_docs/docs/`):
- `START_HERE.md` — index/router (read first)
- `PROGRESS_COMO2027.md` — current phase, what's done, what's next
- `REVISIONS.md` — approved plan/stack changes (latest `REV-###`)

Before product/domain work, also read `context_docs/docs/BUSINESS_OVERVIEW_COMO2027.md` so you understand the Como Lake 2027 RFP scope and the participant/admin portal boundary.

**Before ending a session:** update `context_docs/docs/PROGRESS_COMO2027.md`. If stack/plan/architecture changed, add a `context_docs/docs/REVISIONS.md` entry first.

## Working mode
You are implementing a fast but reusable React Native Expo POC for the IMGA Athlete Mobile experience.

Before changing code:
1. Inspect the current repository.
2. Read the relevant files under `context_docs/docs/` (start at `START_HERE.md`).
3. State the smallest implementation plan.
4. Reuse existing components and patterns before adding new ones.
5. Keep mock data behind repositories/services.

## Non-negotiable
- Do not hardcode mock entities inside screens if they belong in fixtures.
- Do not let UI import fixture JSON directly.
- Do not introduce a backend unless explicitly requested.
- Do not introduce a real payment or OTP provider.
- Do not build an actual scoring engine.
- Do not replace the documented screen flow with your own interpretation.
- Do not create unnecessary libraries or architectural layers.
- Do not remove type safety to move faster.

## Preferred task size
Work feature-by-feature:
- auth
- events
- registration
- partner finder
- payment
- registration status
- accreditation
- GamesHub
- live results

For each feature:
- domain types
- mock repository implementation
- feature hooks
- screen(s)
- reusable components
- state handling

## Validation
After meaningful changes:
- run TypeScript checks
- run lint if configured
- fix runtime/navigation errors
- verify the main path still works

## Main demo path
**Superseded (old A01–A18 athlete-only flow).** The current demo path = the Como Lake 2027 scripted scenarios (RFP §9.3) across the participant + admin portals — see `context_docs/docs/DELIVERY_PLAN_COMO2027.md` §2.2 and the screen map in `BUSINESS_OVERVIEW_COMO2027.md` §7.


## Web-first implementation workflow
Optimize implementation for **Expo Web first** so screens can be reviewed rapidly in a browser.

However, this is still a React Native mobile codebase:
- keep components React Native compatible
- avoid DOM-specific screen implementations
- avoid separate web-only screen trees
- mock native-only integrations during POC when practical
- validate Android/iOS after each screen batch rather than during every small visual iteration

When choosing between two equally good approaches, prefer the one that gives a fast Expo Web feedback loop without reducing later Android/iOS reuse.
