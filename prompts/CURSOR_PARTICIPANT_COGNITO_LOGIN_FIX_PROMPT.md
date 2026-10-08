# Task: make real Cognito signup → login actually usable in wms_participant

Repo: `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_participant`
Do **not** change `wms_backend` or `wms_admin` in this task.

Run everything from `/Users/gauravgambhir/Desktop/Code_Life/wms` with `npm run dev`
(backend :3050, participant web :8081). `npm run dev:clean` frees stale ports.

---

## The situation

The Cognito screens already exist and are wired: `CognitoLoginScreen` has both a login and a
sign-up form, `(auth)/confirm.tsx` takes the 6-digit code, `(auth)/complete-profile.tsx`
finishes the profile, and the backend half was hand-tested live. **Nothing about signup needs
rebuilding.**

What makes the flow unusable is smaller and dumber: **once you are signed in as the demo user
you cannot get out**, so you never reach the real login form. Three separate causes.

### Cause 1 — demo auth is on, and it wins over Cognito

`wms_participant/.env` line 4: `EXPO_PUBLIC_DEMO_AUTH=true`.

Now read `readSession()` in `src/features/auth/hooks/useAuth.ts:9`:

```ts
async function readSession() {
  if (isDemoAuthEnabled()) {
    const demo = await repositories.auth.getSession();
    if (demo) return demo;          // <- demo checked FIRST, Cognito never reached
  }
  return cognitoGetSession();
}
```

A stored demo session **shadows a real Cognito session**. This is the root of "it always says
Daniel Harper", and it is a one-line fix: set `EXPO_PUBLIC_DEMO_AUTH=false` in `.env`.

Keep the demo code path and the demo button — the Harper POC still needs them, and flipping
the flag back must restore the old behaviour exactly. Just do not have it on by default.

### Cause 2 — sign-out does not clear the session

`useSignOut` in `src/features/auth/hooks/useAuth.ts:80` ends with:

```ts
onSuccess: () => { queryClient.invalidateQueries(); }
```

Two things wrong, and the second is the more serious one:

- **It does not navigate,** and `invalidateQueries` is asynchronous. React Query keeps the
  PREVIOUS data while the refetch is in flight, so for a tick `session` is still truthy — and
  `CognitoLoginScreen.tsx:123` (`if (isLoading || session)`) sends you straight back in.
- **It has no query key,** so it invalidates *every* query in the cache. At logout that fires
  a refetch of every active query with a token that no longer exists, and it leaves the
  previous user's registration data sitting in the cache. On a shared device the next person
  to sign in can be shown it. Logout should **remove** that data, not re-fetch it.

So: set the session to `null` synchronously, drop the rest of the cache, then navigate.

```ts
onSuccess: () => {
  queryClient.setQueryData(['auth', 'session'], null);
  queryClient.removeQueries();          // or clear() — but the line above must come first
  router.replace('/(auth)/login');
}
```

Use one shared helper for this so all four call sites behave identically:
`app/(discovery)/account.tsx:84`, `src/components/shell/AppNavMenu.tsx:50`,
`src/features/auth/screens/CompleteProfileScreen.tsx:341`, and the new portal one below.

### Cause 3 — the portal has no logout at all, and the name is hardcoded

`ParticipantPortalShell.tsx:67` declares `userName = 'Daniel Harper'` as a **default prop**,
and no caller passes `userName` — so every participant screen shows that name regardless of
who is signed in. The header chip has a chevron but no menu behind it.

Make the chevron a real menu with: who is signed in, and **Log out**.
The signed-in name comes from `/v1/me` (`useMeProfile` → `givenName`/`familyName`, falling
back to `email`). A demo session may keep showing Daniel. **Delete the hardcoded default** —
if no name is available, render a neutral placeholder, never someone else's name.

---

## Two things NOT to do

**Do not change the `if (isLoading || session)` guard in `CognitoLoginScreen.tsx:123` to treat
a *fetching* session as signed-out.** It looks like a fix for the bounce-back and it is not:
on a normal page load a genuinely signed-in user is also fetching, so they would get a flash
of the login form on every load. Fixing Cause 2 makes `session` synchronously `null` and the
bounce disappears on its own. Leave that line alone.

**Do not touch the AWS console, SES, or Cognito pool settings** from code, and do not add a
fallback that "confirms" a user without the emailed code.

---

## Tests (jest + @testing-library/react-native, colocated)

1. After sign-out, `['auth','session']` is `null` **synchronously** — not after a refetch —
   and the login screen renders the form rather than `LoadingState`.
2. Sign-out removes other cached queries, so a second sign-in cannot read the first user's
   data. Seed a query like `['athlete', ...]`, sign out, assert it is gone.
3. With `EXPO_PUBLIC_DEMO_AUTH=false`, `readSession()` never calls the demo repository even
   when a demo session is stored — it must return the Cognito session.
4. With the flag `true`, the old demo behaviour is unchanged (this is the regression guard for
   the Harper POC).
5. The portal header exposes a logout control, and shows the signed-in user's name from
   `/v1/me` — assert that "Daniel Harper" does **not** appear for a Cognito session.

---

## Definition of done

- `npm run test` green in `wms_participant` (currently 68 tests — none may break).
- `npm run typecheck` clean.
- **Hand-test the whole thing and report exactly what happened at each step**, on
  `http://localhost:8081`:
  1. Sign out of the demo session from the portal header chip. You stay on `/login`, and a
     refresh still shows `/login`.
  2. Create a **new** account with the sign-up form, using a real inbox you control.
  3. Enter the 6-digit code from the email on the confirm screen.
  4. Log in with that email and password.
  5. Complete the profile; you land on registration status with **your** name in the header.

If step 3's email never arrives, that is the Cognito pool's email setting, not app code —
**stop there and tell me**, do not work around it. Report which step you reached, and paste
the exact error if one appeared.
