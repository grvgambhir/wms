-- Up Migration

-- BACKEND_DB_PLAN.md §4.1 (identity) and §4.4 (registration).

CREATE TABLE core.person (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  idp_subject   text UNIQUE,                        -- NULL for desk-created people
  email         citext UNIQUE,
  given_name    text NOT NULL,
  family_name   text NOT NULL,
  date_of_birth date NOT NULL,                      -- date, not timestamp: age must not
                                                    -- shift across a timezone boundary
  nationality   char(2),
  gender        text,
  locale        text REFERENCES core.locale(code),  -- PLT-02
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- A person is global; participation is per-edition. One human may enter Como 2027 and
-- Kansai 2027 — two registrations, one person.
CREATE TABLE core.athlete_profile (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id  uuid NOT NULL REFERENCES core.person(id),
  event_id   uuid NOT NULL REFERENCES core.event(id),
  status     text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, event_id)
);

-- Append-only: consent is never UPDATEd, it is re-granted or withdrawn as a new row.
-- GDPR requires proving what someone agreed to AND when; a mutable boolean cannot.
CREATE TABLE core.consent (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id   uuid NOT NULL REFERENCES core.person(id),
  event_id    uuid REFERENCES core.event(id),
  kind        text NOT NULL,
  granted     boolean NOT NULL,
  version     text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source      text NOT NULL
);
CREATE INDEX consent_latest ON core.consent (person_id, kind, occurred_at DESC);
REVOKE UPDATE, DELETE ON core.consent FROM app_rw;

CREATE TABLE core.team_roster (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id           uuid NOT NULL REFERENCES core.event(id),
  captain_profile_id uuid REFERENCES core.athlete_profile(id),
  locked_at          timestamptz,                   -- TEA-04 roster lock
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.roster_member (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  roster_id     uuid NOT NULL REFERENCES core.team_roster(id) ON DELETE CASCADE,
  person_id     uuid REFERENCES core.person(id),
  display_name  text NOT NULL,
  date_of_birth date NOT NULL,
  role          text,
  position      integer NOT NULL,
  UNIQUE (roster_id, position)
);
CREATE INDEX roster_member_by_roster ON core.roster_member (roster_id);

CREATE TABLE core.registration_entry (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id               uuid NOT NULL REFERENCES core.event(id),
  athlete_profile_id     uuid NOT NULL REFERENCES core.athlete_profile(id),
  sport_entry_product_id uuid NOT NULL REFERENCES core.sport_entry_product(id),
  partner_profile_id     uuid REFERENCES core.athlete_profile(id),
  grade                  text NOT NULL,
  -- Pinned to the exact immutable version. This is the whole temporal-correctness story:
  -- a later publication cannot retroactively rewrite what this entry was judged by.
  rule_version_id        uuid NOT NULL REFERENCES core.rule_version(id),
  original_category_id   text,
  original_category_name text,
  current_category_id    text,
  current_category_name  text,
  category_change_reason text,
  team_roster_id         uuid REFERENCES core.team_roster(id),
  evidence_status        text NOT NULL DEFAULT 'not_required',
  status                 text NOT NULL DEFAULT 'draft',
  quota_id               uuid REFERENCES core.entry_quota(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- The double-click, the retried request and the second open tab all collapse onto one row.
CREATE UNIQUE INDEX uq_entry_live
  ON core.registration_entry (athlete_profile_id, sport_entry_product_id)
  WHERE status NOT IN ('cancelled','withdrawn','substituted');

CREATE INDEX entry_by_event_status ON core.registration_entry (event_id, status);
CREATE INDEX entry_by_athlete      ON core.registration_entry (athlete_profile_id, created_at DESC);
CREATE INDEX entry_by_product      ON core.registration_entry (sport_entry_product_id, status);
-- Keyset paging (§5) needs the composite; the filter column leads.
CREATE INDEX entry_keyset          ON core.registration_entry (event_id, created_at DESC, id DESC);

-- REG-11. Out of the entry and append-only: a JSON array inside the row can be silently
-- truncated by any writer, cannot be indexed or queried across entries, and cannot be
-- protected by grant.
CREATE TABLE core.entry_status_event (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  entry_id    uuid NOT NULL REFERENCES core.registration_entry(id),
  from_status text,
  to_status   text NOT NULL,
  actor_kind  text NOT NULL CHECK (actor_kind IN ('participant','admin','system')),
  actor_id    uuid REFERENCES core.person(id),
  reason      text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entry_status_trail ON core.entry_status_event (entry_id, occurred_at);
REVOKE UPDATE, DELETE ON core.entry_status_event FROM app_rw;

-- RUL-04: the arithmetic behind a category decision, preserved. When an athlete disputes
-- their category in 2027 you can show the exact ages used, not recompute and hope.
CREATE TABLE core.category_audit (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  entry_id      uuid NOT NULL REFERENCES core.registration_entry(id),
  from_category text,
  to_category   text NOT NULL,
  trigger       text NOT NULL,
  member_ages   jsonb NOT NULL,
  approved_by   uuid REFERENCES core.person(id),
  reason        text,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX category_audit_by_entry ON core.category_audit (entry_id, occurred_at);
REVOKE UPDATE, DELETE ON core.category_audit FROM app_rw;

CREATE TABLE core.waitlist_entry (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  quota_id         uuid NOT NULL REFERENCES core.entry_quota(id),
  entry_id         uuid NOT NULL REFERENCES core.registration_entry(id),
  status           text NOT NULL DEFAULT 'waiting'
                     CHECK (status IN ('eligible','waiting','offered','claimed','expired')),
  -- 'eligible' means "may join" — not yet in the queue — so neither is known yet.
  position         integer,
  offer_expires_at timestamptz,
  joined_at        timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- NULLs are distinct here, so many 'eligible' rows coexist; only real positions bind.
  UNIQUE (quota_id, position),
  UNIQUE (quota_id, entry_id)
);
CREATE INDEX waitlist_expiry_sweeper ON core.waitlist_entry (status, offer_expires_at)
  WHERE status = 'offered';

-- Down Migration

DROP TABLE IF EXISTS core.waitlist_entry;
DROP TABLE IF EXISTS core.category_audit;
DROP TABLE IF EXISTS core.entry_status_event;
DROP TABLE IF EXISTS core.registration_entry;
DROP TABLE IF EXISTS core.roster_member;
DROP TABLE IF EXISTS core.team_roster;
DROP TABLE IF EXISTS core.consent;
DROP TABLE IF EXISTS core.athlete_profile;
DROP TABLE IF EXISTS core.person;
