# Task: team rosters onto the real database

Repos: `wms_backend` and `wms_participant`.
**Parallel-safe** with the evidence prompt — different tables and screens.

---

## Where this stands

The roster and partner-finder screens are built and run on `MockTeamRosterRepository` /
`MockPartnerRepository`. The tables exist and are unusually well defended already:

`core.team_roster`, `roster_version`, `roster_member`, `roster_selection`,
`roster_substitution`, `roster_member_balance`, `team_invitation`, `team_join_request`,
`registration_policy_roster_rule`.

Postgres already enforces most of the hard parts — `roster_cardinality_guard`,
`roster_version_immutable`, `roster_selection_frozen`, `roster_substitution_same_team`,
`roster_pins_guard`, and the age helpers `roster_competing_ages` /
`roster_competing_mean_age`.

**Your job is to serve those guarantees, not to re-implement them in TypeScript.** A service
that checks cardinality itself and then inserts is two rules that can disagree; let the insert
fail and map the constraint.

## The part worth thinking about

**A roster version is immutable once published, and the category depends on the roster.**

Rowing's crew average age excludes the coxswain; tennis doubles bands on the youngest player.
So substituting a member can change the category the team competes in — and REV-044's lesson
applies: that recalculation must go through the same rule engine the entry used, against the
**same `rule_version_id`**, not a fresh evaluation against whatever is current.

`roster_competing_ages` and `roster_competing_mean_age` exist precisely so the exclusion rules
live in one place. Use them.

## Backend

Participant routes (identity from token): view my team, invite a partner/member, accept or
decline, propose a substitution.
Captain/manager actions must check the caller actually holds that role on **that** team —
in SQL, in the `WHERE` clause, not after the fact.
OC routes (`@Roles(...)`): approve/publish a roster version, force a substitution, lock.

`team_invitation` has the same shape as the partner invite the participant app already
renders — accepting one invitation cancels the other outgoing pending ones (REVISIONS A11).
Check whether the table enforces that; if it does, let it, and say so.

## Participant app

`ApiTeamRosterRepository` and `ApiPartnerRepository` beside the existing `Api*` classes, wired
in `repositories.ts`, `Mock*` kept as the offline fallback.

## Tests

- Cardinality below the minimum and above the maximum are both refused **by the database**.
- A published roster version cannot be edited (`roster_version_immutable` fires).
- A substitution across teams is refused (`roster_substitution_same_team`).
- A coxswain is excluded from the crew average — assert the number, using the SQL helper.
- A member who is not the captain cannot invite; asserted in SQL.
- Changing a member recomputes the category **against the entry's own `rule_version_id`**, not
  the current active version. This is the one most likely to be got wrong; write it first.
- Green in both repos.

## Definition of done

Build a four-person crew including a coxswain, publish the version, substitute a member, and
show the category recalculating. Paste the before/after. Report any constraint that got in the
way — those are usually the schema being right, but tell me if one looks wrong.
