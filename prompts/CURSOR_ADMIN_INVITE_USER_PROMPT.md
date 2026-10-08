# Task: invite an OC user from the admin portal

Repos: `wms_backend` (new endpoint) and `wms_admin` (the button and the first-login screen).
Run `npm run dev` from `/Users/gauravgambhir/Desktop/Code_Life/wms`.

**Do this after `CURSOR_ADMIN_ROLE_EVENT_SCOPE_PROMPT.md`** — both edit
`admin-people.service.ts` and `PeoplePage.tsx`.

---

## Why

Today, making an OC staffer takes two disconnected steps: they sign up **on the participant
portal** (the only place with a sign-up form), then an admin grants them a role. Asking
finance and accreditation staff to register as athletes to get into the Command Centre is not
a flow anyone would ship, and the RFP's admin portal serves seven distinct OC user types
across every sport and venue (RFP §2.3, OPS-03) — potentially hundreds of people.

**One step, from the admin portal: email + role in, invitation out.**

## The design, decided — argue only if it is actually wrong

**`AdminCreateUser`, not self-signup-then-approve.** A "request an account, admin approves"
flow needs a sign-up form on the admin portal, which lets anyone on the internet create
entries in the OC's user pool, and it still costs two actions. Invitation costs one and the
audit trail is exact: who invited whom, to what role, when (RFP OPS-05).

**Cognito emails a temporary password, not a link.** `AdminCreateUser` sends the user their
username and a temporary password from the pool's *User invitation* message template (a
different template from the self-signup verification code — that one stays as it is, the
participant flow uses it). On first sign-in Cognito answers the `NEW_PASSWORD_REQUIRED`
challenge and the user sets their own password. **This is why the admin portal needs a
"set your new password" screen — it is part of this task, not a follow-up.**

**Pre-link the person by `sub`.** `AdminCreateUser` returns the new user's attributes,
including `sub`. Create `core.person` with `idp_subject = sub` and grant the role right then.
So the invited user's very first successful sign-in already has their role — no second
round trip, no "No OC role" screen, no waiting for `/v1/me` to link them.

---

## Backend — `POST /v1/admin/people/invite`

Same controller as the other admin-people routes, so it inherits `@Roles('oc_admin')`.

Body: `{ email, givenName, familyName, roleCode: 'oc_staff'|'oc_admin'|'finance', eventId? }`.
`participant` must be refused here exactly as it is in `grant()`.

### This is the external-idempotency case the plan describes

`IdempotencyService` has two modes. Use **`external`**, not `local`. The Cognito call is a
side effect that cannot be rolled back by a database transaction: if you create the user and
then the insert fails, a retry with `local` mode would call `AdminCreateUser` a second time.
`external` commits the key as `in_progress` **before** the call, so the retry can see it.
Read the mode's contract in `src/common/idempotency/idempotency.service.ts` before writing.

If `AdminCreateUser` succeeds and the DB write then fails, say so plainly in the error — an
orphaned pool user is a state a human has to resolve, and hiding it is worse than reporting it.

### What this needs that the backend does not have yet

- `@aws-sdk/client-cognito-identity-provider` (the only Cognito calls so far are
  `aws-jwt-verify` and a raw HTTPS `GetUser`, neither of which needs credentials).
- **AWS credentials.** Every existing call is authorised by the *end user's own token*.
  `AdminCreateUser` is authorised by the *service*, so the backend needs an IAM identity with
  `cognito-idp:AdminCreateUser` on this pool and nothing more.
  The console steps that produce them are written up in `wms/docs/AWS_SETUP_STEPS.md`
  (Task 2) — follow it rather than inventing a different permission set.
  Read them from the environment (`AWS_REGION`, and the standard SDK credential chain);
  add the names to `.env.example` with a comment, **never a value**, and extend
  `src/config/env.ts` so a missing credential fails at boot rather than at the first invite.
  If credentials are absent the endpoint must refuse with a clear code — never fall back to
  creating the person without the Cognito user.
- Keep every Cognito import inside `src/auth/identity/` or a new sibling module, the way
  `cognito.identity-provider.ts` does. The rest of the codebase must not learn about AWS.

Errors to map: `UsernameExistsException` → `409 USER_ALREADY_EXISTS`;
`InvalidParameterException` → `422 VALIDATION_ERROR`. `detail` stays an i18n key.

## Admin UI

1. **Invite user** on `/people` (oc_admin only): email, first name, last name, role, optional
   event. On success the person appears in the list immediately, with their role, marked as
   invited / not yet signed in.
2. **A new-password screen.** Amplify's `signIn` returns a next step of
   `CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED`; today `SignInPage` does not handle it, so an
   invited user cannot get in at all. Handle it: prompt for a new password, call
   `confirmSignIn`, then continue into the app as normal.
3. Re-inviting an existing email must surface `USER_ALREADY_EXISTS` as an explanation, not a
   generic failure.

## Tests

- Backend: invite creates person + role + `idp_subject` in one go; `participant` is refused;
  a repeated `Idempotency-Key` does **not** call Cognito twice (mock the client and count).
- Admin: the invite form appears only for `oc_admin`; `USER_ALREADY_EXISTS` renders its
  explanation; the new-password step renders when sign-in returns that challenge.
- `npm run test` green in both repos.

## Definition of done

Hand-test it: invite a real address you control, read the email, sign in on
`http://localhost:5173`, set a new password, and confirm you land in the Command Centre with
the granted role already active. **Report which step you reached and paste any error.**

If AWS credentials are not available to you, stop before the hand-test, say so, and leave the
code complete and tested against a mocked client — do not invent a workaround.
