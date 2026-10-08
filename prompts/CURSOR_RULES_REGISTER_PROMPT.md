# Task: one rule register — close F2

Repos: `wms_backend`, `wms_admin`, `wms_participant`.

This closes what the Phase B plan calls *"the single most dangerous defect in the product"*.
Read §1.2 F2 of `wms_participant/context_docs/docs/PHASE_B_PLAN.md` before starting.

---

## The defect

There are **two disjoint rule registers**, verified by checksum:

| Register | Files | md5 |
|---|---|---|
| A — the live registration path | `wms_api/src/data/fixtures/sport-rules.json`, `wms_participant/src/data/mock/fixtures/sport-rules.json` | `50e43f00…` |
| B — the admin configurator | `wms_admin/src/data/sport-rules.json`, `wms_api/src/data/fixtures/data-hub/sport-rules.json` | `bdec46a4…` |

They are not drifted copies of one file. They are **different shapes with different bands**.

**The rules an athlete is judged by and the rules an administrator edits are different data.**
Nothing in any demo shows this, because each screen is internally consistent. In production it
produces wrong eligibility decisions that look perfectly reasonable on screen.

## Why the database already solves it

`core.rule_set`, `rule_version`, `rule_dimension`, `rule_eligibility`, `attribute_type`,
`rule_impact_analysis` and `rule_impact_entry` exist, are tested (`test/rule-immutability.spec.ts`),
and carry guarantees neither JSON file can:

- age is **one dimension of several** — judo needs age + weight + federation + belt, golf needs
  a decimal handicap, para needs a classification that is not on a number line;
- a published version's content is **frozen** (`rule_child_frozen`), so a category cannot be
  rewritten under an athlete who already entered;
- activating a version **requires an impact analysis bound to that exact content**
  (`content_hash` + the composite foreign key), so there is no silent reclassification.

Both registers become one when both apps read this.

## Backend

Participant reads (identity from token): the active rule version for a product, and the
category derivation for an entrant, returning the **full `MultiDimensionDerivation`** —
every dimension, the value it aggregated, the band it matched and *which fact it consumed*
(RUL-04). A derivation that returns only a category name cannot be defended when an athlete
disputes it.

OC routes (`@Roles(...)`): list/create/edit rule sets and versions, add dimensions and
eligibility predicates, run an impact analysis, publish.

**Publishing goes through `core.publish_rule_version(version_id, ran_by)` and nothing else.**
It is the one correct sequence — analysis, hash, activate. Callers insert versions as `draft`;
a service that sets `status = 'active'` itself will be refused by
`active_needs_impact_analysis`, and working around that refusal defeats the guarantee.

Eligibility refusal messages are **i18n keys** (`messageKey`), never sentences — PLT-02 makes
bilingual a launch requirement and an Italian entrant cannot be shown an English reason.

## The apps

- `wms_admin`: the Rules Configurator reads and writes the backend. Publishing must surface
  the impact analysis — how many entries change category — **before** the administrator
  confirms. That is the point of RUL-04 and the reason the analysis is bound to the hash.
- `wms_participant`: `ApiRulesRepository` already exists; repoint it at `:3050` and keep the
  mock as the offline fallback.
- **Delete both JSON registers** once the apps read the backend. Leaving either in place
  recreates the defect the moment someone imports it "just for the fallback".

## Tests

- The same product resolves to the **same category** through the participant path and the admin
  preview. This is the test that closes F2; write it first, and make it assert equality of the
  full derivation, not just the category name.
- A published version cannot be edited (the trigger refuses).
- Activating without an impact analysis is refused.
- A judo rule with three dimensions (age range, decimal weight, belt enum) derives correctly —
  this is the pattern the old JSON could not express at all.
- An eligibility refusal returns a key, and the participant app renders EN and IT.
- Green in all three repos.

## Definition of done

Change a band in the admin configurator, publish it with its impact analysis, and show the
participant screen deriving the new category for a matching entrant — one register, both
screens. Paste the before/after.

**Coordinate before running the backend suite:** `test/globalSetup.ts` writes the throwaway
database URL to a single shared file, so two suites running at once break each other.
