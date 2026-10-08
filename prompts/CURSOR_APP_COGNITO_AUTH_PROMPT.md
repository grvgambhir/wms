# Task: Cognito sign-up and sign-in in the participant and admin apps

The backend verifies Cognito access tokens and creates a person on first login. Neither app
can produce a token yet, so nobody can actually sign up. This closes that.

Repos:
- `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_participant` (Expo / React Native / Expo Router)
- `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_admin` (Vite / React)
- Backend for reference only: `.../wms_backend/src/auth/` — **do not modify it**

Both `.env` files already hold the pool and client ids (`EXPO_PUBLIC_*` / `VITE_*`).
There is **no client secret**: both app clients are public, and a secret in a bundle is
readable by anyone who downloads it.

---

## Flow, in order

1. **Sign up** — email + password to Cognito
2. **Confirm** — Cognito emails a 6-digit code; the user enters it
3. **Sign in** — authorization code + **PKCE**
4. **Call the API** with `Authorization: Bearer <access_token>`
5. Backend creates the person: placeholder profile, **no roles**
6. App sends the user to **complete their profile** — it cannot register until then
7. `PATCH /v1/me/profile` completes it and grants `participant`

Steps 6–7 are a separate change. **Build 1–5, and route to a placeholder "complete your
profile" screen at step 6** so the gap is visible rather than a dead end.

---

## Non-negotiable

**Access tokens only.** Send the access token, never the id token — the id token carries
email and name, and the API rejects it (`token_use=access`). If you find yourself sending an
id token because "it has the email", that is the bug this rule exists to prevent.

**PKCE, no secret, no password in your code path.** Use the authorisation-code flow. Do not
implement `USER_PASSWORD_AUTH` in the apps — that exists only in the backend's
`npm run token` helper for local testing, and shipping it would put a password through the
app's own code.

**Refresh is Cognito's.** Do not call `/v1/auth/login` or `/v1/auth/refresh` — those are the
retired local provider. Refresh the token with the SDK before expiry (access tokens last 15
minutes) and retry the request once, silently. A user should never see a 401 they could not
have caused.

**Tokens are not `localStorage` and not plain `AsyncStorage`.**
- Expo: `expo-secure-store`
- Vite: in-memory, with refresh in an `httpOnly` cookie if the backend later sets one;
  until then in-memory plus silent re-auth. Say what you chose.

**Never log a token**, or put one in a URL, an error message or an analytics event.

---

## Participant app (`wms_participant`)

Use `aws-amplify` v6 (`@aws-amplify/auth`) — it handles PKCE, refresh and secure storage on
React Native, and hand-rolling those is where token bugs live.

Screens (Expo Router, existing patterns in `app/`): sign up · confirm code · sign in · forgot
password. All copy through `useCopy()` in **EN and IT** — PLT-02 is a launch requirement and
these are the first screens a participant ever sees. All accessible, checked at 375px.

`src/data/api/*` currently talks to `wms_api` without auth. Add the bearer header **in one
place** — an interceptor or a wrapped fetch — never per call site.

The existing demo login (`daniel.harper@email.com` / OTP `123456`, `src/constants/demo.ts`)
must keep working behind a flag, so the demo path is not broken while cutover is incomplete.
Say how you gated it.

## Admin app (`wms_admin`)

Same library, the **admin** client id. No self sign-up — an OC administrator is created in
Cognito and granted a role by an existing admin; a sign-up form here would let anyone create
an account against the admin client. Sign-in and forgot-password only.

After sign-in, read roles from `GET /v1/me`. **The API is the authority on roles** — never
`cognito:groups`, and never trust a role claim to decide what the UI may do. Hiding a button
is presentation; the backend guard is the control.

---

## Tests

- sign-up → confirm → sign-in produces an access token with `token_use=access`
- an expired access token triggers exactly one silent refresh and one retry
- a signed-out user reaching a protected route lands on sign-in, not a blank screen
- no token appears in any log or storage the tests can read
- EN and IT render for every new screen
- the demo login still works behind its flag

Mock Cognito in unit tests. Then do it once by hand against the real pool and say so —
the `npm run token` helper in `wms_backend` proves the backend side independently.

---

## Do NOT

- ❌ Modify `wms_backend`, `wms_domain` or `wms_api`
- ❌ Send id tokens, or implement `USER_PASSWORD_AUTH`
- ❌ Put a client secret anywhere — there is none
- ❌ Store tokens in `localStorage` or unencrypted `AsyncStorage`
- ❌ Read roles or permissions from token claims
- ❌ Cut screens over from `wms_api` to `wms_backend` — that is the next change; only auth here

---

## Report back

1. Storage choice per app, and why
2. How refresh-and-retry works, and what the user sees if it fails
3. How the demo login is gated
4. Which Cognito settings still need changing in the console (callback URLs, allowed flows,
   email delivery) — be specific, these are handed straight to the account owner
5. What you could not verify
