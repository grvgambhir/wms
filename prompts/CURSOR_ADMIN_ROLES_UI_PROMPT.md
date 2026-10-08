# Task: the People & Roles screen in wms_admin

Repo: `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_admin`
Backend (already built, **do not change it**): `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_backend`

Run everything with one command from `/Users/gauravgambhir/Desktop/Code_Life/wms`:
`npm run dev` (backend :3050, api :3040, admin :5173, participant web :8081).
`npm run dev:clean` frees the ports if a stale watcher is holding one.

---

## Why this screen exists

There is currently **no way in any UI to make someone an administrator.** The endpoints are
built and the database guarantees are in place; the screen on top of them is missing, so the
only way to grant `oc_staff`, `oc_admin` or `finance` today is a hand-written `curl` or a
direct `INSERT`. That is not an operation the OC can run during the Games.

Read this next part before writing code, because it decides the shape of the screen.

### This screen is the entire admin-creation path, and that is on purpose

Three separate things stop a stranger becoming an administrator, and **you are building on top
of all three — do not add a fourth in the UI and do not weaken any**:

1. There is no sign-up in `wms_admin`. `App.tsx` routes are `/sign-in` and `/forgot-password`.
   **Do not add a registration route.**
2. `POST /v1/admin/people/:personId/roles` is on a controller annotated `@Roles('oc_admin')`.
3. A database trigger (`person_role_oc_needs_admin_granter`, migration `1700000017000`)
   refuses any non-`participant` role whose `granted_by` does not itself hold `oc_admin`.
   The one exception is bootstrap: the very first `oc_admin`, while no `oc_admin` exists.

The UI is a convenience over rule 2 and 3. It is never the thing enforcing them, so a bug in
your code must not be able to produce a role — it can only produce a refusal.

### `RequireAuth` is NOT sufficient for this page

`sessionMayUseAdmin()` in `src/auth/AuthProvider.tsx` returns true for `oc_admin`, `oc_staff`
**and** `finance`. So the existing guard would let a finance clerk open a page whose every
button grants administrator rights. Every request would be refused by the API with a 403, but
a screen full of controls that all fail is a bad screen and it leaks the OC's people list.

Gate this route on `oc_admin` specifically. Add a `RequireOcAdmin` (or a `roles` prop on
`RequireAuth` — your call, but say which you picked and why) and render an explanation, not a
blank page, for a signed-in non-admin.

---

## The API you are consuming

**Base URL is `wmsBackendBaseUrl()` from `src/auth/env.ts` (:3050) — NOT `wmsApi.ts`.**
`src/api/wmsApi.ts` points at `VITE_WMS_API_URL` (:3040), the temporary Express shim that is
being retired. Sending these calls there gets a 404. If you add a shared request helper for
the backend, put it beside `wmsBackendBaseUrl`, and reuse the bearer-token + 401-refresh
behaviour that `apiRequest` already implements rather than re-inventing it.

### `GET /v1/admin/people?search=&cursor=&limit=`

```ts
{ items: Array<{ id, givenName, familyName, email: string | null,
                 profileStatus: string, roles: string[] }>,
  cursor?: string }
```

`search` matches given name, family name, email, or `"given family"`. Pagination is
**keyset**: pass back the `cursor` you were given, verbatim. A response with no `cursor` is
the last page. Do not build page numbers — there is no offset and no total.

### `POST /v1/admin/people/:personId/roles`

Body `{ roleCode: 'oc_staff' | 'oc_admin' | 'finance', eventId?: string | null }`.
Returns `200 { personId, roleCode, eventId }`. Re-granting an existing role is a no-op 200.

### `DELETE /v1/admin/people/:personId/roles/:roleCode?eventId=`

Returns `204`.

### Both mutations REQUIRE an `Idempotency-Key` header

Send a fresh UUID per user action (`crypto.randomUUID()`), and **reuse the same key when the
user retries the same action** after a network error — that is the entire point. A new key on
retry is a second grant attempt, not a retry. Do not generate the key inside the fetch call
where a retry silently makes a new one.

### Errors are RFC 9457 problem details, not the shape `wmsApi.ts` expects

The body is `{ type, title, status, code, detail, instance }`. Note `detail`, **not**
`message` — the existing `ApiError` parser reads `body.message` and would show
`"Request failed (422)"` for every refusal. Read `code` for logic and `detail` for the key.

`detail` is an **i18n key**, never a sentence (e.g. `admin.role.last_oc_admin`). Map keys to
English copy in the UI. Showing the raw key to a user is a bug.

Codes you must handle explicitly, because each one means something different to the operator:

| code | what happened | what the screen should say |
|---|---|---|
| `LAST_OC_ADMIN` | they tried to revoke their own last `oc_admin` | refuse, and explain they would lock everyone out |
| `ROLE_NOT_GRANTABLE` | `participant` was passed | should be unreachable — `participant` is self-service |
| `GRANTER_MUST_BE_OC_ADMIN` | the DB trigger refused | the actor is not an admin; re-check the session |
| `PERSON_NOT_FOUND` / `PERSON_ROLE_NOT_FOUND` | stale list | refresh the row |
| `VALIDATION_ERROR` | bad role code or id | show the field |

**Never swallow a refusal into a generic toast.** `LAST_OC_ADMIN` in particular is the
system protecting the OC from locking itself out; the operator has to understand it.

---

## What to build

- Route `/people`, page `src/pages/PeoplePage.tsx`, plus a nav entry in
  `src/components/layout/AdminPortalShell.tsx`. Put it in a new **Administration** section
  rather than under Configuration — it is people, not settings. Show it only to `oc_admin`.
- Search box (debounced), the people list, and a "Load more" that uses `cursor`.
- Each row: name, email, `profileStatus`, and current roles as removable chips.
- Grant control per person: pick a role from `oc_staff | oc_admin | finance`, optional event
  scope, submit. **`participant` must not be offered** — the API refuses it and it is granted
  by completing a profile.
- Revoking asks for confirmation and names the person and role in the prompt. Granting
  `oc_admin` also confirms, and the confirmation must say plainly that this person will be
  able to grant and revoke administrator rights, including removing the person doing it.
- Optimistic UI is fine, but a refusal must roll the row back to what the server last said.

### Follow the repository pattern

`.claude/CLAUDE.md`: **"Do not let UI import fixture JSON directly."** So:
`AdminPeopleRepository` (the interface), `ApiAdminPeopleRepository` (real HTTP),
`MockAdminPeopleRepository` (tests and offline demo), a `useAdminPeople` hook in `src/hooks/`.
`ApiEntryGovernanceRepository.ts` + `InMemoryEntryGovernanceRepository.ts` are the pattern
already in this repo — match them.

---

## Tests (vitest + @testing-library/react, colocated `*.test.tsx`)

Existing page tests are the style guide — see `src/pages/ExceptionsPage.test.tsx`.

Cover, at minimum:

1. A `finance`-only session opening `/people` sees the refusal, **and no people list**.
2. An `oc_admin` grants `oc_staff` and the chip appears.
3. The grant dropdown **never** contains `participant`.
4. A `LAST_OC_ADMIN` refusal is rendered as its explanation and the chip stays.
5. Two pages of results via `cursor`, with the second request carrying the first's cursor.
6. Retrying a failed grant reuses the first `Idempotency-Key`; a *new* grant uses a new one.

Test 6 is the one worth writing carefully — assert on the header value across two fetches, not
just that a header exists.

---

## Definition of done

- `npm run test` green in `wms_admin` (currently 51 tests — none may break).
- `npm run build` clean.
- Hand-tested against a live backend, and tell me **which account you used and what happened**.
  To get an admin token: `cd wms_backend && npm run token -- <email> <password> admin`.
  If the DB has no `oc_admin` yet, the bootstrap branch of the trigger lets the first one in.

Report anything in the backend contract that turned out to be wrong or awkward. Do not fix it
in `wms_backend` yourself — tell me and I will decide.
