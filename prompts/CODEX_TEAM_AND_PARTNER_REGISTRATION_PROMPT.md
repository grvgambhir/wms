# Task: an athlete can actually register a doubles, team or crew entry

Repos: `wms_backend` (NestJS + PostgreSQL 18), `wms_participant` (Expo / React Native + web).
Root: `/Users/gauravgambhir/Desktop/Code_Life/wms`. Node 22 — run backend commands through the root
scripts (`npm run test:backend`, `npm run typecheck:backend`, `npm run build:backend`), which use
`scripts/node22.sh`.

Suggested: Codex, **high** reasoning. The database guarantees around rosters, categories and locks
already exist and are strict; the work is to let a real athlete reach them without a seeded fixture.

---

## Why this exists

An athlete can now create and complete an **individual** entry end to end
(`POST /v1/me/entries` → evidence → checkout → status). A **doubles, team or crew** entry cannot be
completed by anyone:

- there is **no endpoint that creates a team**. `roster.controller.ts` has
  `POST /v1/teams/:teamId/invitations` and `POST /v1/teams/:teamId/lock`, but nothing that makes the
  `core.team_roster` row in the first place, so `:teamId` can only come from the seed;
- the participant **partner finder simulates acceptance in the UI**
  (`DEMO_AUTO_ACCEPT_PARTNER_ID` in `app/(participant)/partner-finder.tsx`) — the invited athlete is
  never asked, and `POST /v1/partner-requests/:requestId` (accept/decline) is never called by the
  other side;
- `app/(participant)/team-roster.tsx` reads a roster it cannot create.

So every team demo runs on seeded rows, and the category for a doubles/team/crew entry — the thing
this product exists to compute — is never derived from athletes who chose each other.

RFP: **REG-06** (team/crew entries and rosters), **REG-07** (team visibility for the members),
**REG-11** (status lifecycle), **RUL-01/03/04** (category derivation, change, audit).

## What already exists — do not rebuild it

| Piece | Where |
|---|---|
| Roster versions, publish, locks, substitutions + revalidation | `src/roster/*`, migration `1700000027000` |
| Partner requests (create, cancel, accept/decline) | `POST /v1/partner-requests`, `/cancel-outgoing`, `/:requestId` |
| Team invitations, accept/decline, team lock | `POST /v1/teams/:teamId/invitations`, `/v1/team-invitations/:id/accept|decline`, `/v1/teams/:teamId/lock` |
| Entry creation + category pinning for individual products | `registration-mutations.ts` `createEntry` |
| Category derivation for youngest / crew-average / relay | `src/rules/*` |

## What to build

### 1. Backend: create a team for an entry

`POST /v1/me/entries/:entryId/team` (participant, token-scoped, `Idempotency-Key`), creating the
`core.team_roster` row and its first version with the caller as a member, and linking it to the entry
(`registration_entry.team_roster_id`). Refuse with the existing problem-details codes when:

- the entry is not the caller's (404, do not leak existence);
- the product's `participant_type` is `individual` (422 `VALIDATION_ERROR`);
- the entry already has a team (409 — return the existing team id in `fields`);
- the entry is not in a state that can still be configured (422 `START_LIST_NOT_DRAFT` style refusal —
  reuse what `saveEntry` already enforces, do not invent a second rule).

Team size limits and role requirements (coxswain, minimum members) must come from the product/rule
row, not constants in the service.

### 2. Backend: the partner/member side must be real

- The invited athlete can list what is waiting for them: extend or add a token-scoped read
  (`GET /v1/me/invitations`) covering both partner requests and team invitations.
- Accepting a partner request must set the partner on the **inviting athlete's entry** and re-derive
  the category (youngest-member for doubles), writing the `core.category_audit` row the same way a
  roster change does. Accepting must be refused once the team or entry is locked.
- Each acceptance is one idempotency key per click; never a key built from record ids (a real bug:
  a deterministic key replayed the first response and the UI showed success while nothing changed).

### 3. Backend: category for a team entry is derived, never client-supplied

When a roster version is published, the entry's current category must come from the same derivation
the rules module owns. **Note before you start:** three derivations exist today
(`mutations.deriveCategory`, `rules/load.deriveLoaded`, `roster/helpers.categoryForVersion`) and they
already disagree in the admin UI. Pick the rules-module one as authoritative, route the others through
it, and say in your summary what changed. Do not add a fourth.

### 4. Participant app

- `register.tsx`: choosing a doubles/team/crew product creates the entry and routes into building the
  team instead of straight to the journey.
- `team-roster.tsx`: create a team, invite by search, see pending/accepted members, remove a pending
  invite, and see the live derived category + fee as members join.
- `partner-finder.tsx`: **delete the simulated acceptance.** An invite stays pending until the other
  athlete accepts. Document what the demo loses.
- A screen or section where the invited athlete sees and answers invitations (accept/decline).
- Empty, loading, refused and locked states everywhere; EN + IT copy for every new string
  (`src/constants/copy.ts` + `src/i18n/it.ts`).

## Cautions

1. **Never relax token scoping** to make data appear. A participant must never read another
   participant's entry or roster; team members may see only what REG-07 allows.
2. **Do not widen a database boundary** (no new GRANT, no reading `restricted.*`) to make a query work.
3. **Guarantees belong in the database** where one already exists — reuse the roster lock and category
   triggers rather than re-checking in a service.
4. **Idempotency: one key per click.**
5. **vitest does not typecheck.** Run every gate.
6. **Never commit or push.**

## Tests

Backend (real database, like the other specs):

- Creating a team: happy path; individual product refused; second team refused with the existing id;
  another athlete's entry gives 404; the same `Idempotency-Key` twice creates one team.
- A doubles entry's category changes when the partner accepts, and `core.category_audit` records
  original → new with the trigger and timestamp.
- Accepting into a locked team/roster is refused with `ROSTER_LOCKED`.
- A participant token cannot read or act on another participant's team (over HTTP).
- The derivation used at publish equals the rules module's own result for the same members
  (the anti-divergence test).

Participant (`npx jest`): register → team route for a team product; invite stays pending until
accepted; category and fee update when a member joins; refusals render their copy; two invites send
two different idempotency keys.

## Gates — all green, from the root

```
npm run test:backend
npm run typecheck:backend
npm run build:backend
cd wms_participant && npx tsc --noEmit && npx jest
```

`wms_participant` has 3 pre-existing `tsc` errors (`messages.tsx` ×2, `useProfileConsent.test.tsx`) —
no **new** ones. `npm run lint:backend` fails on ~49 pre-existing prettier files; your new and changed
files must be lint-clean.

## Definition of done — report back with

1. The new endpoints and their refusals, as a short table.
2. What you did about the three category derivations.
3. Gate output (test counts, typecheck, build).
4. What the demo loses by removing the simulated partner acceptance, and how to run the two-athlete
   flow by hand (two Cognito logins).
5. A `REVISIONS.md` entry in `wms_participant/context_docs/docs/` (next REV number after REV-075) and a
   `PROGRESS_COMO2027.md` session-log row.
