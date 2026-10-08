# Task: MFA — mandatory for OC users, configurable for participants

Repos: `wms_backend`, `wms_admin`, `wms_participant`.

**RFP PLT-04 (Must):** *"**MFA for privileged users**; configurable MFA/risk for participants;
RBAC + least privilege."*

The plan calls PLT-04 a **gate item**, and D5 chose a bought identity provider partly *because*
MFA came with it. It was never switched on. Today the only trace of MFA in the codebase is
three comments saying it is absent (`auth.controller.ts`, `auth.service.ts`,
`login-rate-limiter.ts`).

---

## The constraint that shapes this — read before designing

Both apps share **one** Cognito user pool (`wms`, `eu-north-1_eLAmBFEkU`), and **Cognito's MFA
setting is per-pool, not per-app-client.** So "required for admins, optional for participants"
cannot be a console setting. There are two ways out and only one is reasonable:

- **Two pools** — clean, and wrong here. Every person row links to a `sub`; splitting the pool
  splits identity, and a person who is both an athlete and an OC volunteer (common at Masters
  events) becomes two people.
- **One pool set to OPTIONAL, enforcement in our code.** Participants may enrol and are
  encouraged to; OC users **cannot hold a privileged session without it**.

Take the second. **Already applied:** the pool is set to Optional MFA with authenticator apps
(TOTP) enabled, and the IAM policy carries `AdminCreateUser`, `AdminDeleteUser` and
`AdminSetUserMFAPreference`.

## The token question is answered — no Lambda

This was investigated against the live pool (REV-068). Do not repeat it:

- After a **real `SOFTWARE_TOKEN_MFA` challenge**, the access token carries **no `amr` and no
  MFA claim**. Neither does the ID token from the same session. The session cannot be proven
  from the JWT this backend verifies.
- But Cognito **always issues the challenge** once a user has TOTP enrolled
  (`PreferredMfaSetting: SOFTWARE_TOKEN_MFA`) — verified across `USER_PASSWORD_AUTH` and
  Amplify `USER_SRP_AUTH`, on both app clients. No tokens were minted without it.
- The **only** exception found: `REFRESH_TOKEN_AUTH` with a refresh token issued **before**
  enrolment mints a new access token with no challenge.

So "this account has MFA enrolled" implies "every *sign-in* completed MFA", and the gap is one
bounded window — tokens and refresh chains that predate enrolment.

**Close the window instead of building a Lambda:**

1. Call `AdminUserGlobalSignOut` the moment enrolment completes. That invalidates every refresh
   token issued before it, which is exactly the exception above. It needs an IAM action —
   write the JSON for me, do not widen the policy yourself.
2. Shorten refresh-token validity on the **admin** app client. Tell me the value and the console
   path; I will apply it.

Then check enrolment server-side: `GetUser` with the caller's **own** access token returns
`UserMFASettingList`, so this needs no new permission and no `AdminGetUser`.

**Describe it honestly, in the code comment and in your report:** this proves *MFA is enrolled
and every session minted since enrolment completed it*. That is not the same sentence as "this
request came from an MFA session", and the difference is the window above. Write the weaker,
true sentence. A pre-token-generation Lambda remains the rigorous answer if we ever need it —
this is a deliberate trade, not an oversight.

## What to build

**Backend.** A guard that refuses any request carrying an OC role unless the MFA condition you
established is met — `403`, with a code the admin app can render as "enrol MFA to continue".
Participants are unaffected. The check belongs beside the role check, not in each controller.

**Admin app.** Two screens that do not exist yet:
- **Enrolment** — an OC user with no MFA is sent here and cannot reach the Command Centre until
  they enrol. Show the QR/secret for an authenticator app, and verify a code before enabling.
- **Challenge** — `signIn` returns `CONFIRM_SIGN_IN_WITH_TOTP_CODE`; `amplifyClient.ts` already
  handles `CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED`, so follow that shape exactly.

**Order matters for an invited user:** temporary password → new password → MFA enrolment →
in. Three steps on a first sign-in is a lot; make it feel like one flow, and never leave them
on a screen with no way forward.

**Participant app.** MFA is **opt-in**, from the profile: enrol, show recovery guidance,
un-enrol. A participant must never be blocked by it.

> Watch this carefully: a locked-out athlete two days before their event is a support incident,
> not a security win. That asymmetry is exactly why the RFP words the two halves differently.

**Recovery — decided: another `oc_admin` resets it.**

An OC user who loses their authenticator goes to `/people`, where an existing `oc_admin` clears
their MFA so they can enrol again. Cognito does not issue recovery codes, so there is no
self-service route that does not weaken the control.

- Backend: `POST /v1/admin/people/:personId/mfa/reset`, on the existing `@Roles('oc_admin')`
  controller. It calls `AdminSetUserMFAPreference` with software-token MFA disabled — that
  clears the enrolment without touching the password or the account.
- **New IAM action required:** `cognito-idp:AdminSetUserMFAPreference`, on the same single-pool
  `Resource` as the rest. Write the exact JSON for me to paste; do not widen the policy or
  attempt it yourself.
- Audit it (`action: 'user.mfa_reset'`). Someone removing another administrator's second factor
  is exactly the event an audit log exists for.
- Never let a user reset their **own** MFA — that would make the second factor optional by
  clicking one button.

### The lockout this creates, and the guard for it

The decision is right and it has an obvious failure: **if every `oc_admin` loses their
authenticator — or there is only one and they lose theirs — nobody can reset anybody, and the
OC is locked out of its own Command Centre during the Games.**

This system already guards the identical shape elsewhere: `LAST_OC_ADMIN` refuses removing your
own last admin grant, and `keep_one_oc_admin` enforces it in the database. Do the same here:

**Refuse to enforce MFA on OC sessions until at least two `oc_admin` accounts are enrolled.**
Below that threshold, enforcement stays off and the admin portal shows a banner saying so and
naming what is missing. Enforcement that can strand the OC is worse than enforcement that waits
for a second pair of hands.

Write a test for the threshold in both directions — one enrolled admin means not enforced, two
means enforced. And tell me plainly in your report whether we are currently above or below it.

## Tests

- An OC-role request without MFA is **refused by the backend**, not only hidden in the UI.
  Assert over HTTP with a real non-MFA token.
- A participant request is unaffected.
- An enrolled OC user passes.
- The admin app renders the enrolment screen on the refusal code, and the challenge screen on
  the TOTP next-step.
- A participant can enrol and un-enrol, and is never blocked either way.
- Green in all three: `npm run test:backend`, `npm run typecheck:backend`,
  `npm run build:backend` from `/Users/gauravgambhir/Desktop/Code_Life/wms`, plus each app's
  own suite.

## Definition of done

Hand-test it: enrol MFA on your own OC account, sign out, sign in with a TOTP code, and confirm
the Command Centre loads. Then call `/v1/admin/people` directly with a **non-MFA** token and
show it is refused. Paste both.

Report whether we are above or below the two-enrolled-admin threshold, and what the honest
one-sentence description of the guard ended up being. Record both in `REVISIONS.md`.
