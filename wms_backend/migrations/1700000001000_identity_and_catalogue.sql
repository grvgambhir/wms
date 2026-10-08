-- Up Migration

-- BACKEND_DB_PLAN.md §4.1–4.3 and §4.11 (fee). Dependency order per §4.0.4.
--
-- PLAN DEFECT (I): §4.0.3 grants only USAGE ON SCHEMA. That permits looking objects up;
-- it does NOT permit reading or writing them. Without table privileges app_rw can do
-- nothing at all. Default privileges are set here so every table created from now on is
-- granted automatically — otherwise every future migration has to remember, and the one
-- that forgets fails in production rather than in CI.
ALTER DEFAULT PRIVILEGES IN SCHEMA core, ops
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA core
  GRANT SELECT ON TABLES TO reporting_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit
  GRANT SELECT, INSERT ON TABLES TO app_rw;          -- append-only by construction
ALTER DEFAULT PRIVILEGES IN SCHEMA restricted
  GRANT SELECT, INSERT, UPDATE ON TABLES TO restricted_rw;

-- 4.7.1 — locale comes first: core.person references it.
CREATE TABLE core.locale (
  code       text PRIMARY KEY,
  name       text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  active     boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX locale_one_default ON core.locale (is_default) WHERE is_default;

INSERT INTO core.locale (code, name, is_default) VALUES
  ('en', 'English', true),
  ('it', 'Italiano', false);

-- 4.2 Event catalogue
CREATE TABLE core.event (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  slug               text UNIQUE NOT NULL,
  name               text NOT NULL,
  starts_on          date NOT NULL,
  ends_on            date NOT NULL,
  timezone           text NOT NULL DEFAULT 'Europe/Rome',
  age_reference_date date NOT NULL,                 -- RUL-02: configurable, not hardcoded
  status             text NOT NULL DEFAULT 'planned',
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_dates_ordered CHECK (ends_on >= starts_on)
);

CREATE TABLE core.sport (
  id       uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id uuid NOT NULL REFERENCES core.event(id),
  code     text NOT NULL,
  name     text NOT NULL,
  UNIQUE (event_id, code)
);

-- 4.3 Rules — identity, then immutable versions
CREATE TABLE core.rule_set (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id   uuid NOT NULL REFERENCES core.event(id),
  sport_code text NOT NULL,
  discipline text,
  event_name text,
  -- NULLS NOT DISTINCT: without it a NULL discipline/event_name makes every row distinct
  -- and this constraint would silently permit duplicate rule sets.
  UNIQUE NULLS NOT DISTINCT (event_id, sport_code, discipline, event_name)
);

CREATE TABLE core.rule_version (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  rule_set_id    uuid NOT NULL REFERENCES core.rule_set(id),
  version_no     integer NOT NULL,
  reference_date date NOT NULL,
  effective      tstzrange NOT NULL,
  status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','active','superseded')),
  published_by   uuid,
  approved_by    uuid,                              -- RUL-04 requires an approver
  published_at   timestamptz,
  reason         text,
  UNIQUE (rule_set_id, version_no),
  -- Two active versions may never overlap in time for one rule set. The uuid '='
  -- operator comes from btree_gist.
  EXCLUDE USING gist (rule_set_id WITH =, effective WITH &&) WHERE (status = 'active')
);
CREATE INDEX rule_version_lookup
  ON core.rule_version (rule_set_id, status, lower(effective) DESC);

-- NOT a blanket REVOKE UPDATE: publishing must close the outgoing version's `effective`
-- range, which is an UPDATE. The trigger freezes the CONTENT and leaves that move legal.
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

-- 4.2 Products
CREATE TABLE core.sport_entry_product (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id          uuid NOT NULL REFERENCES core.event(id),
  sport_id          uuid NOT NULL REFERENCES core.sport(id),
  discipline        text,
  name              text NOT NULL,
  participant_type  text NOT NULL
                      CHECK (participant_type IN ('individual','doubles','team','crew','relay')),
  rule_set_id       uuid NOT NULL REFERENCES core.rule_set(id),
  allowed_grades    text[] NOT NULL DEFAULT '{competitive,recreational}',
  partner_required  boolean NOT NULL DEFAULT false,
  requires_evidence boolean NOT NULL DEFAULT false,
  -- No price column: fees vary by category, grade and time. See core.fee.
  UNIQUE (event_id, sport_id, name)
);
CREATE INDEX sport_entry_product_by_sport ON core.sport_entry_product (event_id, sport_id);

-- 4.5 Quota — where overselling is made impossible
CREATE TABLE core.entry_quota (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id               uuid NOT NULL REFERENCES core.event(id),
  sport_entry_product_id uuid NOT NULL REFERENCES core.sport_entry_product(id),
  category_id            text,
  capacity               integer NOT NULL CHECK (capacity >= 0),
  confirmed              integer NOT NULL DEFAULT 0 CHECK (confirmed >= 0),
  reserved               integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- The line that makes overselling impossible. Not the application's `if`.
  CONSTRAINT quota_not_exceeded CHECK (confirmed + reserved <= capacity),
  -- Nullable category_id: plain UNIQUE would let unlimited product-level rows coexist,
  -- and two capacity-60 rows sell 120 places with every CHECK satisfied.
  UNIQUE NULLS NOT DISTINCT (sport_entry_product_id, category_id)
);

-- 4.11 Fees — price is product x category x grade x time, not one number on the product
CREATE TABLE core.fee (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id               uuid NOT NULL REFERENCES core.event(id),
  sport_entry_product_id uuid NOT NULL REFERENCES core.sport_entry_product(id),
  category_id            text,
  grade                  text NOT NULL,
  currency               char(3) NOT NULL DEFAULT 'EUR',
  base_amount_minor      bigint NOT NULL CHECK (base_amount_minor >= 0),
  service_amount_minor   bigint NOT NULL DEFAULT 0 CHECK (service_amount_minor >= 0),
  effective              tstzrange NOT NULL,
  EXCLUDE USING gist (sport_entry_product_id WITH =, grade WITH =, effective WITH &&)
    WHERE (category_id IS NULL)
);
CREATE INDEX fee_lookup
  ON core.fee (sport_entry_product_id, grade, lower(effective) DESC);

-- Down Migration

DROP TABLE IF EXISTS core.fee;
DROP TABLE IF EXISTS core.entry_quota;
DROP TABLE IF EXISTS core.sport_entry_product;
DROP TRIGGER IF EXISTS rule_version_no_rewrite ON core.rule_version;
DROP FUNCTION IF EXISTS core.rule_version_immutable();
DROP TABLE IF EXISTS core.rule_version;
DROP TABLE IF EXISTS core.rule_set;
DROP TABLE IF EXISTS core.sport;
DROP TABLE IF EXISTS core.event;
DROP TABLE IF EXISTS core.locale;

ALTER DEFAULT PRIVILEGES IN SCHEMA core, ops
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA core
  REVOKE SELECT ON TABLES FROM reporting_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit
  REVOKE SELECT, INSERT ON TABLES FROM app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA restricted
  REVOKE SELECT, INSERT, UPDATE ON TABLES FROM restricted_rw;
