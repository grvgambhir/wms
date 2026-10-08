# Backend & Database Plan — Como Lake 2027

**Written:** 7 September 2026
**Status:** Draft for approval
**Parent:** `PHASE_B_PLAN.md` Track A (substrate). This is that track's engineering detail.
**Derived from:** the 23 models in `wms_domain/domain/models/` — the schema below is a translation of types that already exist and are already exercised by tests, not a fresh design.

---

## 1. Right-sizing — read before anything else

The RFP's numbers sound large. Written down, they are not:

| Quantity | Value | What it means for the database |
|---|---|---|
| Athletes | ~14,000 baseline, 20,000 peak | 20k rows |
| Entries | ~2.5 per athlete | ~50,000 rows |
| Sports | 40+ | 40 rows |
| Rule versions | tens | negligible |
| Payments | ~50,000 lifetime | trivial |
| Concurrent sessions | 2,000 peak | **this is the real number** |

**The whole dataset fits comfortably in RAM on a single modest server.** There is no volume problem here, and pretending otherwise is the most likely way to damage this project.

So the following are explicitly **rejected** as premature: microservices, sharding, event sourcing, CQRS, a separate read model, Kafka, Elasticsearch, and NoSQL anything. Each adds failure modes and operational burden to solve a problem this system does not have.

**The two real problems are:**

1. **Burst concurrency.** Registration opens once. Two thousand people hit the same forty sports in the same ten minutes. The risk is not throughput — it is *correctness under contention*: overselling a 60-place quota, double-charging a retried payment.
2. **Temporal correctness.** An entry created under rule v2.1 must be judged by v2.1 **forever**, even after v2.2 publishes. Get this wrong and eligibility silently rewrites itself — which is exactly the defect the compliance audit found in the current demo (`PHASE_B_PLAN.md` F2/F3).

Everything below is designed against those two. Best practice here is **boring, constrained, correct Postgres** — not distributed systems.

---

## 2. Stack

| Layer | Choice | Why this one |
|---|---|---|
| Runtime | **Node 22 LTS + NestJS** | `@wms/domain` is TypeScript. One language means the rules engine is *imported*, never re-implemented. A Python backend would require porting `engine.ts` and `statusLifecycle.ts` and then keeping two copies correct forever. |
| Database | **PostgreSQL 18** | Native `uuidv7()`, transactional constraints, `jsonb` for rule bands, partial and expression indexes, range types for temporal validity, row-level security. On PG17 add the `pg_uuidv7` extension and everything else is identical. **Docker:** the PG18 image stores data under `/var/lib/postgresql/<version>/docker`, not `/var/lib/postgresql/data` — mounting the old path makes the container exit 1. Mount `/var/lib/postgresql`. |
| Migrations | **Prisma Migrate** or **node-pg-migrate** | Versioned, reviewable, reversible SQL in git. Never an ORM auto-sync against production. |
| Query layer | **Kysely** (typed SQL) over a heavy ORM | The hard queries here are explicit joins and locks. A typed query builder keeps them readable and stops the N+1 patterns an ORM hides. |
| Pooling | **PgBouncer**, transaction mode | 2,000 sessions must not become 2,000 Postgres backends. |
| Cache / queue | **Redis** | Sessions, rate limits, the outbox worker, and *display-only* quota counters. Never the source of truth. |
| Object storage | **S3** (eu-south-1, Milan) | Evidence files and photos. Server-side encryption, presigned URLs, versioning on. |
| Identity | **External IdP** (Auth0 / Cognito / Keycloak) | Email+password, OTP, **MFA (PLT-04, a gate item)**, session and login audit in one place. We store no passwords. |

**D5 is settled: AWS Cognito.** `CognitoIdentityProvider` sits behind the same
`IdentityProvider` seam; `LocalIdentityProvider` remains, selected by `AUTH_PROVIDER`, so
tests and offline work do not need a pool. Nothing in guards, controllers or services
changed — that was the test of whether the seam was real.

The API is a **resource server and accepts access tokens only** (`token_use=access`).
An id token carries email and name; putting those on every API call would contradict this
plan's own rule that identity fields never ride the token the API verifies. Verification
pins RS256, fetches JWKS once and caches it, and checks `iss`, `token_use`, `client_id`
(participant or admin) and expiry — any failure is a 401 with the same body.

`core.person.idp_subject` holds the Cognito `sub`. **Linking is by `sub`, never by email** —
email is mutable in Cognito and is not on an access token, so matching on it would let a
changed address silently adopt someone else's person. A first login therefore creates a
person with a placeholder date of birth and **no roles**.

That placeholder is guarded rather than trusted: `core.person.profile_status` marks it, and a
trigger refuses a registration entry for such a person. Age drives banding, and a
placeholder computes as 127 on the 2027 reference date — harmless today only because no
band is open-ended, and silently wrong the day a "100+" band is added.

**Roles stay local.** `cognito:groups` is ignored: a group cannot express "OC staff at Como,
participant at Kansai", and `core.person_role` carries `event_id` precisely for that.

`core.user_credential` and `core.refresh_token` are dead under Cognito. The drop migration is
written and **deliberately unapplied** (`migrations/pending/`) — removing credentials before
the replacement is proven against a real pool is unrecoverable.

The earlier arrangement, kept for reference: The rules that keep the swap cheap:

- Guards, controllers and services **must not** import JWT libraries or touch the credential
  table. If `jsonwebtoken` appears outside the provider, the seam has leaked.
- **Keep** `core.role` and `core.person_role` after D5 — those are *authorization*, which the
  IdP does not own. A role grant is per-edition (`event_id` in the key, NULL = global),
  because a person may be OC staff for Como and a participant at Kansai.
- **Drop** `core.user_credential` and `core.refresh_token` when the IdP lands, and point
  `core.person.idp_subject` at the IdP subject.
- Access-token claims are `sub`, `roles`, `iat`, `exp`, `jti` — **never** email, name or any
  identity-document field. Anyone holding a token can read them.
- Idempotency `scope` is the authenticated person id (§4.6), set by the guard.

This is not production auth: no MFA — and **PLT-04 is a mandatory gate item** — no password
reset, and passwords stored locally.

**Runtime floor: Node 22.** `argon2` has no Node 20 prebuild for darwin-arm64 and segfaults
on `require` — exit 139, no stack, no message. `engine-strict=true` and a boot check turn
that into a sentence.
| Payments | **Stripe** | PCI scope stays outside our systems (SEC-07). |
| Hosting | **AWS eu-south-1 (Milan)** | DAT-02 requires EEA. Milan is closest to Como. |

---

## 3. Conventions every table follows

These are not stylistic. Each one closes a specific class of bug.

**1. UUIDv7 primary keys, never bigserial.**
```sql
CREATE EXTENSION IF NOT EXISTS citext;       -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- needed by the rule_version EXCLUDE constraint

id uuid PRIMARY KEY DEFAULT uuidv7()         -- PG18 native; pg_uuidv7 extension on PG17
```
UUIDv7 is time-ordered, so inserts append to the right edge of the B-tree instead of scattering across it the way v4 does. You keep global uniqueness and merge-ability across environments *and* keep index locality. Sequential integers would leak volume (`/entries/1042` tells a competitor how many registrations exist).

**2. Every event-scoped table carries `event_id`.**
World Masters Sport has run fifteen editions and has four more scheduled — Kansai 2027, Lahti 2028, Perth 2029. **A schema hardcoded to Como is single-use software.** Event-scoping costs one column and one index now, and is the difference between selling this platform once and selling it every two years.

**3. Money is always two columns, never a float.**
```sql
amount_minor bigint NOT NULL,          -- 9000 = €90.00
currency     char(3) NOT NULL DEFAULT 'EUR'
```
Never `numeric` for money in transit, never `float` at all. `Payment.amount` in the current domain model is an untyped `number` — this schema pins the contract the docs always intended.

**4. Time is `timestamptz`, stored UTC, displayed Europe/Rome.**
Calendar dates that are *not* instants — date of birth, a rule's reference date — are `date`, so a timezone can never shift someone's age band across a boundary.

**5. Audit tables are append-only, enforced by grant.**
```sql
REVOKE UPDATE, DELETE ON audit.activity_log FROM app_rw;
```
An audit trail the application can edit is not an audit trail.

**6. Nothing is hard-deleted.** State lives in a status column; GDPR erasure is a separate, deliberate, logged operation (DAT-03), not a stray `DELETE`.

**7. Restricted data lives in its own schema with its own grants.**
PRV-04 requires medical and para-classification evidence to be separated from the general profile. A separate schema makes that a *permission* boundary, not a code convention — the ordinary application role cannot read it at all.

---

## 4. The schema

### 4.0 Bootstrap — extensions, schemas, roles

**§4 is organised by topic for reading. Migrations apply in dependency order** (§4.0.4), not in the
order the tables appear below. Everything here runs before the first `CREATE TABLE`.

```sql
-- 4.0.1 Extensions
CREATE EXTENSION IF NOT EXISTS citext;      -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- uuid '=' operator for the rule_version EXCLUDE

-- 4.0.2 Schemas
CREATE SCHEMA core;        -- ordinary operational data
CREATE SCHEMA restricted;  -- Art. 9 special-category data (PRV-04)
CREATE SCHEMA ops;         -- back-office workflow
CREATE SCHEMA audit;       -- append-only trails

-- 4.0.3 Roles — every REVOKE/GRANT below depends on these existing.
--
-- ROLES ARE CLUSTER-SCOPED, NOT DATABASE-SCOPED. Schemas and grants belong to a
-- database; roles belong to the whole cluster. So a plain CREATE ROLE in a migration
-- succeeds on the first database and fails with "role already exists" on the second —
-- which in practice means it fails the moment a test harness creates a throwaway
-- database, i.e. on every CI run. Verified on PG18, 8 Sep 2026.
--
-- In production, roles are provisioned by INFRASTRUCTURE (Terraform / the RDS bootstrap)
-- once per cluster, before any application migration runs. The idempotent form below
-- exists so local and CI databases can be created freely from the same file.
DO $$ BEGIN CREATE ROLE app_rw        NOLOGIN;   -- the app; cannot see `restricted`
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE restricted_rw NOLOGIN;   -- the medical/para review path only
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE reporting_ro  NOLOGIN;   -- read replica: exports, finance
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- `down` must be wrapped the same way: another database in the cluster may still hold
-- grants to these roles, and DROP ROLE would fail.

GRANT USAGE ON SCHEMA core, ops, audit TO app_rw;
GRANT USAGE ON SCHEMA core            TO reporting_ro;
REVOKE ALL ON SCHEMA restricted FROM app_rw, reporting_ro, PUBLIC;
GRANT USAGE ON SCHEMA restricted TO restricted_rw;

-- USAGE ON SCHEMA only permits LOOKING OBJECTS UP. It does not permit reading or writing
-- them: without table privileges `app_rw` can do nothing at all. Default privileges are
-- set once here so every table created from now on is granted automatically — otherwise
-- every future migration has to remember, and the one that forgets fails in production
-- rather than in CI.
ALTER DEFAULT PRIVILEGES IN SCHEMA core, ops
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA core
  GRANT SELECT ON TABLES TO reporting_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit
  GRANT SELECT, INSERT ON TABLES TO app_rw;          -- append-only by construction
ALTER DEFAULT PRIVILEGES IN SCHEMA restricted
  GRANT SELECT, INSERT, UPDATE ON TABLES TO restricted_rw;

-- Per-table REVOKEs (audit trails, rule_version) then subtract from this baseline.
```

`uuidv7()` is native on PostgreSQL 18. On PG17 add `pg_uuidv7` here.

#### 4.0.4 Migration order

Foreign keys force this order. `event` and `rule_set` precede everything; `registration_entry`
depends on `team_roster` and `entry_quota`, which appear later in this document for readability:

```
locale → event → sport
  → rule_set → rule_version → rule_dimension → rule_eligibility
  → sport_entry_product → quota_pool → entry_quota_consumption → fee → category_combination
  → attribute_type
  → person → athlete_profile → consent → pre_registration → pre_registration_match
  → team_roster → roster_member
  → registration_entry → entry_status_event → category_audit → waitlist_entry
  → evidence_document → entrant_attribute
  → rule_impact_analysis → rule_impact_entry
  → ALTER rule_version ADD impact_analysis_id          ← breaks the one circular reference
  → rule_notification
  → registration_order → order_line → promotion → order_promotion
  → payment_intent → payment_event → refund → invoice_series → invoice
  → accreditation_gate → accreditation
  → translation → broadcast → delivery
  → exception_case → exception_signature
  → proxy_consent → assisted_session → partner_request
  → idempotency_key → audit.activity_log (+ partitions)
  → restricted.evidence_document → restricted.accommodation_need → restricted.access_log
```

`core.locale` comes first because `core.person.locale` references it. `rule_version` and
`rule_impact_analysis` reference each other, so the second link is added by `ALTER` — the only
circular reference in the schema, and it is deliberate: a version may not go `active` without an
analysis, and an analysis is meaningless without a version.

**Naming note:** the orders table is `core.registration_order`, not `core.order` — `ORDER` is a
reserved SQL keyword, so `CREATE TABLE core.order` is a syntax error and every query would otherwise
need `core."order"` forever.

### 4.1 Identity

The key decision: **a person is global; participation is per-edition.** A masters athlete may enter Como 2027 and Kansai 2027. One human, two registrations.

```sql
CREATE TABLE core.person (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  idp_subject   text UNIQUE,                      -- external IdP subject; NULL for desk-created people
  email         citext UNIQUE,
  given_name    text NOT NULL,
  family_name   text NOT NULL,
  date_of_birth date NOT NULL,                    -- date, not timestamp — age must not shift by timezone
  nationality   char(2),                          -- ISO 3166-1 alpha-2
  gender        text,
  phone         text,                            -- shipped: P06 profile edits it
  profile_image_key text,                        -- shipped: portrait key, reused on the pass
  locale        text REFERENCES core.locale(code), -- PLT-02: which language to write to them in
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.athlete_profile (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id   uuid NOT NULL REFERENCES core.person(id),
  event_id    uuid NOT NULL REFERENCES core.event(id),
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, event_id)                    -- one profile per person per edition
);

-- A TABLE, not three columns on `person`. The shipped form collects one contact; the
-- tender does not cap it at one, and inline columns would freeze "exactly one" into the
-- schema and force a breaking migration for the second.
CREATE TABLE core.emergency_contact (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id    uuid NOT NULL REFERENCES core.person(id) ON DELETE CASCADE,
  name         text NOT NULL,
  relationship text,
  phone        text NOT NULL,
  ordinal      smallint NOT NULL DEFAULT 1,       -- display order
  UNIQUE (person_id, ordinal)
);
CREATE INDEX ON core.emergency_contact (person_id);

-- NOTE: passport / ID numbers do NOT belong here. PRV-04 classifies identity documents as
-- restricted, so they live in restricted.identity_document (§4.7) with no FK back to core —
-- otherwise a SELECT * on a person leaks them.

CREATE TABLE core.consent (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id     uuid NOT NULL REFERENCES core.person(id),
  event_id      uuid REFERENCES core.event(id),
  kind          text NOT NULL,                    -- 'privacy' | 'medical' | 'proxy' | 'marketing'
  granted       boolean NOT NULL,
  version       text NOT NULL,                    -- which text they agreed to
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  source        text NOT NULL                     -- 'participant' | 'desk' | 'proxy'
);
CREATE INDEX ON core.consent (person_id, kind, occurred_at DESC);
```

`core.consent` is append-only: consent is never *updated*, it is re-granted or withdrawn as a new row. Under GDPR you must prove what someone agreed to **and when** — a mutable boolean cannot do that.

### 4.2 Event catalogue

```sql
CREATE TABLE core.event (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  slug         text UNIQUE NOT NULL,              -- 'como-lake-2027'
  name         text NOT NULL,
  starts_on    date NOT NULL,
  ends_on      date NOT NULL,
  timezone     text NOT NULL DEFAULT 'Europe/Rome',
  age_reference_date date NOT NULL,               -- RUL-02 — configurable, not the hardcoded 2027-12-31
  status       text NOT NULL DEFAULT 'planned',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.sport (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id   uuid NOT NULL REFERENCES core.event(id),
  code       text NOT NULL,                       -- 'swimming'
  name       text NOT NULL,
  UNIQUE (event_id, code)
);

CREATE TABLE core.sport_entry_product (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id          uuid NOT NULL REFERENCES core.event(id),
  sport_id          uuid NOT NULL REFERENCES core.sport(id),
  discipline        text,
  name              text NOT NULL,
  participant_type  text NOT NULL,                -- individual|doubles|team|crew|relay
  rule_set_id       uuid NOT NULL REFERENCES core.rule_set(id),
  allowed_grades    text[] NOT NULL DEFAULT '{competitive,recreational}',
  partner_required  boolean NOT NULL DEFAULT false,
  requires_evidence boolean NOT NULL DEFAULT false,
  -- No price column: fees vary by category, grade and time. See core.fee (§4.11).
  UNIQUE (event_id, sport_id, name)
);
CREATE INDEX ON core.sport_entry_product (event_id, sport_id);
```

### 4.3 Rules — versioned and temporal

This is the schema fix for **F2** (two disjoint registers) and **F3** (publish writes a notice, not the register).

```sql
-- Identity of a rule. Stable across all its versions.
-- RUL-01 names NINE scope dimensions: "sport, discipline, event, gender/category, team
-- type, competition grade, venue, phase and effective date". The first draft carried four.
-- The missing five are not hypothetical: a venue- or grade-specific rule cannot be
-- expressed without them, and §3.2 explicitly requires grade-specific fees and quotas.
CREATE TABLE core.rule_set (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id    uuid NOT NULL REFERENCES core.event(id),
  sport_code  text NOT NULL,
  discipline  text,
  event_name  text,
  gender      text,                              -- NULL = applies to all
  team_type   text,                              -- individual|doubles|team|crew|relay
  grade       text,                              -- competitive|recreational
  venue_code  text,
  phase       text,                              -- qualification|final|…
  -- Precedence when several sets match one entry: LOWEST number wins. Explicit, because
  -- "most specific wins" is ambiguous once scopes overlap on different axes — and an
  -- ambiguous rule selection is a silent wrong-category bug.
  precedence  integer NOT NULL DEFAULT 100,
  -- NULLS NOT DISTINCT: a NULL on any scope axis would otherwise make every row distinct
  -- and permit duplicate rule sets.
  UNIQUE NULLS NOT DISTINCT (event_id, sport_code, discipline, event_name,
                             gender, team_type, grade, venue_code, phase)
);
CREATE INDEX rule_set_selection ON core.rule_set (event_id, sport_code, precedence);

-- IMMUTABLE. Publishing never updates a row here — it inserts a new one.
CREATE TABLE core.rule_version (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  rule_set_id    uuid NOT NULL REFERENCES core.rule_set(id),
  version_no     integer NOT NULL,                -- monotonic; not the 'v2.1' string
  reference_date date NOT NULL,
  -- Categorisation moved out: one row per banded attribute in core.rule_dimension,
  -- eligibility in core.rule_eligibility. See §4.3.1 — age is ONE dimension, not the model.
  effective      tstzrange NOT NULL,              -- when this version governs
  status         text NOT NULL DEFAULT 'draft',   -- draft|active|superseded
  published_by   uuid REFERENCES core.person(id),
  approved_by    uuid REFERENCES core.person(id), -- RUL-04 requires an approver
  published_at   timestamptz,
  reason         text,
  UNIQUE (rule_set_id, version_no),
  -- Two active versions may never overlap in time for the same rule set.
  -- The uuid '=' operator here comes from btree_gist.
  EXCLUDE USING gist (rule_set_id WITH =, effective WITH &&)
    WHERE (status = 'active')
);
-- NOT a blanket REVOKE UPDATE: publishing must close the previous version's `effective` range,
-- which is an UPDATE. A trigger makes the *content* immutable while leaving that one move legal.
CREATE FUNCTION core.rule_version_immutable() RETURNS trigger AS $$
BEGIN
  IF (NEW.rule_set_id, NEW.version_no, NEW.reference_date, lower(NEW.effective))
     IS DISTINCT FROM
     (OLD.rule_set_id, OLD.version_no, OLD.reference_date, lower(OLD.effective)) THEN
    RAISE EXCEPTION 'rule_version content is immutable; publish a new version instead';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER rule_version_no_rewrite BEFORE UPDATE ON core.rule_version
  FOR EACH ROW EXECUTE FUNCTION core.rule_version_immutable();

REVOKE DELETE ON core.rule_version FROM app_rw;

CREATE INDEX ON core.rule_version (rule_set_id, status, lower(effective) DESC);
```

Three things this buys:

- **One register.** Both portals read `core.rule_version`. There is no second copy to drift, because there is no second copy.
- **Publishing mutates reality.** In one transaction, publishing **first** closes the outgoing version's `effective` range and **then** inserts the new one. That order matters: inserting first would momentarily overlap, and the `EXCLUDE` constraint would reject the whole transaction. The next athlete is judged by the new version immediately.
- **The `EXCLUDE` constraint makes contradictory rules impossible.** Two overlapping active versions for one sport cannot exist — not "shouldn't", *cannot*. That is a database guarantee, not a code review.

Bands stay `jsonb` **inside a dimension** because they are read whole, written whole, and validated by the domain package on the way in. Normalising individual bands into their own table would buy nothing and cost a join on the hottest read in the system. Dimensions themselves are rows rather than JSON, because they are exactly what an administrator configures and exactly what the RFP's ten patterns differ by.

#### 4.3.1 Dimensions — how ten Masters patterns become configuration

RFP §9.1 gate 3 requires all ten §3.2 patterns. The first draft modelled a rule as
`strategy + bands`, which is a 1:1 copy of today's `SportRule` type — and that type only expresses
**age**. Four patterns worked; six (judo, golf handicap, para classification, proficiency review,
category combination, eligibility exclusions) had no columns anywhere. Adding a `strategy` value per
sport would be the per-sport code branching the RFP explicitly forbids.

**The generalisation comes from the engine itself.** `deriveCategory()` does exactly two things: it
aggregates a number off the roster (`bandingAge`), then bands it. The four "strategies" are four
*aggregation functions over one attribute*. So:

> **Age is one dimension, not the model.** A rule version is an ordered list of dimensions; each
> derives a value from the entrant and maps it to a band. The category is the tuple of matched bands.

```sql
CREATE TABLE core.rule_dimension (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  rule_version_id uuid NOT NULL REFERENCES core.rule_version(id) ON DELETE CASCADE,
  ordinal         smallint NOT NULL,             -- category label is the ordered tuple
  attribute       text NOT NULL,                 -- age|weight_kg|belt_rank|handicap_index|
                                                 -- para_class|proficiency_grade
  aggregation     text NOT NULL DEFAULT 'self'   -- self|min|max|mean|sum
                    CHECK (aggregation IN ('self','min','max','mean','sum')),
  exclude_roles   text[] NOT NULL DEFAULT '{}',  -- {coxswain}
  -- Rounding is an AGE concept. Applying integer floor/round/ceil to a golf handicap
  -- (-2.4) or a judo weight (73.6 kg) corrupts the fact rather than banding it, so it
  -- is legal only on integer-valued attributes.
  rounding        text NOT NULL DEFAULT 'floor'
                    CHECK (rounding IN ('none','floor','round','ceil')),
  value_scale     smallint NOT NULL DEFAULT 0,   -- decimal places the attribute carries
  CONSTRAINT rounding_only_on_integers
    CHECK (value_scale = 0 OR rounding = 'none'),
  band_kind       text NOT NULL CHECK (band_kind IN ('range','enum')),
  bands           jsonb NOT NULL,                -- range: [{id,name,min,max}]
                                                 -- enum:  [{id,name,codes:[...]}]
  UNIQUE (rule_version_id, ordinal),
  UNIQUE (rule_version_id, attribute)            -- an attribute is banded once per rule
);
CREATE INDEX ON core.rule_dimension (rule_version_id, ordinal);
```

`band_kind` is the one genuinely new idea. Age, weight and handicap are **ranges**; belt rank, para
class and proficiency grade are **enumerated codes** that do not sit on a number line. A single
`minAge/maxAge` shape cannot express both, which is why the first draft could not reach six patterns.

**Today's four strategies migrate mechanically — no behaviour changes and no test breaks:**

| Existing `strategy` | Becomes one dimension |
|---|---|
| `individual` | `{attribute: age, aggregation: self}` |
| `youngest-member` | `{attribute: age, aggregation: min}` |
| `crew-average` | `{attribute: age, aggregation: mean, exclude_roles: {coxswain}, rounding: floor}` |
| `relay-aggregate` | `{attribute: age, aggregation: sum}` |

**And the six that were unreachable become configuration:**

| Pattern | Dimensions | Plus |
|---|---|---|
| Judo | `age` + `weight_kg` (range) + `belt_rank` (enum) | federation-membership predicate |
| Golf handicap | `handicap_index` (range, allows negatives) | licence-valid predicate |
| Para classification | `age` + `para_class` (enum) | class-not-expired predicate |
| Proficiency grade | `age` + `proficiency_grade` (enum) | evidence-required predicate |
| Eligibility exclusions | — | predicates only (§ below) |
| Category combination | — | `core.category_combination` (§ below) |

#### Impact analysis and notification — RUL-03 and RUL-05

The first draft recorded the *outcome* of a reclassification in `category_audit` but nothing recorded
the **analysis performed before publishing** (RUL-03) or the **notification and acknowledgement**
afterwards (RUL-05). Both are Musts, and the compliance audit's sharpest line about the running
product was that changing a rule silently rewrote a paid entry's category.

```sql
-- RUL-03: what a proposed version WOULD do, computed before it is allowed to go active.
CREATE TABLE core.rule_impact_analysis (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  rule_version_id  uuid NOT NULL REFERENCES core.rule_version(id) ON DELETE CASCADE,
  entries_examined integer NOT NULL,
  entries_affected integer NOT NULL,
  paid_affected    integer NOT NULL,              -- reclassifying a PAID entry is the severe case
  summary          jsonb NOT NULL,                -- {"35-39 → 40-44": 12, ...}
  -- sha256 over the dimensions + predicates as they stood when this ran. Activation
  -- compares it with the version's own hash, so a stale analysis cannot be reused.
  evaluated_content_hash text NOT NULL,
  ran_by           uuid NOT NULL REFERENCES core.person(id),
  ran_at           timestamptz NOT NULL DEFAULT now(),
  approved_by      uuid REFERENCES core.person(id),   -- §7.7.4 named OC approval
  approved_at      timestamptz,
  CHECK (entries_affected <= entries_examined),
  CHECK (paid_affected <= entries_affected)
);

-- The per-entry detail, so an athlete can be shown exactly what changed for them.
CREATE TABLE core.rule_impact_entry (
  analysis_id   uuid NOT NULL REFERENCES core.rule_impact_analysis(id) ON DELETE CASCADE,
  entry_id      uuid NOT NULL REFERENCES core.registration_entry(id),
  from_category text,
  to_category   text,
  was_paid      boolean NOT NULL,
  PRIMARY KEY (analysis_id, entry_id)
);

-- RUL-05: notified. Acknowledgement is retained as PRODUCT POLICY — the tender
-- requires notification, not acknowledgement; the first draft called it a Must in error.
CREATE TABLE core.rule_notification (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  rule_version_id uuid NOT NULL REFERENCES core.rule_version(id),
  person_id       uuid NOT NULL REFERENCES core.person(id),
  entry_id        uuid REFERENCES core.registration_entry(id),
  channel         text NOT NULL,                  -- inapp|email
  locale          text NOT NULL,                  -- what language it went out in (PLT-02)
  sent_at         timestamptz,
  acknowledged_at timestamptz,
  UNIQUE (rule_version_id, person_id, entry_id)
);
CREATE INDEX ON core.rule_notification (person_id)
  WHERE acknowledged_at IS NULL;                  -- "who still has not seen this"
```

**The constraint that makes "no silent reclassification" true.** A version may not become `active`
without an analysis attached. Because the two tables reference each other, the column is added by
`ALTER` once both exist — §4.0.4's migration order accounts for it:

```sql
-- The analysis must belong to THIS version and have evaluated THIS content. A plain
-- "analysis_id IS NOT NULL" only proves an analysis row exists somewhere — version 5
-- could be activated carrying version 2's analysis, and nothing would object.
--
-- A CHECK cannot look across tables, so the binding is a COMPOSITE FOREIGN KEY: the
-- analysis's own key is widened, and the version references all three columns at once.
ALTER TABLE core.rule_impact_analysis
  ADD CONSTRAINT analysis_identity UNIQUE (id, rule_version_id, evaluated_content_hash);

ALTER TABLE core.rule_version
  ADD COLUMN content_hash       text,   -- sha256 over this version's dimensions + predicates
  ADD COLUMN impact_analysis_id uuid,
  ADD CONSTRAINT analysis_is_for_this_exact_content
    FOREIGN KEY (impact_analysis_id, id, content_hash)
    REFERENCES core.rule_impact_analysis (id, rule_version_id, evaluated_content_hash),
  ADD CONSTRAINT active_needs_impact_analysis
    CHECK (status <> 'active' OR (impact_analysis_id IS NOT NULL AND content_hash IS NOT NULL));
```

Three things now have to be true before a version can go `active`: an analysis exists, it
was run **against this version**, and the content it evaluated is **bit-for-bit** what is
about to govern. Edit a band after running the analysis and `content_hash` no longer
matches, so activation is refused rather than silently proceeding on stale numbers.

#### Published content must actually be frozen

The header trigger above protects `rule_version`'s own columns — but after §4.3.1 moved
categorisation into `rule_dimension` and `rule_eligibility`, **the header barely holds any
content**. Those child rows carry the bands and the predicates, they had no guard of their
own, and `ALTER DEFAULT PRIVILEGES` grants `app_rw` `UPDATE`/`DELETE` on them.

So a published rule's *meaning* could be rewritten while its version id stayed the same —
which defeats the entire point of `registration_entry.rule_version_id`. An entry would be
pinned to an immutable identifier whose content had quietly changed underneath it.

```sql
CREATE FUNCTION core.rule_child_frozen() RETURNS trigger AS $$
DECLARE
  parent uuid := COALESCE(NEW.rule_version_id, OLD.rule_version_id);
  parent_status text;
BEGIN
  SELECT status INTO parent_status FROM core.rule_version WHERE id = parent;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION
      'rule version % is % — its dimensions and predicates are frozen; publish a new version',
      parent, parent_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

CREATE TRIGGER rule_dimension_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON core.rule_dimension
  FOR EACH ROW EXECUTE FUNCTION core.rule_child_frozen();

CREATE TRIGGER rule_eligibility_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON core.rule_eligibility
  FOR EACH ROW EXECUTE FUNCTION core.rule_child_frozen();
```

A rule is editable only while `draft`. Publication is therefore the moment content becomes
permanent, and **every change after it is a new complete version** — which is what RUL-05's
publish/export/audit trail assumes and what `content_hash` measures.

**A correction to §4.4's wording.** The claim that an entry keeps its rule "forever" is too
strong, and the tender does not ask for it. Controlled revalidation happens — a roster
change, an appeal, an OC decision. What must never happen is *silent* re-evaluation. The
guarantee is therefore: an entry's evaluation is pinned to an exact immutable version, and
moving it to another version is a recorded decision with an approver, not a side effect.

Publishing without first running the analysis is now rejected by the database. That is the difference
between a policy in a runbook and a guarantee.

#### Eligibility — pass/fail gates, deliberately not dimensions

Exclusions are not categorisation: they decide whether an entrant may enter at all. Modelling them as
bands would have been the tempting shortcut and the wrong one.

```sql
CREATE TABLE core.rule_eligibility (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  rule_version_id uuid NOT NULL REFERENCES core.rule_version(id) ON DELETE CASCADE,
  ordinal         smallint NOT NULL,
  predicate       text NOT NULL,                 -- min_age|max_age|federation_member|licence_valid|
                                                 -- class_not_expired|grade_in|attribute_in|not_in_list
  params          jsonb NOT NULL,                -- {"min": 30} / {"codes": ["S5","S6"]}
  severity        text NOT NULL
                    CHECK (severity IN ('blocks','requires_evidence','warns')),
  message_key     text NOT NULL,                 -- i18n key — never a hardcoded English string
  UNIQUE (rule_version_id, ordinal)
);
```

`message_key` rather than `message` matters: PLT-02 makes bilingual a launch requirement, and a rule
that hardcodes an English refusal reason cannot be shown to an Italian entrant. This is the same
defect the compliance audit found in `loginSchema.ts`, caught here before it is written.

#### Entrant attributes — where weight, belt, handicap and class actually live

Dimensions reference attributes that must be stored somewhere. Today only date of birth exists.

```sql
-- A fact is SCOPED and VERSIONED, not one value per person per event. One athlete holds
-- licences from different federations, a proficiency review per sport, and class
-- determinations from different authorities. `UNIQUE (event, person, attribute)` collapses
-- all of that into one row and loses which fact a rule actually consumed.
CREATE TABLE core.entrant_attribute (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id      uuid NOT NULL REFERENCES core.event(id),
  person_id     uuid NOT NULL REFERENCES core.person(id),
  attribute     text NOT NULL REFERENCES core.attribute_type(name),
  sport_code    text,                            -- NULL = applies across sports
  issuer        text,                            -- federation / classifier / authority
  version_no    integer NOT NULL DEFAULT 1,      -- facts are superseded, never overwritten
  numeric_value numeric(10,3),                   -- scale 3: handicaps and weights survive
  text_value    text,
  -- A DECLARED fact and a VERIFIED one are different things, and a rule says which it
  -- needs. Collapsing them is how an unverified self-reported handicap silently becomes
  -- an eligibility decision.
  status        text NOT NULL DEFAULT 'declared'
                  CHECK (status IN ('declared','verified','rejected','expired')),
  verified_by   uuid REFERENCES core.person(id),
  verified_at   timestamptz,
  valid_from    date,
  valid_until   date,                            -- para classes and licences expire
  evidence_id   uuid REFERENCES core.evidence_document(id),
  superseded_by uuid REFERENCES core.entrant_attribute(id),
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (event_id, person_id, attribute, sport_code, issuer, version_no),
  CHECK (numeric_value IS NOT NULL OR text_value IS NOT NULL),
  CONSTRAINT verified_needs_a_verifier
    CHECK ((status = 'verified') = (verified_by IS NOT NULL))
);
-- At most one CURRENT fact per (person, attribute, sport, issuer).
CREATE UNIQUE INDEX entrant_attribute_current
  ON core.entrant_attribute (event_id, person_id, attribute,
                             coalesce(sport_code,''), coalesce(issuer,''))
  WHERE superseded_by IS NULL AND status <> 'rejected';
CREATE INDEX entrant_attribute_by_person ON core.entrant_attribute (person_id, attribute);
CREATE INDEX entrant_attribute_expiry ON core.entrant_attribute (valid_until)
  WHERE valid_until IS NOT NULL AND superseded_by IS NULL;

-- The typed dictionary. Without it `attribute` is free text: nothing stops 'weight_kg'
-- and 'weightKg' becoming two different facts, or a dimension banding a value whose
-- units and precision nobody declared.
CREATE TABLE core.attribute_type (
  name                  text PRIMARY KEY,        -- weight_kg|belt_rank|handicap_index|…
  value_kind            text NOT NULL CHECK (value_kind IN ('numeric','enum')),
  unit                  text,                    -- 'kg', 'index'; NULL for enums
  scale                 smallint NOT NULL DEFAULT 0,
  allowed_codes         text[],                  -- enum domain; NULL for numeric
  requires_verification boolean NOT NULL DEFAULT false,
  CONSTRAINT enum_has_codes CHECK ((value_kind = 'enum') = (allowed_codes IS NOT NULL))
);
```

`valid_until` is what makes RUL-02's "para classification with expiry" real rather than aspirational,
and the partial index is the expiry sweeper's only index. `evidence_id` ties a claimed attribute to the
document that proves it, so a weight or a belt rank is never merely asserted.

**Note on restricted data:** a para classification *code* is a categorisation input and lives here; the
medical evidence *behind* it stays in `restricted.evidence_document`. That split is deliberate — see
finding E in §4.11 for why ACS-05 forces it further still.

#### Category combination — CMP-03, preserving the original award category

When a category is too thin to run, it is combined with another. The RFP requires that the entrant's
**original award category survives** the combination.

```sql
CREATE TABLE core.category_combination (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id               uuid NOT NULL REFERENCES core.event(id),
  sport_entry_product_id uuid NOT NULL REFERENCES core.sport_entry_product(id),
  combined_key           text NOT NULL,          -- the field they actually compete in
  source_keys            text[] NOT NULL,        -- the categories merged into it
  min_entries            integer,                -- the threshold that triggered it
  reason                 text NOT NULL,
  decided_by             uuid NOT NULL REFERENCES core.person(id),
  decided_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sport_entry_product_id, combined_key),
  CHECK (cardinality(source_keys) >= 2)
);
```

`registration_entry` already keeps `original_category_*` alongside `current_category_*` (RUL-04). This
table records the *combination decision itself* — who made it, when, on what threshold — so a medal
awarded in a combined field can still be traced to the category the athlete entered.

**What this does not do.** Combination is competition-side and executes in Phase C. It is modelled now
because retrofitting award lineage after results exist is a destructive migration, which is exactly the
trap `PHASE_B_PLAN.md` warns about.

### 4.4 Registration

```sql
CREATE TABLE core.registration_entry (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id               uuid NOT NULL REFERENCES core.event(id),
  athlete_profile_id     uuid NOT NULL REFERENCES core.athlete_profile(id),
  sport_entry_product_id uuid NOT NULL REFERENCES core.sport_entry_product(id),
  partner_profile_id     uuid REFERENCES core.athlete_profile(id),
  grade                  text NOT NULL,
  -- Pinned to the exact immutable version. This is the whole temporal-correctness story.
  rule_version_id        uuid NOT NULL REFERENCES core.rule_version(id),
  original_category_id   text,
  original_category_name text,
  current_category_id    text,
  current_category_name  text,
  category_change_reason text,
  team_roster_id         uuid REFERENCES core.team_roster(id),
  evidence_status        text NOT NULL DEFAULT 'not_required',
  status                 text NOT NULL DEFAULT 'draft',
  -- No quota_id: an entry consumes a SET of pools. See core.entry_quota_consumption.
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- One athlete cannot hold two live entries in the same product.
CREATE UNIQUE INDEX uq_entry_live
  ON core.registration_entry (athlete_profile_id, sport_entry_product_id)
  WHERE status NOT IN ('cancelled','withdrawn','substituted');

CREATE INDEX ON core.registration_entry (event_id, status);
CREATE INDEX ON core.registration_entry (athlete_profile_id, created_at DESC);
CREATE INDEX ON core.registration_entry (sport_entry_product_id, status);
```

`rule_version_id` instead of `ruleId + ruleVersion` is the single most important column in this schema. The rule an entry was judged by is a foreign key to an immutable row. It **cannot** be retroactively rewritten by a later publication.

That partial unique index is how duplicate registration becomes impossible rather than merely unlikely — the double-click, the retried request and the two open tabs all collapse onto one row.

#### Status history — append-only, out of the entry

```sql
CREATE TABLE core.entry_status_event (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  entry_id     uuid NOT NULL REFERENCES core.registration_entry(id),
  from_status  text,
  to_status    text NOT NULL,
  actor_kind   text NOT NULL,                     -- participant|admin|system
  actor_id     uuid REFERENCES core.person(id),
  reason       text,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);
REVOKE UPDATE, DELETE ON core.entry_status_event FROM app_rw;
CREATE INDEX ON core.entry_status_event (entry_id, occurred_at);
```

The current model embeds `statusHistory?: EntryStatusEvent[]` inside the entry. As a JSON array it can be silently truncated by any writer that rewrites the row, and it cannot be indexed, queried across entries, or protected by grant. As its own append-only table it is all three. REV-044's guarded writer becomes a single `INSERT` inside the same transaction as the status change.

`actor_id` is now a real foreign key, which is what makes **F4**'s dual control stop being theatre.

#### Teams, rosters, waitlist

```sql
CREATE TABLE core.team_roster (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id   uuid NOT NULL REFERENCES core.event(id),
  captain_profile_id uuid REFERENCES core.athlete_profile(id),
  locked_at  timestamptz,                         -- TEA-04 roster lock
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.roster_member (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  roster_id     uuid NOT NULL REFERENCES core.team_roster(id) ON DELETE CASCADE,
  person_id     uuid REFERENCES core.person(id),
  display_name  text NOT NULL,
  date_of_birth date NOT NULL,
  role          text,                             -- captain|coxswain|partner|...
  position      integer NOT NULL,
  UNIQUE (roster_id, position)
);
CREATE INDEX ON core.roster_member (roster_id);

CREATE TABLE core.category_audit (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  entry_id      uuid NOT NULL REFERENCES core.registration_entry(id),
  from_category text,
  to_category   text NOT NULL,
  trigger       text NOT NULL,                    -- roster_change|substitution|rule_publication
  member_ages   jsonb NOT NULL,                   -- RUL-04: the arithmetic, preserved
  approved_by   uuid REFERENCES core.person(id),
  reason        text,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);
REVOKE UPDATE, DELETE ON core.category_audit FROM app_rw;

CREATE TABLE core.waitlist_entry (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  quota_pool_id     uuid NOT NULL REFERENCES core.quota_pool(id),  -- waitlists are per pool
  entry_id          uuid NOT NULL REFERENCES core.registration_entry(id),
  status            text NOT NULL DEFAULT 'waiting'
                      CHECK (status IN ('eligible','waiting','offered','claimed','expired')),
  -- 'eligible' means "may join" — not yet in the queue — so neither of these is known yet.
  -- The domain type marks both optional (registrationJourney.ts:113-118) and the release
  -- path actively sets joined_at back to NULL.
  position          integer,
  offer_expires_at  timestamptz,
  joined_at         timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),  -- domain WaitlistEntry.updatedAt is required
  -- Postgres treats NULLs as distinct, so many 'eligible' rows coexist; only real
  -- queue positions are constrained.
  UNIQUE (quota_pool_id, position),
  UNIQUE (quota_pool_id, entry_id)
);
CREATE INDEX ON core.waitlist_entry (status, offer_expires_at)
  WHERE status = 'offered';                       -- the expiry sweeper's only index
```

`member_ages jsonb` preserves the arithmetic behind a category decision. When an athlete disputes their category in 2027, you can show them the exact ages used — not recompute it under today's roster and hope it matches.

### 4.5 Quota — scoped pools, and why one number per product is not enough

REG-09 asks for "quotas, reserved allocations, release waves, local/international quota
dimensions", and §2.2.4 asks for that control "at sport, discipline, event, category and
venue". The first draft modelled a quota as one row per `(product, category)`, and an entry
carried a single `quota_id`.

**That is structurally unable to express the requirement**, not merely missing a column.
An entry cannot simultaneously consume a sport-wide cap *and* a venue allocation *and* a
local-participant tranche, because it can point at exactly one of them. A release wave has
nowhere to live at all. The `CHECK` constraint was correct — and would have faithfully
enforced the wrong aggregate.

```sql
-- A pool is a capacity at a named scope, optionally nested inside a wider one.
CREATE TABLE core.quota_pool (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id       uuid NOT NULL REFERENCES core.event(id),
  name           text NOT NULL,
  scope_kind     text NOT NULL
                   CHECK (scope_kind IN ('event','sport','discipline','product','category','venue')),
  scope_ref      text,                            -- the code or id at that scope
  -- The tender's own words: reserved allocations, local/international dimensions.
  allocation     text NOT NULL DEFAULT 'general'
                   CHECK (allocation IN ('general','local','international','sponsor',
                                         'reserved','wildcard')),
  -- Shared caps nest: a venue pool sits inside a sport pool, and BOTH are consumed.
  parent_pool_id uuid REFERENCES core.quota_pool(id),
  -- Say what a unit IS. "Capacity 60" means nothing until this is fixed, and teams vs
  -- athletes is exactly where an oversell hides.
  unit           text NOT NULL DEFAULT 'entry'
                   CHECK (unit IN ('athlete','team','entry','seat')),
  capacity       integer NOT NULL CHECK (capacity >= 0),
  confirmed      integer NOT NULL DEFAULT 0 CHECK (confirmed >= 0),
  reserved       integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  -- Release waves: a tranche that opens, and optionally closes, on a schedule.
  release_from   timestamptz,
  release_until  timestamptz,
  eligibility    jsonb NOT NULL DEFAULT '{}',     -- who may draw on it (nationality, grade…)
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pool_not_exceeded CHECK (confirmed + reserved <= capacity),
  CONSTRAINT pool_window_ordered
    CHECK (release_until IS NULL OR release_from IS NULL OR release_until > release_from),
  CONSTRAINT pool_is_not_its_own_parent CHECK (parent_pool_id <> id),
  UNIQUE NULLS NOT DISTINCT (event_id, scope_kind, scope_ref, allocation, name)
);
CREATE INDEX quota_pool_scope ON core.quota_pool (event_id, scope_kind, scope_ref);
CREATE INDEX quota_pool_parent ON core.quota_pool (parent_pool_id) WHERE parent_pool_id IS NOT NULL;

-- One entry may consume SEVERAL pools. This is the relationship the first draft lacked.
CREATE TABLE core.entry_quota_consumption (
  entry_id      uuid NOT NULL REFERENCES core.registration_entry(id) ON DELETE CASCADE,
  quota_pool_id uuid NOT NULL REFERENCES core.quota_pool(id),
  units         integer NOT NULL DEFAULT 1 CHECK (units > 0),
  state         text NOT NULL DEFAULT 'reserved'
                  CHECK (state IN ('reserved','confirmed','released')),
  expires_at    timestamptz,                      -- an abandoned checkout must not hold a seat
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, quota_pool_id)
);
CREATE INDEX consumption_by_pool ON core.entry_quota_consumption (quota_pool_id, state);
-- The reaper's only index: reservations that were never completed.
CREATE INDEX consumption_expiry ON core.entry_quota_consumption (expires_at)
  WHERE state = 'reserved' AND expires_at IS NOT NULL;
```

**Claiming, with more than one pool.** The transaction is the §4.5 pattern applied to every
applicable pool at once — the entry's own pool and every ancestor:

```sql
BEGIN;
  -- Deterministic lock order. Locking pools in the order the application happened to
  -- resolve them is how two concurrent claimants deadlock on a shared parent cap.
  SELECT id FROM core.quota_pool
   WHERE id = ANY($1)
   ORDER BY id
     FOR UPDATE;

  UPDATE core.quota_pool
     SET reserved = reserved + 1, updated_at = now()
   WHERE id = ANY($1);                            -- pool_not_exceeded rejects any overflow

  INSERT INTO core.entry_quota_consumption (entry_id, quota_pool_id, expires_at)
  SELECT $2, unnest($1), now() + interval '20 minutes';
COMMIT;
```

If **any** pool in the set is full, the whole transaction rolls back and the entry consumes
none of them. Partial consumption — holding the sport cap but not the venue seat — is the
failure mode this ordering exists to prevent.

`registration_entry.quota_id` is **removed**: consumption is a set, not a column.

> **What has not changed:** the guarantee is still a `CHECK` constraint under a row lock,
> and the concurrency proof in §10 still holds — it now runs per pool. Widening *what* is
> counted did not weaken *how* it is counted.


### 4.6 Money

```sql
-- An order belongs to a PAYER, not to an entry. The entry link lives on the line (see below),
-- so one order can span a whole roster: PAY-03 split/corporate payment, TEA-02 team deposits.
CREATE TABLE core.registration_order (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id        uuid NOT NULL REFERENCES core.event(id),
  payer_person_id uuid NOT NULL REFERENCES core.person(id),
  kind            text NOT NULL DEFAULT 'individual'
                    CHECK (kind IN ('individual','team','corporate','comped')),
  on_behalf_of    uuid REFERENCES core.team_roster(id),  -- captain paying for a roster
  status          text NOT NULL DEFAULT 'draft',  -- draft|pending_payment|part_paid|paid|cancelled|refunded
  currency        char(3) NOT NULL DEFAULT 'EUR',
  -- Money is SUMMED FROM THE LINES, never asserted independently. The first draft's
  -- CHECK (total = subtotal - discount) was an identity that any VAT line violates —
  -- it made adding tax a constraint migration. PAY-01 and FatturaPA both require tax.
  net_minor       bigint NOT NULL DEFAULT 0,
  tax_minor       bigint NOT NULL DEFAULT 0,
  gross_minor     bigint NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gross_is_net_plus_tax CHECK (gross_minor = net_minor + tax_minor),
  CONSTRAINT roster_order_is_a_team_order
    CHECK (on_behalf_of IS NULL OR kind IN ('team','corporate'))
);
CREATE INDEX ON core.registration_order (event_id, status, created_at DESC);
CREATE INDEX ON core.registration_order (payer_person_id, created_at DESC);

CREATE TABLE core.order_line (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  order_id        uuid NOT NULL REFERENCES core.registration_order(id) ON DELETE CASCADE,
  -- The entry link moved here from the order. NULL for lines that are not per-entry
  -- (a whole-order discount, a shipping charge, a rounding adjustment).
  entry_id        uuid REFERENCES core.registration_entry(id),
  kind            text NOT NULL
                    CHECK (kind IN ('entry_fee','add_on','deposit','balance',
                                    'discount','adjustment')),
  description_key text,                           -- i18n key (PLT-02); falls back to description
  description     text NOT NULL,
  quantity        integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_net_minor  bigint NOT NULL,
  net_minor       bigint NOT NULL,
  tax_rate_bp     integer NOT NULL DEFAULT 0,     -- basis points: 2200 = 22% IVA
  tax_minor       bigint NOT NULL DEFAULT 0,
  tax_code        text,                           -- FatturaPA nature code (N1..N7) when exempt
  gross_minor     bigint NOT NULL,
  CONSTRAINT line_gross_is_net_plus_tax CHECK (gross_minor = net_minor + tax_minor),
  CONSTRAINT exempt_lines_need_a_nature_code
    CHECK (tax_rate_bp > 0 OR tax_code IS NOT NULL)
);
CREATE INDEX ON core.order_line (order_id);
CREATE INDEX ON core.order_line (entry_id) WHERE entry_id IS NOT NULL;

-- TEA-02 unpaid-member tracking is a query — but not the naive one. "Lines with no
-- settled payment" cannot answer a PARTIAL payment, which is the normal case on a roster:
--
--   SELECT * FROM core.roster_member_balance
--    WHERE roster_id = $1 AND settled_minor < due_minor;
--
-- Allocation is per ORDER LINE, not per member balance: one member may owe an entry fee,
-- an add-on and a deposit at once, and a single balance row mixes those and makes a
-- partial refund of one fee kind unanswerable. Tax lives on the line too, so a refund has
-- to reverse a particular rate.
--
-- payment_allocation / refund_allocation are the LEDGER; order_line.paid_minor and
-- refunded_minor are the CONSTRAINT SURFACE (line_not_over_refunded), because a
-- cross-table aggregate cannot be a CHECK. Refunds allocate to lines independently of
-- which capture funded them: two payments can cover one line, and a withdrawal reopens a
-- member's debt, not a PSP capture.
--
-- Rounding is per line. distribute_minor splits a total so the parts sum exactly, and a
-- tax summary is SUM(line tax), never tax(SUM(net)) — the two differ by cents, and cents
-- are how a settlement file stops reconciling.
--
-- Issued invoices are IMMUTABLE. A correction is a credit note copying identity from the
-- original and amounts from the refund allocations; refund_id stays nullable because a
-- nota di credito can correct a bill without money moving. tax_rule is provenance only —
-- re-rendering reads invoice_line, so a later rate or rounding change cannot retouch an
-- already-issued document. billing_profile is the legal party; payer_person_id is who
-- actually paid, and on a corporate order they are different people.
--
-- FatturaPA/SDI stays columns-only (xml_s3_key, xml_sha256, fatturapa_version) until OC
-- finance names the merchant-of-record, the issuer identity and a provider (risk R5).

-- PAY-01: promo codes, waivers and packages.
CREATE TABLE core.promotion (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id      uuid NOT NULL REFERENCES core.event(id),
  code          citext NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('percentage','fixed','waiver')),
  value_bp      integer,                          -- percentage in basis points
  value_minor   bigint,                           -- or a fixed amount
  applies_to    jsonb NOT NULL DEFAULT '{}',      -- {sport:..., product:..., grade:...}
  max_uses      integer,
  used_count    integer NOT NULL DEFAULT 0,
  effective     tstzrange NOT NULL,
  UNIQUE (event_id, code),
  CONSTRAINT promo_not_overused CHECK (max_uses IS NULL OR used_count <= max_uses),
  CONSTRAINT promo_has_exactly_one_value
    CHECK ((value_bp IS NULL) <> (value_minor IS NULL) OR kind = 'waiver')
);

CREATE TABLE core.order_promotion (
  order_id     uuid NOT NULL REFERENCES core.registration_order(id) ON DELETE CASCADE,
  promotion_id uuid NOT NULL REFERENCES core.promotion(id),
  applied_minor bigint NOT NULL,                  -- frozen: what it actually took off
  applied_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, promotion_id)            -- one promo cannot apply twice to an order
);

CREATE TABLE core.payment_intent (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  order_id      uuid NOT NULL REFERENCES core.registration_order(id),
  psp           text NOT NULL DEFAULT 'stripe',
  psp_intent_id text UNIQUE,                      -- no PAN, ever — SEC-07
  status        text NOT NULL DEFAULT 'pending',
  amount_minor  bigint NOT NULL,
  currency      char(3) NOT NULL DEFAULT 'EUR',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Every PSP webhook lands here first, verbatim. Append-only.
CREATE TABLE core.payment_event (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  intent_id      uuid REFERENCES core.payment_intent(id),
  psp_event_id   text UNIQUE NOT NULL,            -- PSP redelivery is a no-op
  type           text NOT NULL,
  payload        jsonb NOT NULL,
  received_at    timestamptz NOT NULL DEFAULT now(),
  processed_at   timestamptz
);
REVOKE UPDATE, DELETE ON core.payment_event FROM app_rw;

CREATE TABLE core.refund (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  intent_id     uuid NOT NULL REFERENCES core.payment_intent(id),
  amount_minor  bigint NOT NULL CHECK (amount_minor > 0),
  reason        text NOT NULL,
  requested_by  uuid NOT NULL REFERENCES core.person(id),
  approved_by   uuid REFERENCES core.person(id),  -- PAY-05 dual control
  psp_refund_id text UNIQUE,
  order_id      uuid NOT NULL REFERENCES core.registration_order(id),
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_needs_two_people CHECK (approved_by IS NULL OR approved_by <> requested_by)
);

CREATE TABLE core.invoice (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  order_id      uuid NOT NULL REFERENCES core.registration_order(id),
  -- A refund does not edit an invoice — Italian law requires a separate credit note
  -- (nota di credito) that references the document it corrects.
  type          text NOT NULL DEFAULT 'invoice'
                  CHECK (type IN ('invoice','credit_note')),
  corrects_id   uuid REFERENCES core.invoice(id),
  refund_id     uuid REFERENCES core.refund(id),
  series        text NOT NULL,                    -- numbering is gapless PER SERIES PER YEAR
  seq           integer NOT NULL,
  number        text NOT NULL,                    -- rendered 'INV-2027-000118'
  net_minor     bigint NOT NULL,
  tax_minor     bigint NOT NULL,
  gross_minor   bigint NOT NULL,
  sdi_status    text,                             -- FatturaPA/SDI lifecycle
  sdi_id        text,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  xml_s3_key    text,
  UNIQUE (series, seq),                           -- the gapless guarantee lives here
  UNIQUE (number),
  CONSTRAINT credit_note_corrects_something
    CHECK ((type = 'credit_note') = (corrects_id IS NOT NULL)),
  CONSTRAINT invoice_totals_agree CHECK (gross_minor = net_minor + tax_minor)
);
-- One live invoice per order; credit notes are additional documents, not replacements.
CREATE UNIQUE INDEX ON core.invoice (order_id) WHERE type = 'invoice';

-- Gapless numbering is a SEQUENCE PROBLEM, not a uniqueness problem: a Postgres sequence
-- leaks numbers on rollback, and Italian law does not permit gaps. Allocate under the
-- same row lock that issues the document.
CREATE TABLE core.invoice_series (
  series     text PRIMARY KEY,
  year       integer NOT NULL,
  next_seq   integer NOT NULL DEFAULT 1
);
```

`refund_needs_two_people` is dual control written as a constraint. `psp_event_id UNIQUE` means Stripe can redeliver a webhook — which it will — and the second delivery is a primary-key conflict rather than a second refund.

#### Idempotency

```sql
CREATE TABLE core.idempotency_key (
  -- SCOPED, not global. A bare `key PRIMARY KEY` lets one caller collide with another's
  -- key and be handed THAT caller's stored response body — for a registration or a
  -- payment that is a personal-data leak, not merely a correctness bug. `scope` is the
  -- authenticated person id (or a signed session id pre-auth), so two callers may
  -- legitimately choose the same client-generated key.
  scope           text NOT NULL,
  key             text NOT NULL,
  endpoint        text NOT NULL,
  request_hash    text NOT NULL,                  -- same key + different body must NOT replay
  state           text NOT NULL DEFAULT 'in_progress'
                    CHECK (state IN ('in_progress','completed')),
  response_status integer,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  PRIMARY KEY (scope, key),
  CONSTRAINT completed_has_a_response
    CHECK ((state = 'completed') = (response_status IS NOT NULL))
);
CREATE INDEX ON core.idempotency_key (created_at);      -- the 24h reaper
CREATE INDEX ON core.idempotency_key (created_at)
  WHERE state = 'in_progress';                          -- stuck-key reconciliation
```

Every mutation inserts its key **first**. A retry hits the primary key, reads the stored response, and replays it — same request twice, same answer, one effect.

**But "in the same transaction as the work" is only correct when the work is confined to Postgres.** A mutation that charges a card commits outside the database, and no rollback undoes it. So there are two modes, and using the wrong one is the bug that double-charges:

| Mode | When | Behaviour |
|---|---|---|
| **local** | the whole mutation is DB work | key row and work share one transaction; a crash rolls back both and the retry is clean |
| **external** | the mutation calls the PSP | the key is **committed as `in_progress` before** the call, so a crash leaves evidence that an attempt may have happened; recovery is reconciliation against the PSP using the same key, never a blind retry |

Two properties the first draft left implicit. **A duplicate arriving mid-flight is answered `409` with `Retry-After`, never blocked** — waiting would hold a connection for the length of someone else's PSP call, and 2,000 concurrent claimants would exhaust the pool. And **`request_hash` is verified before replaying**: the same key with a different body is a client bug, and returning the stored response would hand back an answer to a request that was never made.

The domain model already carries `idempotencyKey` on its mutation requests — this is the storage side of a contract that exists.

### 4.7 Evidence — and the restricted boundary

```sql
CREATE TABLE core.evidence_document (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  entry_id      uuid NOT NULL REFERENCES core.registration_entry(id),
  kind          text NOT NULL,                    -- identity|proficiency|federation|...
  status        text NOT NULL DEFAULT 'required', -- required|uploaded|under_review|approved|rejected
  s3_key        text,
  mime_type     text,
  size_bytes    bigint,
  checksum      text,
  scan_status   text NOT NULL DEFAULT 'pending',  -- pending|clean|infected — REG-10
  uploaded_at   timestamptz,
  reviewed_by   uuid REFERENCES core.person(id),
  reviewed_at   timestamptz,
  rejection_reason text
);
CREATE INDEX ON core.evidence_document (entry_id);
CREATE INDEX ON core.evidence_document (status) WHERE status = 'under_review';
```

**A document is downloadable only when `scan_status = 'clean'`.** Upload writes `pending`, a worker scans, and the presign endpoint refuses anything else — so an unscanned file is unreachable by construction rather than by remembering to check.

```sql
CREATE SCHEMA restricted;

CREATE TABLE restricted.evidence_document (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  entry_id      uuid NOT NULL,                    -- deliberately no FK: no join path from core
  person_id     uuid NOT NULL,
  kind          text NOT NULL,                    -- medical_certificate|para_classification
  status        text NOT NULL DEFAULT 'required',
  s3_key        text,                             -- separate bucket, separate KMS key
  scan_status   text NOT NULL DEFAULT 'pending',
  expires_on    date,                             -- para classifications expire
  lawful_basis  text NOT NULL DEFAULT 'explicit_consent',
  retain_until  date NOT NULL,                    -- Art. 9 data gets its own, shorter retention
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Passport / national ID. Same boundary rules as the medical evidence beside it: own
-- schema, own role, own bucket, and no foreign key back to `core`.
CREATE TABLE restricted.identity_document (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id    uuid NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('passport','national_id','residence_permit')),
  number       text NOT NULL,
  issuing_country char(2),
  expires_on   date,
  lawful_basis text NOT NULL,                     -- DPO-approved value; no default on purpose
  retain_until date NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE restricted.access_log (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  document_id uuid NOT NULL REFERENCES restricted.evidence_document(id),
  actor_id    uuid NOT NULL,
  action      text NOT NULL,                      -- view|download|decide
  occurred_at timestamptz NOT NULL DEFAULT now(),
  ip          inet
);
REVOKE UPDATE, DELETE ON restricted.access_log FROM app_rw, restricted_rw;

REVOKE ALL ON SCHEMA restricted FROM app_rw;      -- the ordinary app role cannot see it at all
GRANT USAGE ON SCHEMA restricted TO restricted_rw;
```

Three separations, all enforced by infrastructure rather than discipline: a **different database role**, a **different S3 bucket and KMS key**, and **no foreign key** from `core` — so no accidental join, and no `SELECT *` on an entry can ever drag medical data into a general response. The "clean export" that PRV-04 requires becomes the *default* behaviour, because the export role is physically unable to read the restricted schema.

### 4.7.1 Language, and accommodation needs — PLT-02 and ACS-05

#### Adding a language must not be a code change

PLT-02 is a **launch** Must: English and Italian journeys, content, validation, emails and receipts —
plus translation management and further languages *without code changes*. The first draft made that
impossible without noticing: every human-readable string was a single-valued column (`sport.name`,
product `name`, band names inside `bands`, broadcast `subject`/`body`) and `person` had no locale at
all. The participant app's `Locale = 'en' | 'it'` union is the same defect one layer up.

```sql
CREATE TABLE core.locale (
  code       text PRIMARY KEY,                    -- 'en', 'it', later 'de', 'fr'
  name       text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  active     boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX ON core.locale (is_default) WHERE is_default;  -- exactly one default

-- One row per translatable string. Adding German is INSERTs, not a deployment.
CREATE TABLE core.translation (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id    uuid REFERENCES core.event(id),     -- NULL = applies to every edition
  entity_type text NOT NULL,                      -- sport|sport_entry_product|band|
                                                  -- broadcast|rule_message|order_line
  entity_id   uuid,                               -- NULL when the key is a static message_key
  field       text NOT NULL,                      -- 'name' | 'description' | message key
  locale      text NOT NULL REFERENCES core.locale(code),
  value       text NOT NULL,
  updated_by  uuid REFERENCES core.person(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (entity_type, entity_id, field, locale)
);
CREATE INDEX ON core.translation (locale, entity_type);
```

The base column on each table stays as the **fallback**, so a missing translation degrades to the
default language instead of rendering blank. `core.person` gains `locale`, which is what lets
`rule_notification`, receipts and broadcasts go out in the language the recipient actually reads —
and `rule_notification.locale` records which one was used, so a dispute can be answered with what the
athlete was actually shown.

This also completes `rule_eligibility.message_key` (§4.3.1): the key resolves here, so a refusal reason
is never hardcoded English.

#### Accommodation needs are not sport classification — ACS-05

ACS-05 requires accessibility and accommodation needs captured **separately from sport
classification**, with consent and restricted access. The first draft's only related store was
`restricted.evidence_document` with `kind = 'para_classification'` — which is *precisely* the
conflation ACS-05 forbids. A wheelchair user needing step-free access at the venue and an athlete with
a competitive para class are different facts about different things; merging them is both a privacy
failure and a category error.

```sql
CREATE TABLE restricted.accommodation_need (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id     uuid NOT NULL,
  person_id    uuid NOT NULL,
  category     text NOT NULL
                 CHECK (category IN ('mobility','sensory','cognitive',
                                     'dietary','medical','companion','other')),
  detail       text,
  companion_person_id uuid,                       -- a carer or guide who also needs access
  consent_id   uuid NOT NULL,                     -- explicit consent to hold it at all
  lawful_basis text NOT NULL DEFAULT 'explicit_consent',
  valid_until  date,
  retain_until date NOT NULL,                     -- its OWN retention, shorter than the event record
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

**Deliberately not an `entrant_attribute`.** Putting it there would expose it to `rule_dimension` as a
categorisation input — which is exactly how an accommodation need turns into an eligibility decision,
the thing ACS-05 exists to prevent. It cannot be referenced by a rule because it is not reachable
from `core` at all.

`lawful_basis` and `retain_until` are added to `restricted.evidence_document` too. The audit was right
that the restricted schema recorded neither: "we hold Article 9 data" is only defensible with a
recorded basis for holding it and a date by which it must be gone.

### 4.7.2 Evidence is three objects, and policy is versioned (F07, F11)

The first draft made `core.evidence_document` one row per upload with a status. That cannot
keep **rejected v1 and accepted v2 as the same obligation** — EVD-02 requires exactly that,
plus per-type required/optional logic, sport applicability, issuing country, expiry and
resubmission. So the model separates what one row was conflating:

| Object | What it is |
|---|---|
| **Requirement** (`evidence_requirement_set` + frozen `…_version`) | The versioned *policy*: applicability, accepted formats, "valid through Games day", translation-by-issuing-country |
| **Obligation** (`core.evidence_obligation`, `restricted.evidence_document`) | The logical document, owned by the **person** so it can be collected before an entry exists, and applied to entries separately. One row per person per requirement — a resubmission does not create a second |
| **Upload** + **review** | The upload is immutable except `scan_status`; reviews are append-only |

`version_no` is the **issued document's** version; `s3_object_version` is the bucket
artefact. They are different facts and deliberately different columns — the audit's point
was that an object-storage version is not a document version.

Waivers are an **approved link to a requirement version**, not a status, so a waived
obligation still exists and outstanding/expired reporting can exclude it without deleting
anything. Restricted evidence uses the identical upload/review/waiver/expiry contract behind
its existing schema, role and bucket boundary — one lifecycle, not a weaker second one.

`core.evidence_document` survives as a **view** over the current upload, so the journey query
does not grow a second model.

#### Registration policy — and where it meets `statusLifecycle.ts`

REG-08 wants sport-specific roster cardinalities, entry limits, incompatible-event rules and
deadlines; REG-11 wants a configurable status lifecycle. `uq_entry_live` enforces one live
entry per product and keeps that job, but it cannot express "at most three events" or "a crew
of exactly four plus a cox".

Policies are versioned, scoped to product/phase, and **frozen on publish**; an evaluation
pins the `policy_version_id` it was judged under, exactly as an entry pins its
`rule_version_id`. Editing a published version is refused, and publishing v2 does not rewrite
what v1 decided.

**The division with the code table matters, because getting it wrong creates a second
register — the defect that started this whole audit.**

| Layer | Job |
|---|---|
| `statusLifecycle.ts` (`@wms/domain`) | The **vocabulary**: ten named states, the progress spine, and the default edge list |
| `registration_policy_transition` | Per product/phase: which of those edges are legal, which actor, which **named** guard |
| Application | A move must satisfy both. Config may **narrow**, never invent a state — a `CHECK` pins the ten names, so no administrator adds `pending_magic`. Guards stay in code; configuration only selects them |

An empty transition set on a published policy means "use the default map", not "no moves
allowed". Copying `TRANSITIONS` into SQL was considered and rejected: it would be a second
source of truth for the same rule.

**Cross-row limits cannot be `CHECK`s.** Roster maximum is refused by a trigger on insert;
roster *minimum* is an evaluation, because refusing the first rower of a crew of four would
be absurd. Entry caps, incompatible products and deadlines are the same shape — and a
deadline is checked at the moment of change, so an entry created before close stays valid
after it.

### 4.8 Accreditation

```sql
CREATE TABLE core.accreditation (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id           uuid NOT NULL REFERENCES core.event(id),
  person_id          uuid NOT NULL REFERENCES core.person(id),
  -- NULLABLE until issue: a pending accreditation has no badge number yet, and the
  -- desk queue is full of them.
  badge_number       text UNIQUE,                 -- COMO27-000118
  role               text NOT NULL,               -- athlete|official|staff|media|volunteer
                                                  -- (the shipped DTO calls this accessLevel)
  registration_entry_id uuid REFERENCES core.registration_entry(id),  -- officials have none
  zones              text[] NOT NULL DEFAULT '{}',
  sport_name         text,                        -- shipped: the pass prints it
  eligibility_status text,                        -- shipped: the pass gates on it
  photo_s3_key       text,
  photo_status       text NOT NULL DEFAULT 'missing',
  status             text NOT NULL DEFAULT 'pending',
  -- The access WINDOW the pass prints. `issued_at` is when the badge was made and is not
  -- the same fact; the shipped pass shows both.
  valid_from         date NOT NULL,
  valid_until        date NOT NULL,
  qr_value           text,                        -- the QR payload the shipped pass renders
  qr_secret          text,                        -- HMAC seed for OFFLINE verification (ACC-06)
                                                  -- — a later feature, not a substitute for qr_value
  issued_at          timestamptz,
  CONSTRAINT accreditation_window_ordered CHECK (valid_until >= valid_from),
  issued_by          uuid REFERENCES core.person(id),
  revoked_at         timestamptz,
  revoked_reason     text
);
CREATE INDEX ON core.accreditation (event_id, status);
CREATE INDEX ON core.accreditation (person_id);

-- ACC-03: the issue gate as configuration, not a hardcoded if.
CREATE TABLE core.accreditation_gate (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id      uuid NOT NULL REFERENCES core.event(id),
  role          text NOT NULL,
  requires      text[] NOT NULL,                  -- {photo,eligibility,payment,evidence,training}
  UNIQUE (event_id, role)
);
```

`accreditation_gate` is audit finding #2 solved in schema. The current gate is `if (hasPhoto && eligibilityPassed)`; here it is a row the OC edits per role.

`qr_secret` supports genuine offline verification (ACC-06): the badge QR carries an HMAC the scanner validates locally, so a venue gate keeps working when the network does not — unlike today's "Offline lookup", which is an online filter.

### 4.9 Communications

Audience membership is data: a new segment is a row, not a deploy. `audienceIncludesParticipant()`
in `@wms/domain` still decides who a send reaches — this table stores the filter, it does not
reimplement the rule in SQL.

```sql
CREATE TABLE core.comms_audience (
  id        uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id  uuid NOT NULL REFERENCES core.event(id),
  code      text NOT NULL,                    -- 'tennis', 'pending-payment', …
  name_key  text NOT NULL,                    -- i18n (PLT-02)
  filter    jsonb NOT NULL DEFAULT '{}',      -- {all}|{sport}|{entryStatus}|{evidenceIncomplete}
  UNIQUE (event_id, code)
);
```

```sql
CREATE TABLE core.broadcast (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id     uuid NOT NULL REFERENCES core.event(id),
  audience     jsonb NOT NULL,                    -- {sport:'Rowing', status:'confirmed'}
  channel      text NOT NULL,                     -- inapp|email|sms
  subject      text NOT NULL,
  body         text NOT NULL,
  locale       text NOT NULL DEFAULT 'en',
  sent_by      uuid NOT NULL REFERENCES core.person(id),
  sent_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.delivery (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  broadcast_id uuid NOT NULL REFERENCES core.broadcast(id),
  person_id    uuid NOT NULL REFERENCES core.person(id),
  status       text NOT NULL DEFAULT 'queued',    -- queued|sent|delivered|bounced|read
  provider_id  text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broadcast_id, person_id)
);
CREATE INDEX ON core.delivery (person_id, updated_at DESC);
```

The inbox query is `WHERE person_id = $1 ORDER BY updated_at DESC` — one index, no audience re-evaluation at read time. Audience membership is resolved **once**, at send, by `audienceIncludesParticipant()` from the domain package. Today's implementation filters the shared log on every read, which is correct but O(everything).

### 4.10 Operations

```sql
CREATE TABLE ops.exception_case (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id         uuid NOT NULL REFERENCES core.event(id),
  entry_id         uuid REFERENCES core.registration_entry(id),
  rule_version_id  uuid REFERENCES core.rule_version(id),  -- the version in dispute; entry_id is the entry
  kind             text NOT NULL,
  impact           text NOT NULL,                    -- low|medium|high
  summary          text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',  -- pending|approved|rejected
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz
);

CREATE TABLE ops.exception_signature (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  case_id      uuid NOT NULL REFERENCES ops.exception_case(id),
  signer_id    uuid NOT NULL REFERENCES core.person(id),
  decision     text NOT NULL,                      -- approve|reject
  note         text,                               -- reviewer's own words
  message_key  text,                               -- i18n refusal code (PLT-02); required on reject
  signed_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, signer_id)                      -- RUL-06: dual control. Named exception_one_signature_per_person
);

CREATE TABLE audit.activity_log (
  id           uuid NOT NULL DEFAULT uuidv7(),
  event_id     uuid,
  actor_id     uuid,
  actor_role   text,
  action       text NOT NULL,
  subject_type text NOT NULL,
  subject_id   uuid,
  before       jsonb,
  after        jsonb,
  ip           inet,
  occurred_at  timestamptz NOT NULL DEFAULT now()
,
  -- A partitioned table's PK MUST contain the partition key. `id` alone is rejected.
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);               -- monthly; SEC-05 wants 12 months retained

-- A partitioned parent holds no rows: without partitions the first INSERT fails outright.
-- Create the current month at migration time; pg_partman (or a monthly job) rolls the rest
-- and drops beyond the 12-month retention window.
CREATE TABLE audit.activity_log_2026_09 PARTITION OF audit.activity_log
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE audit.activity_log_default PARTITION OF audit.activity_log DEFAULT;

-- REVOKE on the parent does not cascade to partitions — each one must be revoked as it is created.
REVOKE UPDATE, DELETE ON audit.activity_log, audit.activity_log_2026_09,
                          audit.activity_log_default FROM app_rw;
```

`UNIQUE (case_id, signer_id)` is the fix for the audit's sharpest line — *dual control without identity is theatre*. One reviewer signing twice is now a unique-violation, and `requiredSignatures()` from the domain package counts rows that are guaranteed distinct people.

### 4.11 Tables the first draft missed

An adversarial audit of this plan (§10) found five domain areas with no schema at all. Four of them
back features the running product already demonstrates or that Phase B names as deliverables.

#### Fees — price is not a single number on the product

The first draft put `base_fee_minor` on `core.sport_entry_product`. That cannot express what the
product already does: Tennis Competitive €90 / Recreational €75. The domain's `Fee` type
(`registrationJourney.ts`) is keyed by product **and category and grade**, and is time-bounded.

```sql
CREATE TABLE core.fee (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id               uuid NOT NULL REFERENCES core.event(id),
  sport_entry_product_id uuid NOT NULL REFERENCES core.sport_entry_product(id),
  category_id            text,                      -- NULL = applies to every category
  grade                  text NOT NULL,             -- competitive | recreational
  currency               char(3) NOT NULL DEFAULT 'EUR',
  base_amount_minor      bigint NOT NULL CHECK (base_amount_minor >= 0),
  service_amount_minor   bigint NOT NULL DEFAULT 0 CHECK (service_amount_minor >= 0),
  effective              tstzrange NOT NULL,        -- price phases: early bird, standard, late
  EXCLUDE USING gist (sport_entry_product_id WITH =, grade WITH =, effective WITH &&)
    WHERE (category_id IS NULL)
);
CREATE INDEX ON core.fee (sport_entry_product_id, grade, lower(effective) DESC);
```

`base_fee_minor` is **removed** from `core.sport_entry_product`; price is resolved from this table at
the moment of order creation and then frozen onto `core.order_line`, so a later price change never
alters an existing order. The `EXCLUDE` prevents two overlapping prices for the same product+grade.

#### Pre-registration — REG-13, and Track D depends entirely on it

The ~15,000 EOI records have no home in the first draft, which makes Phase B's Track D unimplementable.

```sql
CREATE TABLE core.pre_registration (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id          uuid NOT NULL REFERENCES core.event(id),
  reference         text NOT NULL,                  -- 'COMO27-EOI-0001'
  first_name        text NOT NULL,
  last_name         text NOT NULL,
  email             citext NOT NULL,
  date_of_birth     date NOT NULL,
  nationality       char(2),
  intended_sports   text[] NOT NULL DEFAULT '{}',
  source_list       text NOT NULL,                  -- provenance, for dedup + audit
  status            text NOT NULL DEFAULT 'unclaimed'
                      CHECK (status IN ('unclaimed','claimed')),
  claimed_by        uuid REFERENCES core.person(id),
  claimed_at        timestamptz,
  migrated_at       timestamptz NOT NULL DEFAULT now(),
  migration_batch   uuid NOT NULL,                  -- what rollback rolls back
  UNIQUE (event_id, reference),
  CONSTRAINT claim_is_consistent
    CHECK ((status = 'claimed') = (claimed_by IS NOT NULL))
);
CREATE INDEX ON core.pre_registration (event_id, lower(email));
CREATE INDEX ON core.pre_registration (migration_batch);
CREATE UNIQUE INDEX ON core.pre_registration (claimed_by) WHERE claimed_by IS NOT NULL;

-- Dedup candidates, reviewed by a human. REG-13 forbids silent auto-merge.
CREATE TABLE core.pre_registration_match (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  left_id     uuid NOT NULL REFERENCES core.pre_registration(id),
  right_id    uuid NOT NULL REFERENCES core.pre_registration(id),
  score       numeric(4,3) NOT NULL,
  reason      text NOT NULL,
  decision    text NOT NULL DEFAULT 'pending'
                CHECK (decision IN ('pending','merged','distinct')),
  decided_by  uuid REFERENCES core.person(id),
  decided_at  timestamptz,
  CHECK (left_id < right_id),                       -- one row per pair, not two
  UNIQUE (left_id, right_id)
);
```

`migration_batch` is what makes Track D's mandatory rollback a single statement rather than an
archaeology exercise. The unique index on `claimed_by` stops one person claiming two EOI records.

#### Assisted / proxy registration — PLT-06

The consent gate is already enforced by the running API (`422 CONSENT_REQUIRED`) but had no storage.

```sql
CREATE TABLE core.proxy_consent (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id          uuid NOT NULL REFERENCES core.event(id),
  reference         text NOT NULL,
  participant_id    uuid NOT NULL REFERENCES core.person(id),
  method            text NOT NULL CHECK (method IN ('phone','in_person','email')),
  captured_by       uuid NOT NULL REFERENCES core.person(id),
  captured_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  UNIQUE (event_id, reference)
);
CREATE INDEX ON core.proxy_consent (participant_id) WHERE revoked_at IS NULL;

CREATE TABLE core.assisted_session (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id       uuid NOT NULL REFERENCES core.event(id),
  participant_id uuid NOT NULL REFERENCES core.person(id),
  operator_id    uuid NOT NULL REFERENCES core.person(id),
  consent_id     uuid REFERENCES core.proxy_consent(id),
  status         text NOT NULL DEFAULT 'not_started'
                   CHECK (status IN ('not_started','draft','submitted')),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- PLT-06: an operator may not act on someone's behalf without a recorded consent.
  CONSTRAINT proxy_needs_consent
    CHECK (status = 'not_started' OR consent_id IS NOT NULL)
);
```

Proxy actions themselves are recorded in `audit.activity_log` with `actor_role = 'operator'` — they
do not need a fourth audit table.

#### Partner invitations — the partner-finder screen is built and has no storage

```sql
CREATE TABLE core.partner_request (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id      uuid NOT NULL REFERENCES core.event(id),
  category_id   text NOT NULL,
  from_id       uuid NOT NULL REFERENCES core.athlete_profile(id),
  to_id         uuid NOT NULL REFERENCES core.athlete_profile(id),
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,
  CHECK (from_id <> to_id)
);
-- One live invitation per pair per category; declined/cancelled ones may be retried.
CREATE UNIQUE INDEX ON core.partner_request (event_id, category_id, from_id, to_id)
  WHERE status IN ('pending','accepted');
CREATE INDEX ON core.partner_request (to_id, status);
```

#### Deliberately still absent

`gameshub` and `match` (draws, schedules, start lists, results) have no schema **by design** — the
RFP places competition management in **Phase C (Jan–Jun 2027)**, not Phase B. `accreditationDesk`
and `exceptions` are covered by §4.8 and §4.10 under different table names. This is recorded so the
gap reads as a decision rather than an oversight.

---

## 5. API design

**Base:** `/v1`. OpenAPI generated from `@wms/domain` types, so the contract cannot drift from the engine.

### Pagination — keyset, not offset

The existing `PaginatedResponse<T>` is `{ items, total, cursor? }`. Two changes:

```
GET /v1/registration-entries?event=como-lake-2027&status=confirmed&limit=50&cursor=<opaque>
```

**`OFFSET` is banned on any growable list.** `OFFSET 10000` makes Postgres walk and discard 10,000 rows; page 200 of an admin queue gets slower than page 1 for no reason. Keyset paging on `(created_at, id)` is constant-time at any depth — and UUIDv7 keys sort chronologically, so `id` alone is a valid cursor.

**`total` becomes opt-in.** `COUNT(*)` over a filtered 50k table on every keystroke of an admin filter is the most common way an otherwise-fine API feels slow. Hot lists omit it; screens that genuinely need a figure request `?withTotal=true` and get an estimate from `pg_class.reltuples` when the filter is broad.

### Mutations

Every mutation takes `Idempotency-Key`. Missing key on a payment or status change is a `400` — not optional, because a retry without one is a double charge.

### Errors — RFC 9457 problem+json

The mapping already established in `wms_api` carries over: `*_NOT_FOUND` → **404**; domain-rule violation (`INVALID_TRANSITION`, `CONSENT_REQUIRED`, `ACTOR_NOT_PERMITTED`) → **422**; conflict or duplicate (quota full, idempotency mismatch) → **409**; validation → **400**.

### Caching

`ETag` + `If-None-Match` on catalogue reads — sports, products, rule versions. These change a handful of times per event and are read on every page load; a `304` is the cheapest possible response.

### The one endpoint that must be fast

`GET /v1/registration-journeys/:entryId` backs the participant's main screen. Today it is several repository calls. As one query with joins, against the indexes above, it is a single round trip.

---

## 6. Performance budget

Targets, to be measured under load rather than asserted:

| Path | p95 | Why it holds |
|---|---|---|
| Catalogue read (sports, products, rules) | **< 50 ms** | Small, cached, ETagged |
| Journey read | **< 150 ms** | One query, indexed joins |
| Admin queue page (50 rows) | **< 200 ms** | Keyset, no `COUNT(*)` |
| Entry save | **< 300 ms** | Single transaction |
| Quota claim under contention | **< 800 ms** | Row lock queue at 2,000 concurrent |
| Payment capture | **< 1,500 ms** | Dominated by the PSP, not us |

**Capacity approach:** one primary + one read replica, PgBouncer in front, two app instances behind a load balancer. Reporting and exports go to the replica so a finance export cannot slow registration. Expect this to be comfortably over-provisioned — which is the point. Measure in week 5 on the real deployment (`PHASE_B_PLAN.md` R6); do not wait for week 12 to discover the ceiling.

**The N+1 rule:** every list endpoint has a test asserting a *fixed* query count regardless of page size. This is the failure that appears only under real data, and it is trivially preventable.

---

## 7. What "future-proof" actually means here

Not "we might need microservices later." These four:

1. **Multi-edition from day one.** `event_id` everywhere. Kansai 2027, Lahti 2028 and Perth 2029 are already scheduled — the schema either serves them or this is single-use software.
2. **Rules are versioned data, never code.** A new sport is rows. A changed band is a new `rule_version`. No deployment is required to run a different sport, and no past entry is disturbed.
3. **Immutable history.** `entry_status_event`, `payment_event`, `category_audit`, `activity_log`, `restricted.access_log` are append-only by grant. Any past state can be reconstructed and defended.
4. **The domain package stays the authority.** Postgres holds and constrains; `@wms/domain` decides. Constraints and the engine agree because both derive from the same types. A second frontend, a mobile app, a partner integration — all get the same rules for free.

---

## 8. Migration path from `wms_api`

The seam already exists, which is why this is weeks and not months.

1. **Schema + migrations.** Translation of §4, reviewed against the domain models.
2. **Seed from fixtures.** Existing JSON fixtures load through the new schema, so behaviour is comparable before and after.
3. **Repository by repository.** `Mock*Repository` → `Postgres*Repository` behind the **unchanged** interfaces. Ship one at a time; the API contract does not move, so the UIs do not change.
4. **The two register copies die** the moment rules move to `core.rule_version` — F2 closes as a side effect.
5. **`wms_api` is deleted**, not migrated. It was a proof that both portals can share one backend. That proof succeeded and its job is done.

**Order matters:** rules and registration first (they carry the correctness risk), then money, then the rest. Each step keeps the whole test suite green.

---

## 9. How we know it worked

Every claim below is a test, not a review comment:

- **Overselling is impossible.** 500 concurrent claims against a 60-place quota → exactly 60 confirmed, 440 rejected with `409`, zero constraint violations logged as errors.
- **Retries are free.** The same `Idempotency-Key` replayed 100× → one charge, one entry, identical responses.
- **History is complete.** Every status change has a row naming actor and reason; kill the service mid-journey and restart — nothing is lost (closes **F1**).
- **The past is fixed.** Publish rule v3 → entries created under v2 keep v2's category (closes **F3**).
- **Restricted data is unreachable.** The ordinary app role gets a permission error on `restricted.*`; every access by the privileged role appears in `restricted.access_log`.
- **Dual control is real.** One reviewer signing twice → unique violation, case stays pending (closes **F4** and RUL-06).
- **Lists stay flat.** Page 1 and page 200 of a 50,000-row admin queue return within 10% of each other.

---

*Derived from the 23 models in `wms_domain/domain/models/` and the 32 routes in `wms_api/src/http/routes.ts`, both read on 7 September 2026. Parent plan: `PHASE_B_PLAN.md`. Recorded as REV-046.*

---

## 10. Corrections applied after adversarial audit

This plan's first draft was audited on 8 September 2026 by seven independent reviewers working from
the code, then re-checked by hand. **The DDL as first written would not have executed.** Everything
below is fixed above; it is recorded because the same mistakes are easy to reintroduce.

| # | Defect | Consequence | Fix |
|---|---|---|---|
| 1 | `core`, `ops`, `audit` schemas never created | The **first** `CREATE TABLE` aborts | §4.0.2 |
| 2 | `core.order` — `ORDER` is a reserved keyword | Syntax error at 6 sites | Renamed `core.registration_order` |
| 3 | `audit.activity_log` PK omitted the partition key, and no partitions existed | Table cannot be created; first INSERT would fail | PK `(id, occurred_at)` + partitions |
| 4 | Roles `app_rw` / `restricted_rw` never created | 9 REVOKE/GRANT statements fail | §4.0.3 |
| 5 | Tables referenced before creation (6 cases) | FK errors | §4.0.4 migration order |
| 6 | `REVOKE UPDATE ON rule_version` contradicted "publishing closes the previous range" | Publishing a rule would be **impossible** | Immutability trigger, not a blanket revoke |
| 7 | `EXCLUDE` would reject the intermediate overlap during publication | Every publication rejected | Close-then-insert order pinned |
| 8 | `UNIQUE` on nullable columns (`rule_set`, `entry_quota`) | Silently permits duplicates | `NULLS NOT DISTINCT` |
| 9 | `waitlist_entry.position NOT NULL`, no `updated_at`, no status CHECK | `'eligible'` rows cannot be stored; seed data fails | Nullable + CHECK + `updated_at` |
| 10 | No `fee` table — one price per product | Cannot express Tennis €90/€75, which already ships | §4.11 |
| 11 | No pre-registration schema | **Track D (REG-13) unimplementable** | §4.11 |
| 12 | No proxy-consent or partner-request schema | PLT-06 and the partner finder unbacked | §4.11 |

### Second pass — RFP coverage (findings A–E)

The first pass fixed defects that stopped the DDL running. These are different: the DDL would have
executed fine and then **failed to deliver requirements the tender makes mandatory**. All five are
fixed above.

| # | Finding | Tender exposure | Fix |
|---|---|---|---|
| A | `rule_version` modelled **age only** — six of the ten §3.2 Masters patterns had no columns anywhere (judo, golf handicap, para class, proficiency, exclusions, combination) | **§9.1 gate 3** | §4.3.1 — age becomes one *dimension*; `rule_dimension` + `rule_eligibility` + `entrant_attribute` + `category_combination` |
| B | `registration_order.entry_id NOT NULL` forced one order per entry | **PAY-03**, **TEA-02** structurally impossible | Order belongs to a **payer**; the entry link moved to `order_line` |
| C | No table for impact analysis or notification | **RUL-03**, **RUL-05** | `rule_impact_analysis` + `rule_impact_entry` + `rule_notification`, and a version cannot go `active` without an analysis |
| D | No VAT, promo, or credit notes — and `CHECK (total = subtotal − discount)` **blocked adding tax** | **PAY-01**, FatturaPA/SDI | Tax on lines, `gross = net + tax`, `promotion`, credit notes with gapless per-series numbering |
| I | Only `GRANT USAGE ON SCHEMA` — no table privileges anywhere | `app_rw` could not read or write a single row | `ALTER DEFAULT PRIVILEGES` in §4.0.3, so future tables are granted automatically |
| G | `CREATE ROLE` inside a migration — roles are **cluster**-scoped, so the second database (every CI run) fails with "role already exists" | CI could never create a test database | Idempotent `DO $$ … EXCEPTION WHEN duplicate_object`; production provisions roles in infrastructure |
| H | Docker volume mounted at `/var/lib/postgresql/data` | PG18 container exits 1; data never persists | Mount `/var/lib/postgresql` |
| F | `idempotency_key` was globally namespaced (`key PRIMARY KEY`) — one caller could be handed another's stored response body | personal-data leak on retry | `PRIMARY KEY (scope, key)`, plus `state` and a `request_hash` check before replay |
| E | Every name a single text column, no locale on `person`; accommodation needs lumped with para classification | **PLT-02** (launch Must), **ACS-05** | `locale` + `translation` tables, `person.locale`; `restricted.accommodation_need` kept unreachable from `core` |

### Third pass — external RFP audit (findings F01–F03)

An independent audit read both tender PDFs against this plan and returned **13 findings**:
three blockers, six high, three medium. The three blockers are fixed above; the rest are
open and listed below. Its verdict on the earlier work was that A–E genuinely landed — all
five were refuted as written against the current file — with residuals rolled into F01/F02.

| # | Finding | Why it mattered | Fix |
|---|---|---|---|
| F01 | `rule_set` scoped on four axes; RUL-01 names **nine** (gender, team type, grade, venue, phase missing). `entrant_attribute` allowed one value per person per event, with no issuer, no sport scope and no declared-vs-verified distinction. `rounding` would have corrupted decimal facts | A venue- or grade-specific rule was inexpressible; one athlete's licences from two federations collapsed into one row; integer rounding applied to a −2.4 handicap | Nine scope columns + explicit `precedence`; scoped, versioned, verified facts; `attribute_type` dictionary; `rounding` legal only at `value_scale = 0` |
| F02 | **A published rule's content stayed mutable.** §4.3.1 moved bands and predicates into child tables and left the immutability trigger on the near-empty header, while default privileges granted `UPDATE`/`DELETE` on the children. The activation `CHECK` proved only that *an* analysis existed | An entry pinned to an "immutable" `rule_version_id` whose meaning could be rewritten underneath it — the exact guarantee §4.4 claims. Version 5 could activate on version 2's analysis | Children frozen the moment the parent leaves `draft`; analysis bound by **composite FK** on `(analysis, version, content_hash)`, so a stale or foreign analysis cannot activate |
| F03 | One quota per `(product, category)`, one `quota_id` per entry. REG-09 requires reserved allocations, release waves and local/international dimensions; §2.2.4 requires venue-level control | An entry could not consume a sport cap **and** a venue allocation. The `CHECK` was correct and would have faithfully enforced the wrong aggregate | `quota_pool` (scoped, nestable, with allocation kind, unit and release window) + `entry_quota_consumption`; claim locks every applicable pool in id order |

**Still open — six high, three medium.** Recorded here so they read as scheduled, not
forgotten: **F04** payment/refund allocation to individual members' balances · **F05**
fiscal snapshots and refund tax attribution · **F06** roster selection as a versioned team
entry · **F07** configurable evidence requirements and document versions · **F08** consent
and retention linkage for sensitive identity data · **F09** approved reusable comms
templates · **F11** configurable registration policies · **F12** credential validity dates
the participant pass already displays · **F13** profile contact fields the shipped screen
already saves. F12 and F13 are regressions against shipped behaviour and should go first.

**Two corrections to this document's own claims**, both accepted: RUL-05 requires
notification, **not** acknowledgement — calling it a Must was wrong, and it is retained as
product policy. And "an entry keeps its rule version forever" was too strong; the tender
asks that re-evaluation never be *silent*, not that it never happen.

**The pattern worth noticing:** every one of these would have passed a syntax check. A schema can be
perfectly valid SQL and still make a mandatory requirement unbuildable — B and D did exactly that, and
D's `CHECK` constraint would have actively fought the fix. This is why the tender, not the DDL, is the
thing to audit second.

**On the audit method itself:** the workflow that produced these findings ran 177 agents, of which 156
died on a usage limit. Because a dead verifier is indistinguishable from a successful refutation in a
majority vote, the run's own summary reported 55 of 56 findings as "refuted" — including every defect
in the table above. The findings were recovered by re-checking the concrete claims directly against
the file. **Treat that summary as void**; the table above is what survived actual verification.
