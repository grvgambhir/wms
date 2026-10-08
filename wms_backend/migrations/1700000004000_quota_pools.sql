-- Up Migration

-- BACKEND_DB_PLAN.md §4.5, rewritten after the external tender audit (finding F03).
--
-- The previous model was one quota per (product, category) with a single quota_id on the
-- entry. REG-09 requires "quotas, reserved allocations, release waves, local/international
-- quota dimensions" and §2.2.4 requires control at sport/discipline/event/category/venue.
-- An entry could not consume a sport-wide cap AND a venue allocation, because it could
-- point at exactly one. The old CHECK was correct and would have faithfully enforced the
-- wrong aggregate — correctness under concurrency is not requirement coverage.

-- A pool is a capacity at a named scope, optionally nested inside a wider one.
CREATE TABLE core.quota_pool (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id       uuid NOT NULL REFERENCES core.event(id),
  name           text NOT NULL,
  scope_kind     text NOT NULL
                   CHECK (scope_kind IN ('event','sport','discipline','product','category','venue')),
  scope_ref      text,                            -- the code or id at that scope
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
  release_from   timestamptz,                     -- release waves
  release_until  timestamptz,
  eligibility    jsonb NOT NULL DEFAULT '{}',     -- who may draw on it
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pool_not_exceeded CHECK (confirmed + reserved <= capacity),
  CONSTRAINT pool_window_ordered
    CHECK (release_until IS NULL OR release_from IS NULL OR release_until > release_from),
  CONSTRAINT pool_is_not_its_own_parent CHECK (parent_pool_id IS DISTINCT FROM id),
  UNIQUE NULLS NOT DISTINCT (event_id, scope_kind, scope_ref, allocation, name)
);
CREATE INDEX quota_pool_scope  ON core.quota_pool (event_id, scope_kind, scope_ref);
CREATE INDEX quota_pool_parent ON core.quota_pool (parent_pool_id) WHERE parent_pool_id IS NOT NULL;

-- One entry may consume SEVERAL pools. This is the relationship the old model lacked.
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
CREATE INDEX consumption_expiry  ON core.entry_quota_consumption (expires_at)
  WHERE state = 'reserved' AND expires_at IS NOT NULL;

-- Waitlists are per pool, not per (product, category).
ALTER TABLE core.waitlist_entry
  DROP CONSTRAINT waitlist_entry_quota_id_fkey,
  DROP CONSTRAINT waitlist_entry_quota_id_position_key,
  DROP CONSTRAINT waitlist_entry_quota_id_entry_id_key;
ALTER TABLE core.waitlist_entry RENAME COLUMN quota_id TO quota_pool_id;
ALTER TABLE core.waitlist_entry
  ADD CONSTRAINT waitlist_pool_fk FOREIGN KEY (quota_pool_id) REFERENCES core.quota_pool(id),
  ADD CONSTRAINT waitlist_pool_position UNIQUE (quota_pool_id, position),
  ADD CONSTRAINT waitlist_pool_entry    UNIQUE (quota_pool_id, entry_id);

-- Consumption is a SET, not a column on the entry.
ALTER TABLE core.registration_entry DROP COLUMN quota_id;

DROP TABLE core.entry_quota;

-- Down Migration

CREATE TABLE core.entry_quota (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id               uuid NOT NULL REFERENCES core.event(id),
  sport_entry_product_id uuid NOT NULL REFERENCES core.sport_entry_product(id),
  category_id            text,
  capacity               integer NOT NULL CHECK (capacity >= 0),
  confirmed              integer NOT NULL DEFAULT 0 CHECK (confirmed >= 0),
  reserved               integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quota_not_exceeded CHECK (confirmed + reserved <= capacity),
  UNIQUE NULLS NOT DISTINCT (sport_entry_product_id, category_id)
);

ALTER TABLE core.registration_entry ADD COLUMN quota_id uuid REFERENCES core.entry_quota(id);

ALTER TABLE core.waitlist_entry
  DROP CONSTRAINT waitlist_pool_fk,
  DROP CONSTRAINT waitlist_pool_position,
  DROP CONSTRAINT waitlist_pool_entry;
ALTER TABLE core.waitlist_entry RENAME COLUMN quota_pool_id TO quota_id;
ALTER TABLE core.waitlist_entry
  ADD CONSTRAINT waitlist_entry_quota_id_fkey FOREIGN KEY (quota_id) REFERENCES core.entry_quota(id),
  ADD CONSTRAINT waitlist_entry_quota_id_position_key UNIQUE (quota_id, position),
  ADD CONSTRAINT waitlist_entry_quota_id_entry_id_key UNIQUE (quota_id, entry_id);

DROP TABLE IF EXISTS core.entry_quota_consumption;
DROP TABLE IF EXISTS core.quota_pool;
