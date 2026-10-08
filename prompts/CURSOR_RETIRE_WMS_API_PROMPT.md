# Task: cut both apps over to wms_backend and retire wms_api

Repos: `wms_participant`, `wms_admin`, `wms_api` (deleted), `wms` (root scripts).

**Do this last.** It depends on every other backend prompt being finished: registration
mutations, evidence, rosters, accreditation, rules, and the admin work queues. If any of those
is outstanding, stop and say which — cutting over early means a screen that silently loses its
data source.

---

## What this ends

`wms_api` is a temporary Express shim (REV-029). It serves **33 routes** whose storage is
`wms_api/data/db.json` plus a set of in-memory mocks that reset on restart. It was the right
call when there was no database; there is one now, and every day both exist is a day two
services can disagree about the same record.

## First: prove the backend covers everything

Before deleting anything, produce a **route-by-route table**: each of the 33 routes in
`wms_api/src/http/routes.ts`, the `wms_backend` route that replaces it, and whether the
response shape is identical.

Where a shape differs, say so — **do not quietly reshape the app to match**. A changed shape
is a decision for me, and it is also the most likely place for a silent regression, because
both versions will render something.

If a route has **no** replacement, that is a gap in the backend work, not something to paper
over in the client. List it and stop.

## Then: repoint, do not rewrite

- `wms_participant`: `src/data/api/wmsApi.ts` → the backend base URL. The `Api*` repositories
  should not need changing if the shapes match; if one does, that is a finding worth reporting.
- `wms_admin`: the repositories still importing `apiRequest` from `src/api/wmsApi.ts` move to
  `backendRequest` from `src/auth/backendRequest.ts`.
- **Keep every `Mock*` class.** They are the offline fallback and the reference implementation,
  and several tests run against them. Removing them is not part of retiring the shim.

## Authentication changes, and this is the part that will bite

`wms_api` has **no authentication**. `wms_backend` requires a bearer token on every route and
scopes results to the caller.

So a screen that worked against the shim can fail against the backend for a reason that has
nothing to do with its data: no token, an expired token, or the participant asking for
something the server now correctly refuses. Expect this, and when a screen returns less than
it used to, **check whether the old behaviour was a leak** before treating it as a regression.
The shim showing one participant another's data was never correct.

## Then delete

- Remove the `wms_api` directory.
- Remove `dev:api` from the root `package.json`, drop `api` from the `dev` and `dev:noapi`
  concurrently lines (`dev:noapi` becomes redundant — remove it), take `wms_api` out of
  `install:all`, and drop port 3040 from `scripts/dev-clean.sh`.
- `npm run dev` should start exactly three processes.
- Remove `VITE_WMS_API_URL` / `EXPO_PUBLIC_WMS_API_URL` from both `.env.example` files and tell
  me which lines to delete from my own `.env` files.
- Search both apps for `3040` and for `wms_api` and make sure nothing is left pointing at it.

## Tests

- Every suite green: backend, `wms_admin`, `wms_participant`.
- No test starts, imports, or depends on `wms_api`.
- A participant endpoint **refuses an unauthenticated request** — the property the shim never
  had, asserted now that it is the only server.

## Known limitation — do not fix in this cut-over

`GET /v1/rules?sport=&event=` can return **multiple rows** when two events share names
(`listActiveVersions` matches `rule_set.event_name` / sport name, not `event.id`).
`getRuleForEvent` taking `items[0]` is safe for Como (one event) and silently wrong for
any multi-event deployment. Do not paper over this while deleting `wms_api`; record it
on the mapping table and leave the lookup as-is unless a later prompt scopes rules by
event id.

## Definition of done

`npm run dev`, then walk both apps end to end: participant signs in, registers, pays, sees
their status and accreditation; admin signs in, reviews an entry, issues a badge, sends a
broadcast. Report which screens you exercised and anything that behaved differently from the
shim — including things that now (correctly) refuse.
