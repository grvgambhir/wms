# Task: resend an invitation

Repos: `wms_backend` and `wms_admin`. Small, self-contained, and safe to run alongside the
registration and pre-registration prompts.

---

## Why

An invitation was sent, the Cognito user was created (`Force change password`), the person row
and role were recorded — and the email never arrived. That happens for reasons outside our
code (SES sandbox, the 50/day Cognito cap, a spam filter), and **today there is no way back**:

- Inviting the same address again returns `USER_ALREADY_EXISTS` — the endpoint refuses, by
  design.
- "Forgot password" does not work either. Cognito refuses a password reset while the user is
  in `FORCE_CHANGE_PASSWORD`.

So one undelivered email permanently locks a person out, and the only remedy is deleting them
from the pool by hand. **Deleting is the wrong remedy**: our `core.person` row stores their
`idp_subject`, and a re-created Cognito user gets a *different* `sub`. The row would point at
a user that no longer exists and the new one would never link. Resending keeps the same `sub`.

Cognito supports exactly this: `AdminCreateUser` with `MessageAction: 'RESEND'` — same user,
same `sub`, a new temporary password, a fresh email.

## Backend — `POST /v1/admin/people/:personId/invite/resend`

Same controller as the other admin-people routes, so it inherits `@Roles('oc_admin')`.

- Look up the person, read their `idp_subject` and email. Refuse `PERSON_NOT_FOUND` if absent.
- **Refuse if they have already signed in.** A resend rotates the temporary password, so
  calling it on an active account would lock out someone who is working. `profile_status` is
  `placeholder` for a never-signed-in invitee; if you find a better signal (a Cognito user
  status of `FORCE_CHANGE_PASSWORD`, say), use it and explain the choice. Either way this must
  be a refusal (`INVITE_ALREADY_ACCEPTED`), not a silent no-op.
- Add `resendInvitation()` to `CognitoUserAdmin` (`src/auth/identity/cognito-user-admin.ts`)
  alongside `createInvitedUser`. Keep the AWS SDK inside that file — it is the only place in
  the codebase that imports it and it should stay that way.
- **No new DB writes.** Nothing about the person changes. Write an audit row
  (`action: 'user.invite_resend'`) and nothing else, so idempotency `local` mode is enough —
  a repeated key must not send a second email.

### One IAM note to pass on, not to fix

`MessageAction: 'RESEND'` is still the `cognito-idp:AdminCreateUser` action, so the existing
policy (`wms-backend-invite`) already permits it and **no AWS change is needed**. Confirm that
when you hand-test; if you get `AccessDeniedException`, stop and report it rather than
widening the policy yourself.

## Admin UI

On `/people`, an invited-but-not-yet-signed-in person gets a **Resend invite** action.

Two things the screen must say, because both surprise people:

1. Resending **replaces** the temporary password — any earlier invitation email for that
   person stops working. Say so in the confirmation, not afterwards.
2. On success, tell them the mail was sent *and* to check spam. The most common cause of the
   resend being needed is a spam filter, and the second attempt lands in the same folder.

Errors to render: `INVITE_ALREADY_ACCEPTED` (explain they should use password reset instead),
`PERSON_NOT_FOUND`, `COGNITO_ADMIN_UNAVAILABLE`.

## Tests

- Backend: resend calls Cognito with `MessageAction: 'RESEND'` and the person's **existing**
  username (mock the client and assert the argument — sending a fresh `AdminCreateUser`
  without that flag would create a duplicate-user error, and asserting only "the client was
  called" would not catch it).
- Backend: a person who has already signed in is refused; no DB row changes on resend; a
  repeated `Idempotency-Key` does not send twice.
- Admin: the action appears only for an invited, never-signed-in person, and the confirmation
  mentions that the old email stops working.
- Green in both: `npm run test:backend` from `/Users/gauravgambhir/Desktop/Code_Life/wms`
  (plain `npm run test` in `wms_backend` runs on Node 20 and dies with
  `ERR_IPC_CHANNEL_CLOSED`), and `npm run test` in `wms_admin`.

## Definition of done

There is a real stuck user to fix: **`riyakakkar1993@gmail.com`**, `oc_staff`, created and
never delivered. Once email delivery is sorted (see `wms/docs/AWS_SETUP_STEPS.md` Task 4),
resend to that person, and report whether the mail arrived and whether they could then sign in
and set a password. If email delivery is still broken when you get there, say so and stop —
do not delete the user to "start clean".
