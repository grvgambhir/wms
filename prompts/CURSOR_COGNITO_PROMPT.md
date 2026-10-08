# Task: replace LocalIdentityProvider with AWS Cognito (decision D5)

An AWS Cognito user pool now exists. Swap the temporary local auth for it in `wms_backend`.

**Backend only.** The participant and admin apps come in a separate change — until the API
can verify a Cognito token, the apps have nothing to log into.

Repo: `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_backend`
Seam: `src/auth/identity/identity-provider.ts` — built for exactly this swap
Plan: `.../wms_participant/context_docs/docs/BACKEND_DB_PLAN.md` §2, "until D5"

**Node 22 required.** You will not be given real pool values — they go in `.env`, never in
code, a prompt, or a committed file.

---

## The seam already exists — use it, do not go around it

`IdentityProvider` is the only thing application code talks to. `LocalIdentityProvider`
implements it today. Add `CognitoIdentityProvider` beside it and select by config.

**If `jsonwebtoken`, `aws-jwt-verify` or any Cognito SDK appears outside
`src/auth/identity/`, the seam has leaked and the swap has failed.** Guards, controllers and
services must not change at all — that is the test of whether this was done right.

Keep `LocalIdentityProvider` for now, selected by `AUTH_PROVIDER=local|cognito` (default
`cognito`). Local stays useful for tests and offline work; delete it in a later change once
Cognito is proven.

---

## Token verification — pinned, and the part that must not be improvised

**Use AWS's own `aws-jwt-verify`.** It handles JWKS fetching, caching and key rotation
correctly. Hand-rolling this with `jsonwebtoken` is possible and is how people ship
verification bugs.

Every one of these must hold, and each has a test:

1. **Algorithm is RS256** — Cognito signs with RS256, not the HS256 the local provider used.
   Pin it explicitly. An unpinned verifier accepts `alg: none`.
2. **JWKS from** `https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/jwks.json`,
   cached, refetched on unknown `kid`. Never fetch per request.
3. **`iss` must equal** `https://cognito-idp.{region}.amazonaws.com/{userPoolId}` exactly.
4. **`token_use` must be checked.** Cognito issues *id* tokens and *access* tokens and they
   are not interchangeable. Decide which the API accepts, verify the claim, and reject the
   other. Say which you chose and why.
5. **Client id must be one of ours** — `client_id` on an access token, `aud` on an id token.
   Two app clients exist (participant, admin); accept both, and record which one the token
   came from.
6. `exp` / `nbf` honoured. No clock skew allowance beyond a few seconds.
7. **A token that fails any check is a 401 with no detail.** Never tell the caller which
   check failed.

---

## Person linking — the design call to get right

Cognito owns authentication; **this database still owns the person**. `core.person.idp_subject`
exists for the link.

First valid token for an unknown `sub`: create or link a person. **Do not link on email
alone** — email is mutable in Cognito and two pools can hold the same address. If you link
on email at all, require `email_verified` and say why in your report.

**Roles stay local.** `core.role` / `core.person_role` are authorization and are scoped per
event (`oc_staff` at Como, participant at Kansai); Cognito groups are not event-aware. Read
roles from the database keyed by `idp_subject`, not from a `cognito:groups` claim. If you
disagree, argue it in the report rather than implementing the other thing.

---

## Migration

- `core.user_credential` and `core.refresh_token` become dead once Cognito is live. **Do not
  drop them in this change** — write the migration, leave it uncommitted-to-`up`, and say so.
  Dropping credentials before the replacement is proven is unrecoverable.
- Refresh is Cognito's now. Remove our rotation only when `AUTH_PROVIDER=cognito`; the local
  provider keeps its own.
- The dev seed must still work. If seeded users cannot exist in Cognito, make the seed create
  local people with `idp_subject = NULL` and say what that means for local development.

---

## Config

`src/config/env.ts` (Zod, no defaults, fail at boot):

```
AUTH_PROVIDER                    local | cognito
COGNITO_REGION                   required when provider=cognito
COGNITO_USER_POOL_ID             required when provider=cognito
COGNITO_CLIENT_ID_PARTICIPANT    required when provider=cognito
COGNITO_CLIENT_ID_ADMIN          required when provider=cognito
```

Make them **conditionally required** — a missing pool id must fail at boot with a sentence,
not at the first login with a stack trace. Update `.env.example` with placeholders.
There is no client secret: both app clients are public. If you find code expecting one,
that is a misconfiguration to report, not to accommodate.

---

## Tests

Do not call AWS. Generate an RSA keypair in the test, serve a JWKS from it, and sign tokens
locally — that exercises the real verifier against real signatures.

- valid token → identity resolved, person linked
- wrong `iss` → 401 · wrong `client_id` → 401 · wrong `token_use` → 401
- expired → 401 · tampered payload → 401 · `alg: none` → 401
- unknown `kid` triggers exactly one JWKS refetch, then rejects if still unknown
- all four failures return the **same** body and status
- roles come from `person_role`, not from any claim in the token
- `AUTH_PROVIDER=local` still passes the existing `test/auth.spec.ts` untouched

`npm test`, `npm run typecheck`, `migrate:up → down → up` clean.

---

## Do NOT

- ❌ Change any guard, controller, service or decorator — if you need to, the seam is wrong
- ❌ Put pool ids, client ids or any AWS value in code, tests or a committed file
- ❌ Drop `user_credential` / `refresh_token` in this change
- ❌ Touch `wms_participant`, `wms_admin`, `wms_domain`, `wms_api`, or `src/registration/*`
- ❌ Implement Cognito's hosted UI, sign-up, or password reset flows — those are the app
  change, and MFA policy is a pool setting, not code
- ❌ Edit `BACKEND_DB_PLAN.md` — report what it should say

---

## Report back

1. id token or access token, and why
2. How you link a Cognito `sub` to a person, and what happens on an email collision
3. Whether you agree roles stay local
4. Exactly which env vars are needed, so they can be handed over
5. What the apps will need next (scopes, callback URLs, flows) — the next change depends on it
6. Anything you could not verify without a real pool
