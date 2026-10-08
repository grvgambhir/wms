# Task: temporary authentication for wms_backend

Build working auth so development can proceed. A real identity provider (Auth0 / Cognito /
Keycloak) is still being selected — decision D5 in `PHASE_B_PLAN.md` — so **this is a
placeholder behind a seam**, not the production answer.

Repo: `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_backend`
Plan: `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_participant/context_docs/docs/BACKEND_DB_PLAN.md`

**Run this only after your F12/F13 work is finished and its tests are green.** They touch
`core.person`; this touches a new table beside it.

---

## Why the seam matters more than the implementation

The reference pattern is Stupa's TMS gateway
(`/Users/gauravgambhir/Desktop/Code_Life/saas_be/gateway/src/routers/auth_router.py`): the
gateway never authenticates anything itself — it calls out to an auth service for
`generate_access_token` / `verify_access_token` and guards every request with the result.

Copy **that shape**, not that code (their auth service is not in this repo). Everything the
application sees must go through one interface:

```ts
export interface IdentityProvider {
  authenticate(email: string, password: string): Promise<AuthenticatedIdentity | null>;
  issue(identity: AuthenticatedIdentity): Promise<TokenPair>;
  verify(accessToken: string): Promise<AuthenticatedIdentity>;
  refresh(refreshToken: string): Promise<TokenPair>;
  revoke(refreshToken: string): Promise<void>;
}
```

`LocalIdentityProvider` implements it now. Swapping to Auth0 later must be a **provider
swap plus a config change** — nothing in guards, controllers or services may reference JWTs,
password hashes or the credential table directly. If you find yourself importing
`jsonwebtoken` outside the provider, the seam has leaked.

---

## Security decisions — pinned. Do not substitute defaults.

These are the parts that are invisible when wrong. Every one is deliberate:

1. **Password hashing: `argon2id`**, memory 19 MiB, time cost 2, parallelism 1 (OWASP 2024
   minimum). Not bcrypt, not scrypt, not argon2's library defaults.
2. **Verify JWTs with the algorithm pinned explicitly** — `{ algorithms: ['HS256'] }`.
   Omitting it is the algorithm-confusion vulnerability: a token claiming `alg: none` or a
   swapped algorithm gets accepted.
3. **Access token 15 minutes. Refresh token 30 days, rotated on every use.**
4. **Detect refresh-token reuse.** A rotated token presented a second time means it leaked:
   revoke that whole token family and force re-login. Store a hash of the refresh token,
   never the token.
5. **Never reveal whether an email exists.** Wrong password and unknown user return the same
   response — and take the same time. Run the hash verification even when no user is found,
   against a dummy hash, so response timing does not answer the question.
6. **Rate limit `/login`** — 5 attempts per email per 15 minutes, and separately per IP.
   Return 429, and never leak which limit was hit.
7. **`JWT_SECRET` comes from validated config** (`src/config/env.ts`, Zod) with **no default
   value**. Boot must fail loudly if it is absent. A fallback secret in source is how a dev
   secret reaches production.
8. **Tokens carry `sub` (person id), `roles`, `iat`, `exp`, `jti` — nothing else.** No email,
   no name. Access tokens are readable by anyone holding them.

---

## What to build

**Migration** (timestamp after your F12/F13 one):

```sql
-- TEMPORARY. Deleted when D5's identity provider lands; nothing else references it.
core.user_credential(person_id PK/FK, email citext UNIQUE, password_hash,
                     failed_attempts, locked_until, password_changed_at, created_at)

core.refresh_token(id, person_id, token_hash UNIQUE, family_id, issued_at,
                   expires_at, revoked_at, replaced_by)

core.role(code PK, description)                     -- participant | oc_staff | oc_admin | finance
core.person_role(person_id, role_code, event_id NULL, granted_by, granted_at, PK(person_id, role_code))
```

`event_id` on `person_role` because a person may be OC staff for one edition and a
participant in another — the schema is multi-edition everywhere else (see §3 of the plan).

**Endpoints** under `/v1/auth`: `POST /login`, `POST /refresh`, `POST /logout`,
`GET /me`. Password reset is **out of scope** — it needs real email delivery, which does not
exist yet. Say so in the README rather than stubbing it.

**Guard + decorators:** `@Public()` for unauthenticated routes (default is authenticated —
opt out, never opt in), `@Roles('oc_admin')` for role checks. Register the guard globally.

**One integration point you must not miss:** `IdempotencyService` takes a `scope` argument
that keys stored responses per caller (`src/common/idempotency/idempotency.service.ts`).
The guard must put the authenticated person id where request handlers can pass it as that
scope. Getting this wrong means one caller can be handed another's stored response.

**Seed** an OC admin and a participant for local dev, from env vars, **only when
`NODE_ENV !== 'production'`**.

---

## Tests (Vitest, real Postgres — the harness gives each run a throwaway database)

- login succeeds; wrong password fails; **unknown email and wrong password are
  indistinguishable** in both body and status
- expired access token rejected; token signed with the wrong secret rejected; token with a
  tampered `alg` header rejected
- refresh rotates; **the old refresh token used again revokes the family**
- `@Roles('oc_admin')` rejects a participant with 403
- a route with no `@Public()` and no token returns 401
- rate limit trips at the 6th attempt

---

## Do NOT

- ❌ Touch `migrations/1700000004000_quota_pools.sql`, `test/concurrency.spec.ts`, or
  `src/common/{idempotency,http,pagination}` — those are being worked on in parallel
- ❌ Edit `BACKEND_DB_PLAN.md` — report what it should say
- ❌ Modify `wms_participant`, `wms_admin`, `wms_domain`, `wms_api`
- ❌ Implement MFA, SSO, password reset or email verification — D5's provider brings those,
  and a half-built MFA is worse than none because it looks finished
- ❌ Put `passportNumber` or anything else sensitive into a token or a log line

---

## Mark it clearly

Every file you add starts with:

```ts
// TEMPORARY AUTH — placeholder until decision D5 selects an identity provider.
// Not production: no MFA (PLT-04 is a mandatory gate item), no password reset,
// passwords stored locally. Replace LocalIdentityProvider, keep the interface.
```

And a README section: what this is, what it deliberately does not do, and what has to
happen before it can face real users.

---

## Report back

1. What you built and what you deliberately left out
2. Any pinned decision above you disagree with, and why — I would rather argue than have you
   silently follow something wrong
3. What `BACKEND_DB_PLAN.md` should say about auth
4. Anything you could not verify
