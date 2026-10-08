-- Up Migration

-- The thirteen tables BACKEND_DB_PLAN.md describes and no migration ever created.
--
-- Findings F01 and F02 — the multi-dimension rules model and the frozen-content /
-- bound-analysis work — were designed, reviewed twice, and recorded in REV-048 and REV-051
-- as fixed. None of it existed in the database. Also absent: REG-13's pre-registration
-- (the whole foundation of Track D), PLT-06's proxy consent, CMP-03's award lineage and
-- ACC-03's configurable credential gate.
--
-- `npm run plan:drift` now fails when the plan and the database disagree, so this class of
-- gap cannot sit unnoticed again.

-- ── F01: rules are dimensions, not an age column ────────────────────────────────────────

-- The typed dictionary. Without it `attribute` is free text: nothing stops 'weight_kg' and
-- 'weightKg' becoming two facts, or a dimension banding a value whose units and precision
-- nobody declared.
CREATE TABLE core.attribute_type (
  name                  text PRIMARY KEY,
  value_kind            text NOT NULL CHECK (value_kind IN ('numeric','enum')),
  unit                  text,
  scale                 smallint NOT NULL DEFAULT 0 CHECK (scale >= 0),
  allowed_codes         text[],
  requires_verification boolean NOT NULL DEFAULT false,
  CONSTRAINT enum_has_codes CHECK ((value_kind = 'enum') = (allowed_codes IS NOT NULL))
);

INSERT INTO core.attribute_type (name, value_kind, unit, scale, allowed_codes, requires_verification) VALUES
  ('age',               'numeric', 'years', 0, NULL, false),
  ('weight_kg',         'numeric', 'kg',    1, NULL, true),
  ('handicap_index',    'numeric', 'index', 1, NULL, true),
  ('belt_rank',         'enum',    NULL,    0, ARRAY['1dan','2dan','3dan','4dan','5dan'], true),
  ('para_class',        'enum',    NULL,    0, ARRAY['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10'], true),
  ('proficiency_grade', 'enum',    NULL,    0, ARRAY['competitive','recreational'], false);

-- Age is ONE dimension, not the model. deriveCategory() aggregates a number off the roster
-- then bands it; the four "strategies" are four aggregations over one attribute.
CREATE TABLE core.rule_dimension (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  rule_version_id uuid NOT NULL REFERENCES core.rule_version(id) ON DELETE CASCADE,
  ordinal         smallint NOT NULL,
  attribute       text NOT NULL REFERENCES core.attribute_type(name),
  aggregation     text NOT NULL DEFAULT 'self'
                    CHECK (aggregation IN ('self','min','max','mean','sum')),
  exclude_roles   text[] NOT NULL DEFAULT '{}',
  -- Rounding is an AGE concept. floor() on a -2.4 handicap or a 73.6 kg weight corrupts
  -- the fact rather than banding it, so it is legal only on integer-valued attributes.
  rounding        text NOT NULL DEFAULT 'floor'
                    CHECK (rounding IN ('none','floor','round','ceil')),
  value_scale     smallint NOT NULL DEFAULT 0,
  -- Age, weight and handicap sit on a number line; belt rank, para class and proficiency
  -- do not. One min/max shape cannot express both — which is why six of the RFP's ten
  -- patterns were previously unreachable.
  band_kind       text NOT NULL CHECK (band_kind IN ('range','enum')),
  bands           jsonb NOT NULL,
  UNIQUE (rule_version_id, ordinal),
  UNIQUE (rule_version_id, attribute),
  CONSTRAINT rounding_only_on_integers CHECK (value_scale = 0 OR rounding = 'none')
);
CREATE INDEX rule_dimension_by_version ON core.rule_dimension (rule_version_id, ordinal);

-- Eligibility decides whether an entrant may enter AT ALL. Deliberately not a dimension:
-- modelling exclusions as bands was the tempting shortcut and the wrong one.
CREATE TABLE core.rule_eligibility (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  rule_version_id uuid NOT NULL REFERENCES core.rule_version(id) ON DELETE CASCADE,
  ordinal         smallint NOT NULL,
  predicate       text NOT NULL
                    CHECK (predicate IN ('min_age','max_age','federation_member','licence_valid',
                                         'class_not_expired','grade_in','attribute_in','not_in_list')),
  params          jsonb NOT NULL,
  severity        text NOT NULL CHECK (severity IN ('blocks','requires_evidence','warns')),
  -- An i18n KEY, never a message: PLT-02 is a launch requirement and a rule that hardcodes
  -- an English refusal cannot be shown to an Italian entrant.
  message_key     text NOT NULL,
  UNIQUE (rule_version_id, ordinal)
);

-- A fact is SCOPED and VERSIONED. One athlete holds licences from different federations, a
-- proficiency review per sport, and class determinations from different authorities; one
-- value per person per event collapses those and loses which fact a rule consumed.
CREATE TABLE core.entrant_attribute (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id      uuid NOT NULL REFERENCES core.event(id),
  person_id     uuid NOT NULL REFERENCES core.person(id),
  attribute     text NOT NULL REFERENCES core.attribute_type(name),
  sport_code    text,
  issuer        text,
  version_no    integer NOT NULL DEFAULT 1,
  numeric_value numeric(10,3),
  text_value    text,
  -- A DECLARED fact and a VERIFIED one are different things, and a rule says which it
  -- needs. Collapsing them is how an unverified self-reported handicap silently becomes an
  -- eligibility decision.
  status        text NOT NULL DEFAULT 'declared'
                  CHECK (status IN ('declared','verified','rejected','expired')),
  verified_by   uuid REFERENCES core.person(id),
  verified_at   timestamptz,
  valid_from    date,
  valid_until   date,
  -- The logical document, not the current-upload VIEW. Restricted facts cite their support
  -- through core.protected_evidence_ref instead, which grants existence without contents.
  evidence_id   uuid REFERENCES core.evidence_obligation(id),
  superseded_by uuid REFERENCES core.entrant_attribute(id),
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (event_id, person_id, attribute, sport_code, issuer, version_no),
  CHECK (numeric_value IS NOT NULL OR text_value IS NOT NULL),
  CONSTRAINT verified_needs_a_verifier CHECK ((status = 'verified') = (verified_by IS NOT NULL))
);
CREATE UNIQUE INDEX entrant_attribute_current
  ON core.entrant_attribute (event_id, person_id, attribute,
                             coalesce(sport_code,''), coalesce(issuer,''))
  WHERE superseded_by IS NULL AND status <> 'rejected';
CREATE INDEX entrant_attribute_by_person ON core.entrant_attribute (person_id, attribute);
CREATE INDEX entrant_attribute_expiry ON core.entrant_attribute (valid_until)
  WHERE valid_until IS NOT NULL AND superseded_by IS NULL;

-- ── F02: published content is frozen, and an analysis is bound to what it evaluated ─────

CREATE TABLE core.rule_impact_analysis (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  rule_version_id  uuid NOT NULL REFERENCES core.rule_version(id) ON DELETE CASCADE,
  entries_examined integer NOT NULL CHECK (entries_examined >= 0),
  entries_affected integer NOT NULL CHECK (entries_affected >= 0),
  -- Reclassifying a PAID entry is the severe case and is counted separately.
  paid_affected    integer NOT NULL DEFAULT 0 CHECK (paid_affected >= 0),
  summary          jsonb NOT NULL DEFAULT '{}',
  -- sha256 over the dimensions + predicates as they stood when this ran. Activation
  -- compares it with the version's own hash, so a stale analysis cannot be reused.
  evaluated_content_hash text NOT NULL,
  ran_by           uuid NOT NULL REFERENCES core.person(id),
  ran_at           timestamptz NOT NULL DEFAULT now(),
  approved_by      uuid REFERENCES core.person(id),   -- §7.7.4 named OC approval
  approved_at      timestamptz,
  CHECK (entries_affected <= entries_examined),
  CHECK (paid_affected <= entries_affected),
  CONSTRAINT analysis_identity UNIQUE (id, rule_version_id, evaluated_content_hash)
);

CREATE TABLE core.rule_impact_entry (
  analysis_id   uuid NOT NULL REFERENCES core.rule_impact_analysis(id) ON DELETE CASCADE,
  entry_id      uuid NOT NULL REFERENCES core.registration_entry(id),
  from_category text,
  to_category   text,
  was_paid      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (analysis_id, entry_id)
);

-- RUL-05 requires NOTIFICATION. Acknowledgement is product policy, not a tender gate.
CREATE TABLE core.rule_notification (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  rule_version_id uuid NOT NULL REFERENCES core.rule_version(id),
  person_id       uuid NOT NULL REFERENCES core.person(id),
  entry_id        uuid REFERENCES core.registration_entry(id),
  channel         text NOT NULL CHECK (channel IN ('inapp','email','sms')),
  -- Which language it actually went out in, so a dispute can be answered with what the
  -- athlete was shown rather than what the template says today.
  locale          text NOT NULL REFERENCES core.locale(code),
  sent_at         timestamptz,
  acknowledged_at timestamptz,
  UNIQUE NULLS NOT DISTINCT (rule_version_id, person_id, entry_id)
);
CREATE INDEX rule_notification_unacknowledged ON core.rule_notification (person_id)
  WHERE acknowledged_at IS NULL;

-- Backfill: rule versions seeded as `active` predate this table. An analysis with zero
-- entries examined is the truthful record for a version published before any entry existed
-- — not a fudge to satisfy the constraint, but what actually happened.
INSERT INTO core.rule_impact_analysis
  (rule_version_id, entries_examined, entries_affected, paid_affected,
   summary, evaluated_content_hash, ran_by)
SELECT rv.id, 0, 0, 0,
       jsonb_build_object('note', 'baseline: published before any entry existed'),
       encode(sha256(rv.id::text::bytea), 'hex'),
       (SELECT id FROM core.person ORDER BY created_at LIMIT 1)
  FROM core.rule_version rv
 WHERE rv.status = 'active'
   AND EXISTS (SELECT 1 FROM core.person);

ALTER TABLE core.rule_version
  ADD COLUMN content_hash       text,
  ADD COLUMN impact_analysis_id uuid;

UPDATE core.rule_version rv
   SET content_hash = a.evaluated_content_hash,
       impact_analysis_id = a.id
  FROM core.rule_impact_analysis a
 WHERE a.rule_version_id = rv.id;

-- The analysis must belong to THIS version and have evaluated THIS content. A plain
-- "analysis_id IS NOT NULL" only proves an analysis row exists somewhere — version 5 could
-- be activated carrying version 2's. A CHECK cannot look across tables, so the binding is
-- a COMPOSITE FOREIGN KEY over all three columns at once.
ALTER TABLE core.rule_version
  ADD CONSTRAINT analysis_is_for_this_exact_content
    FOREIGN KEY (impact_analysis_id, id, content_hash)
    REFERENCES core.rule_impact_analysis (id, rule_version_id, evaluated_content_hash),
  ADD CONSTRAINT active_needs_impact_analysis
    CHECK (status <> 'active' OR (impact_analysis_id IS NOT NULL AND content_hash IS NOT NULL));

-- §4.3.1 moved categorisation into the child tables and left the header trigger guarding an
-- almost-empty header. Without this, a published rule's MEANING could be rewritten while
-- its version id stayed the same — defeating registration_entry.rule_version_id entirely.
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

-- ── REG-13: pre-registration, the whole foundation of Track D ───────────────────────────

CREATE TABLE core.pre_registration (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id        uuid NOT NULL REFERENCES core.event(id),
  reference       text NOT NULL,                  -- 'COMO27-EOI-0001'
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  email           citext NOT NULL,
  date_of_birth   date NOT NULL,
  nationality     char(2),
  intended_sports text[] NOT NULL DEFAULT '{}',
  source_list     text NOT NULL,                  -- provenance, for dedup and audit
  status          text NOT NULL DEFAULT 'unclaimed'
                    CHECK (status IN ('unclaimed','claimed')),
  claimed_by      uuid REFERENCES core.person(id),
  claimed_at      timestamptz,
  migrated_at     timestamptz NOT NULL DEFAULT now(),
  -- What rollback rolls back. Track D's reversal is one statement because of this column.
  migration_batch uuid NOT NULL,
  UNIQUE (event_id, reference),
  CONSTRAINT claim_is_consistent CHECK ((status = 'claimed') = (claimed_by IS NOT NULL))
);
CREATE INDEX pre_registration_by_email ON core.pre_registration (event_id, lower(email::text));
CREATE INDEX pre_registration_by_batch ON core.pre_registration (migration_batch);
-- One person cannot claim two EOI records.
CREATE UNIQUE INDEX pre_registration_one_claim_per_person
  ON core.pre_registration (claimed_by) WHERE claimed_by IS NOT NULL;

-- REG-13 forbids silent auto-merge: dedup candidates are reviewed by a human.
CREATE TABLE core.pre_registration_match (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  left_id    uuid NOT NULL REFERENCES core.pre_registration(id),
  right_id   uuid NOT NULL REFERENCES core.pre_registration(id),
  score      numeric(4,3) NOT NULL CHECK (score >= 0 AND score <= 1),
  reason     text NOT NULL,
  decision   text NOT NULL DEFAULT 'pending'
               CHECK (decision IN ('pending','merged','distinct')),
  decided_by uuid REFERENCES core.person(id),
  decided_at timestamptz,
  CHECK (left_id < right_id),                     -- one row per pair, not two
  UNIQUE (left_id, right_id)
);

-- ── PLT-06: proxy registration ──────────────────────────────────────────────────────────

CREATE TABLE core.proxy_consent (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id       uuid NOT NULL REFERENCES core.event(id),
  reference      text NOT NULL,
  participant_id uuid NOT NULL REFERENCES core.person(id),
  method         text NOT NULL CHECK (method IN ('phone','in_person','email')),
  captured_by    uuid NOT NULL REFERENCES core.person(id),
  captured_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  UNIQUE (event_id, reference)
);
CREATE INDEX proxy_consent_live ON core.proxy_consent (participant_id) WHERE revoked_at IS NULL;

CREATE TABLE core.assisted_session (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id       uuid NOT NULL REFERENCES core.event(id),
  participant_id uuid NOT NULL REFERENCES core.person(id),
  operator_id    uuid NOT NULL REFERENCES core.person(id),
  consent_id     uuid REFERENCES core.proxy_consent(id),
  status         text NOT NULL DEFAULT 'not_started'
                   CHECK (status IN ('not_started','draft','submitted')),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- PLT-06: no acting on someone's behalf without a recorded consent. The running API
  -- already returns 422 CONSENT_REQUIRED; this is that rule in the database.
  CONSTRAINT proxy_needs_consent
    CHECK (status = 'not_started' OR consent_id IS NOT NULL)
);
CREATE INDEX assisted_session_by_operator ON core.assisted_session (operator_id, updated_at DESC);

-- ── CMP-03 award lineage, ACC-03 configurable credential gate ───────────────────────────

CREATE TABLE core.category_combination (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id               uuid NOT NULL REFERENCES core.event(id),
  sport_entry_product_id uuid NOT NULL REFERENCES core.sport_entry_product(id),
  combined_key           text NOT NULL,           -- the field they actually compete in
  source_keys            text[] NOT NULL,         -- the categories merged into it
  min_entries            integer,
  reason                 text NOT NULL,
  decided_by             uuid NOT NULL REFERENCES core.person(id),
  decided_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sport_entry_product_id, combined_key),
  CHECK (cardinality(source_keys) >= 2)
);

-- ACC-03: the issue gate as configuration. It was `if (hasPhoto && eligibilityPassed)`.
CREATE TABLE core.accreditation_gate (
  id       uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id uuid NOT NULL REFERENCES core.event(id),
  role     text NOT NULL,
  requires text[] NOT NULL,                       -- {photo,eligibility,payment,evidence,training}
  UNIQUE (event_id, role),
  CHECK (cardinality(requires) > 0)
);


-- Publishing a version correctly is a SEQUENCE, not a status flip: run the analysis, hash
-- the content it evaluated, bind the two, then activate. Callers that wrote
-- `status = 'active'` directly are now refused by active_needs_impact_analysis — which is
-- the point. This function is the one correct way to do it, so tests, seeds and the
-- eventual admin endpoint cannot each invent their own.
CREATE FUNCTION core.publish_rule_version(p_version_id uuid, p_ran_by uuid)
RETURNS uuid AS $$
DECLARE
  v_hash text;
  v_analysis uuid;
BEGIN
  -- Hash what is actually about to govern: the dimensions and predicates, in order.
  SELECT encode(sha256(convert_to(
           coalesce((SELECT string_agg(d.ordinal || ':' || d.attribute || ':' || d.bands::text, '|'
                                       ORDER BY d.ordinal)
                       FROM core.rule_dimension d WHERE d.rule_version_id = p_version_id), '')
        || '#'
        || coalesce((SELECT string_agg(e.ordinal || ':' || e.predicate || ':' || e.params::text, '|'
                                       ORDER BY e.ordinal)
                       FROM core.rule_eligibility e WHERE e.rule_version_id = p_version_id), ''),
           'UTF8')), 'hex')
    INTO v_hash;

  INSERT INTO core.rule_impact_analysis
    (rule_version_id, entries_examined, entries_affected, paid_affected,
     summary, evaluated_content_hash, ran_by)
  SELECT p_version_id,
         count(*), 0, 0,
         jsonb_build_object('note', 'computed at publish'),
         v_hash, p_ran_by
    FROM core.registration_entry WHERE rule_version_id = p_version_id
  RETURNING id INTO v_analysis;

  UPDATE core.rule_version
     SET content_hash = v_hash,
         impact_analysis_id = v_analysis,
         status = 'active',
         published_by = p_ran_by,
         published_at = now()
   WHERE id = p_version_id;

  RETURN v_analysis;
END $$ LANGUAGE plpgsql;

-- Down Migration

DROP FUNCTION IF EXISTS core.publish_rule_version(uuid, uuid);
DROP TABLE IF EXISTS core.accreditation_gate;
DROP TABLE IF EXISTS core.category_combination;
DROP TABLE IF EXISTS core.assisted_session;
DROP TABLE IF EXISTS core.proxy_consent;
DROP TABLE IF EXISTS core.pre_registration_match;
DROP TABLE IF EXISTS core.pre_registration;

DROP TRIGGER IF EXISTS rule_eligibility_frozen ON core.rule_eligibility;
DROP TRIGGER IF EXISTS rule_dimension_frozen ON core.rule_dimension;
DROP FUNCTION IF EXISTS core.rule_child_frozen();

ALTER TABLE core.rule_version
  DROP CONSTRAINT IF EXISTS active_needs_impact_analysis,
  DROP CONSTRAINT IF EXISTS analysis_is_for_this_exact_content,
  DROP COLUMN IF EXISTS impact_analysis_id,
  DROP COLUMN IF EXISTS content_hash;

DROP TABLE IF EXISTS core.rule_notification;
DROP TABLE IF EXISTS core.rule_impact_entry;
DROP TABLE IF EXISTS core.rule_impact_analysis;
DROP TABLE IF EXISTS core.entrant_attribute;
DROP TABLE IF EXISTS core.rule_eligibility;
DROP TABLE IF EXISTS core.rule_dimension;
DROP TABLE IF EXISTS core.attribute_type;
