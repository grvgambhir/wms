# Task: profile completion and role grants

A Cognito first login creates a person with a placeholder date of birth and **no roles**, and a
database trigger refuses a registration entry for such a person. That is deliberate — but it
means a newly signed-up athlete is currently stuck. This change unsticks them.

Repo: `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_backend`
Plan: `.../wms_participant/context_docs/docs/BACKEND_DB_PLAN.md` §2, §4.1

**Node 22.** Cognito is live (`AUTH_PROVIDER=cognito`); `npm run token -- <email> <password>`
gets a real access token for manual testing.

---

## The design call, made — argue if you disagree

**Completing a profile grants `participant` automatically, for that event.**

Requiring an administrator to hand-grant `participant` to each of ~14,000 athletes is not an
operation anyone would run. Self-signup *is* the participant journey; the role simply records
it. **OC roles — `oc_staff`, `oc_admin`, `finance` — are never self-granted** and only an
`oc_admin` may grant them.

That split is the whole security model here, so make it structural: two different endpoints,
two different guards, and no code path where the participant one can produce an OC role.

---

## `GET /v1/me` and `PATCH /v1/me/profile`

The person completes their **own** profile. `person_id` comes from the token, never from the
body — a `personId` field in the request is an escalation bug waiting to happen.

Accepts: `givenName`, `familyName`, `dateOfBirth`, `nationality`, `gender`, `phone`, `locale`,
and emergency contacts (`core.emergency_contact`, 0–N with `ordinal`).

**Email comes from Cognito, not the request body.** An access token carries no email, so call
Cognito's `GetUser` with the caller's own access token and read the authoritative attribute.
A user-typed email would let someone claim an address they do not control.

When name and date of birth are present, set `profile_status = 'complete'` and grant
`participant` for the current event **in the same transaction** — a half-completed profile
with a role, or a role without a profile, are both worse than either failure alone.

### Date of birth is not an ordinary field

It drives age banding, which drives eligibility and category. So:

- **Placeholder → real: free.** That is the whole point of this endpoint.
- **Changing it once the person holds any registration entry: refused** with a distinct code
  (`DOB_CHANGE_NEEDS_REVIEW`), not silently accepted. A corrected date of birth after entries
  exist is a category change, and this schema already has the machinery for that
  (`category_audit`, `rule_impact_analysis`) — an OC path can use it later.

Make that a database rule, not only a service check, if you can express it. If you cannot,
say what enforces it instead.

---

## `POST /v1/admin/people/:personId/roles` and `DELETE .../roles/:roleCode`

`@Roles('oc_admin')`. Body: `roleCode`, optional `eventId` (NULL = global grant).

- Refuse granting `participant` here — that is the self-service path, and allowing both
  creates two sources of truth for the same fact.
- `granted_by` is the caller from the token.
- **Both write to `audit.activity_log`.** A privilege change that leaves no trace is the one
  an investigation most needs.
- Removing your own last `oc_admin` grant must be refused — locking every administrator out
  of the system is a support incident nobody can fix from inside it.

Also `GET /v1/admin/people?search=` (keyset paged, `src/common/pagination/keyset.ts`) so an
administrator can find someone to grant. No new pagination style.

---

## Rules

1. **Never trust a person id from a request body** on the `/me` routes.
2. Validation with Zod, and refusal copy through `message_key` — not hardcoded English
   (PLT-02). A date of birth in the future or implying an age under 18 is refused.
3. Idempotency: use the existing `IdempotencyService`, with the guard's
   `request.idempotencyScope` as `scope`.
4. `updated_at` maintained; `profile_status` never moves back to `placeholder`.

---

## Tests

Real Postgres, and use a **fake identity provider** for the token rather than calling AWS.

- a placeholder person completes their profile → `profile_status = 'complete'`, `participant`
  granted, and the previously-refused registration insert now succeeds
- a `personId` in the body is ignored — the caller cannot edit anyone else
- date of birth change **before** any entry succeeds; **after** an entry is refused
- a participant calling the admin role endpoint gets 403
- `oc_admin` grants `oc_staff`; granting `participant` there is refused
- an `oc_admin` cannot remove their own last `oc_admin` grant
- both grant and revoke appear in `audit.activity_log`
- a future date of birth is refused, with a message key rather than a sentence

`npm test`, `npm run typecheck`, `migrate:up → down → up`, and `npm run plan:drift` all clean.

---

## Do NOT

- ❌ Change `src/auth/identity/*` — Cognito is settled
- ❌ Read roles from `cognito:groups`
- ❌ Touch `src/registration/*`, quota, money, rules or evidence tables
- ❌ Build UI — API only
- ❌ Edit `BACKEND_DB_PLAN.md` — report what it should say
- ❌ Let a participant endpoint grant any OC role, under any conditions

---

## Report back

1. Whether you agree `participant` is self-granted on profile completion
2. How you enforced the date-of-birth rule, and whether it is a constraint or a service check
3. Exactly what the participant app must send, and in what order, for a fresh Cognito user to
   reach a registerable state
4. What the plan should say
5. What you could not verify
