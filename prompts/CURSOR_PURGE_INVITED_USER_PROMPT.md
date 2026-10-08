# Task: purge a user who has no obligations attached

Repos: `wms_backend` and `wms_admin`. Small and self-contained.

---

## What this is and — more importantly — what it is not

This is **not** "delete a participant". People cannot be deleted: their orders, accreditation,
roster history and audit trail belong to other records too, which is why roughly thirty
foreign keys refuse a `DELETE` on `core.person`. That refusal is the schema being right.

Real erasure is **PRV-05** — a rights request with identity verification, retention holds and
completion evidence — and `core.rights_request`, `core.rights_request_completion` and
`core.retention_hold` already exist for it. **Do not build that here.** It needs the OC's
retention schedule first, which is an open decision.

What this task builds is narrow: **a person who has accumulated nothing can be removed.** An
invited OC user whose email never arrived. A test account. Someone invited to the wrong
address. Right now the only way to clear one is hand-editing the database, and the person's
`idp_subject` stays in Cognito forever.

## The rule — "has not paid" is necessary but not sufficient

Money is the obvious obligation, and it is not the only one. Refuse the purge unless **all**
of these are true:

- no `core.registration_order` / `payment_intent` / `payment_allocation` for them
- no `core.registration_entry`
- no `core.accreditation` issued
- no `core.roster_member` / `roster_selection` row (their removal would rewrite a *team's*
  history, not just theirs)
- nothing in `restricted.*` referencing them (medical, para classification, ID evidence — this
  data has its own retention rules under PRV-04, and it must never be swept away as a side
  effect of a convenience action)
- no `core.retention_hold` with `released_at IS NULL`
- **they have never signed in** (`profile_status = 'placeholder'`, or a Cognito status of
  `FORCE_CHANGE_PASSWORD`)

Compute this in **one SQL statement** and return the reasons. When a purge is refused, the
screen must say *which* obligation blocked it — "cannot delete" with no reason will send
someone to the database to do it by hand, which is what this endpoint exists to prevent.

**Consents and audit rows are not blockers, but they are not sweepable either.** Delete the
consent rows with the person (they are meaningless without a subject) and **leave the audit
trail alone** — SEC-05 wants tamper-resistant logs kept ≥12 months, and `subject_id` is not a
foreign key, so the rows survive a person's deletion by design. Say in your report that you
left them.

## Backend — `DELETE /v1/admin/people/:personId`

`@Roles('oc_admin')`. Idempotency-key guarded, **`external` mode** — Cognito is involved and
the same reasoning as the invite endpoint applies.

Order matters: **Cognito first, then the database.** If the DB row goes first and the Cognito
delete then fails, the pool keeps a user nobody can see and the address can never be invited
again (`UsernameExistsException` with no matching row to explain it). The other order fails
safely: an orphaned `core.person` row with a dead `idp_subject` is visible, and this same
endpoint can be called again to clear it.

Add `deleteUser()` to `CognitoUserAdmin` (`src/auth/identity/cognito-user-admin.ts`). A user
already gone from the pool (`UserNotFoundException`) is **success**, not an error — that is
exactly the retry case above.

### One AWS change is required, and it is the only one

`AdminDeleteUser` is a different IAM action from `AdminCreateUser`, so the existing
`wms-backend-invite` policy does **not** cover it. It needs adding to that policy, on the same
single-pool `Resource`. Do not attempt it yourself and do not widen the policy to `*` —
write the exact JSON I need to paste into the console in your report, and if you hit
`AccessDeniedException` during the hand-test, that is the expected failure until I apply it.

## Admin UI

A **Remove** action on `/people`, visible only when the person is purgeable. The confirmation
names the person and says the Cognito account goes too. A refusal renders its reason.

## Tests

- Each blocker refuses, individually — a person with only an order, only a roster row, only a
  retention hold. One test per reason, so a future change to the rule cannot silently drop one.
- A clean invited user is purged: person, role and consent rows gone, **audit rows still
  present**.
- `UserNotFoundException` from Cognito completes rather than failing.
- Cognito is called **before** the delete (assert ordering on the mock, not just that both
  happened).
- Green: `npm run test:backend` from `/Users/gauravgambhir/Desktop/Code_Life/wms`, and
  `npm run test` in `wms_admin`.

## Definition of done

`riyakakkar1993@gmail.com` (`oc_staff`, never signed in) is the live case. Purge them, confirm
they are gone from **both** the pool and the database, then re-invite the same address and
confirm it now succeeds instead of returning `USER_ALREADY_EXISTS`.
