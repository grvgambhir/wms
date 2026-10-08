# Task: roles must carry their event scope

Repos: `wms_backend` (the real fix) and `wms_admin` (the chips that read it).

This closes the one genuine defect found while building the People & Roles screen. Do this
**before** the invite work — both touch `admin-people.service.ts` and `PeoplePage.tsx`.

---

## The defect

`AdminPeopleService.list()` builds each person's roles with:

```sql
SELECT person_id, role_code FROM core.person_role WHERE person_id = ANY($1::uuid[])
```

`core.person_role` has an `event_id`, and the same `role_code` may legitimately appear twice
for one person — once global (`event_id IS NULL`), once scoped to an event. The list drops
that column, so:

- Two different grants render as **two identical chips**. The operator cannot tell them apart.
- Revoke is `DELETE /v1/admin/people/:id/roles/:roleCode?eventId=`, and the UI has no
  `eventId` to send. It can only ever revoke the global one. Clicking the event-scoped chip
  either removes the wrong grant or returns `PERSON_ROLE_NOT_FOUND`.

A screen whose delete button can hit the wrong row is worse than no screen.

## The fix

**Backend.** Change the shape from `roles: string[]` to:

```ts
roles: Array<{ roleCode: string; eventId: string | null }>
```

Select `event_id` alongside `role_code`, order by `role_code, event_id NULLS FIRST` so the
output is stable. Update `PersonListItem` and the existing backend tests.

`GET /v1/me` also returns `roles: string[]`. **Leave that one alone** — it answers "what may
this session do", both apps check it with `includes('oc_admin')`, and changing it would break
`sessionMayUseAdmin` and `hasOcRole` for no benefit here. Say in your report that you left it,
so the difference between the two shapes is a decision on record and not an oversight.

**Admin UI.** Each chip renders its scope (global vs the event) and sends the matching
`eventId` on revoke. Two grants of the same role must be visibly distinguishable — a chip
reading just `oc_staff` twice is the bug, not the fix.

## Tests

- Backend: a person with the same role twice (one global, one event-scoped) comes back as two
  entries with distinct `eventId`s.
- Admin: those two render as two distinguishable chips, and revoking the event-scoped one
  sends **its** `eventId`, not `undefined`. Assert the request URL.
- `npm run test` green in both repos (backend 112, admin 57 — none may break).

Report anything else in the contract that looks wrong; do not fix it unasked.
