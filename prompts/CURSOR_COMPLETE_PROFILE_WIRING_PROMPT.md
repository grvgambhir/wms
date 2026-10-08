# Task: wire the participant complete-profile screen to the real API

Sign-up, confirmation and sign-in all work. A Cognito user reaches
`app/(auth)/complete-profile.tsx` — a 63-line placeholder — and stops. The backend endpoint
is live and hand-tested; nothing calls it. This is the last gap in the self-signup journey.

Repo: `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_participant`
Backend (reference only, **do not modify**): `.../wms_backend/src/profile/`

**Node 22.** Backend on `http://localhost:3050` with `AUTH_PROVIDER=cognito`.

---

## The contract, verified live against a real Cognito user

```
PATCH /v1/me/profile
Authorization: Bearer <access token>
Idempotency-Key: <uuid, one per submit attempt>

required   givenName, familyName, dateOfBirth (YYYY-MM-DD, not future, age >= 18,
                                               and not the 1900-01-01 placeholder)
optional   nationality (ISO 3166-1 alpha-2), gender, phone, locale ('en' | 'it'),
           emergencyContacts: [{ ordinal, name, phone, relationship? }]
```

**Do not send `personId`. Do not send `email`.** The person comes from the token, and the
email is read from Cognito by the backend — a user-typed address would let someone claim one
they do not control. The backend strips both, so sending them is silently useless rather than
an error; do not rely on that.

On success the response carries `profileStatus: "complete"` and `roles: ["participant"]`.
Only then can the user register — a database trigger refuses entries for a placeholder
profile, so this screen is a hard gate, not a nicety.

---

## Build

**The screen.** Real form, existing patterns from `app/(participant)/profile.tsx` — same
inputs, same validation shape, same components. Do not invent a second form style.

**EN and IT through `useCopy()`.** This is the first screen a new participant ever sees, and
PLT-02 is a launch requirement. Every label, hint and error.

**Client validation mirrors the server's**, so the common mistakes are caught before a round
trip — but never assume it is sufficient. The server's refusal codes must render:

| Code | Meaning |
|---|---|
| `profile.date_of_birth.future` | date of birth is in the future |
| `profile.date_of_birth.under_18` | under 18 |
| `profile.date_of_birth.needs_review` | already has an entry; DOB is locked |

Map these to copy keys. **Never render a raw server message** — they are keys, and an
untranslated string in front of an Italian user is the exact PLT-02 failure.

**Idempotency-Key: one per submit attempt, not per render.** A key regenerated on re-render
defeats the mechanism entirely. Generate on mount or on press, and **reuse the same key when
retrying the same submission** — that is what makes a double-tap safe.

**Routing.** After success, `roles` includes `participant`: send the user into the normal
journey (`/registration-status` or wherever the demo path lands). If `GET /v1/me` returns
`profileStatus: 'placeholder'` on any later launch, route back here — a user who closed the
app mid-signup must not land in a journey that will refuse them.

**Failure states that must exist:** offline, backend unreachable, 401 mid-submit (session
expired → re-auth, then return to this form with input intact — losing a filled form to a
token expiry is a bad first impression), and a field-level 422.

---

## Emergency contacts

0 to N, `ordinal` is display order. The shipped profile screen collects one; this screen
should allow adding and removing rows rather than hardcoding a single set of fields. `name`
and `phone` are required per contact, `relationship` optional.

---

## Tests

Existing patterns in `src/**/__tests__`. Mock the API, do not call the real backend.

- a valid submission sends exactly the allowed fields — assert `personId` and `email` are
  **absent** from the request body
- a repeated submit reuses the same `Idempotency-Key`
- each of the three server refusal codes renders translated copy, in EN and IT
- a 401 mid-submit re-authenticates and preserves what the user typed
- a `placeholder` profile on launch routes here; a `complete` one does not
- adding and removing emergency contacts keeps `ordinal` contiguous

Then run it once by hand against the live backend and a real Cognito user, and say so.
`npm test` and typecheck clean.

---

## Do NOT

- ❌ Modify `wms_backend`, `wms_domain`, `wms_api`, or `wms_admin`
- ❌ Send `personId` or `email`
- ❌ Cut any other screen over from `wms_api` to `wms_backend` — that is a separate change
- ❌ Break the demo login (`EXPO_PUBLIC_DEMO_AUTH=true`), which must keep bypassing this
- ❌ Add a "skip for now" affordance — the database refuses registration for a placeholder,
      so skipping produces a confusing failure later instead of a clear one now

---

## Report back

1. How the Idempotency-Key is scoped to a submission
2. What the user sees for each refusal code, in both languages
3. What happens to typed input on a mid-submit 401
4. Whether the live hand-test worked, and what the person row looked like afterwards
5. What you could not verify
