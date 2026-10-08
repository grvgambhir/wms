-- Up Migration

-- F07 / F11: evidence requirements and registration policies as versioned,
-- frozen configuration — the same object type as rule_version, not booleans
-- on a product.
--
-- WHY this is not an ALTER of the existing one-row-per-upload tables:
-- EVD-02 needs a *logical document* (the obligation) that survives rejected
-- version 1 and accepted resubmission 2; an S3 object version is the storage
-- artefact, not the issued document's version or the reviewer decision.
-- REG-08/11 need sport-specific cardinalities, entry limits, incompatibilities,
-- deadlines and actor-gated transitions. uq_entry_live still enforces one live
-- entry per product; it cannot express "at most three events" or "crew of four
-- plus a cox". Those are counts across rows, so they are triggers + an
-- append-only evaluation, not CHECKs.
--
-- Published configuration is frozen (core.requirement_child_frozen /
-- core.policy_child_frozen). An entry judged under version 3 stays explainable
-- when version 5 is live — same guarantee as registration_entry.rule_version_id.
--
-- Messages are i18n keys resolving through core.translation (PLT-02). Nothing
-- in this schema stores an English refusal string.

-- PLT-02 resolution target. Named by F07/F11; the catalogue itself was in
-- §4.7.1 and never migrated. Adding a language is INSERTs, not a deployment.
CREATE TABLE core.translation (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id    uuid REFERENCES core.event(id),
  entity_type text NOT NULL,
  entity_id   uuid,
  field       text NOT NULL,                      -- the message_key, or 'name'
  locale      text NOT NULL REFERENCES core.locale(code),
  value       text NOT NULL,
  updated_by  uuid REFERENCES core.person(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (entity_type, entity_id, field, locale)
);
CREATE INDEX translation_by_locale ON core.translation (locale, entity_type);

-- ---------------------------------------------------------------------------
-- F07 — versioned evidence requirements
-- ---------------------------------------------------------------------------

-- Stable identity. Versions hang off this so "licence for rowing" is one
-- thing across publications.
CREATE TABLE core.evidence_requirement_set (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id       uuid NOT NULL REFERENCES core.event(id),
  code           text NOT NULL,                   -- 'rowing_licence'
  document_kind  text NOT NULL,
  classification text NOT NULL
                   CHECK (classification IN ('ordinary','restricted')),
  -- Composite identity so obligations can FK (set, classification) and the
  -- ordinary table physically cannot point at a medical requirement.
  UNIQUE (id, classification),
  UNIQUE (event_id, code),
  CONSTRAINT restricted_kinds_stay_restricted
    CHECK ((classification = 'restricted')
       = (document_kind IN ('medical_certificate','para_classification')))
);
CREATE INDEX evidence_requirement_set_by_event
  ON core.evidence_requirement_set (event_id, classification);

GRANT SELECT ON core.evidence_requirement_set TO restricted_rw;

CREATE TABLE core.evidence_requirement_version (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  requirement_set_id  uuid NOT NULL REFERENCES core.evidence_requirement_set(id),
  version_no          integer NOT NULL,
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','active','superseded')),
  effective           tstzrange NOT NULL,
  requiredness        text NOT NULL
                        CHECK (requiredness IN ('required','optional','required_unless_waived')),
  -- 'games_day' = must still be valid on event.ends_on; 'stated_expiry' uses
  -- the upload's own expires_on; 'none' = no date rule.
  valid_through       text NOT NULL DEFAULT 'stated_expiry'
                        CHECK (valid_through IN ('games_day','stated_expiry','none')),
  accepted_mime_types text[] NOT NULL DEFAULT '{}',
  message_key         text NOT NULL,              -- i18n; never a sentence
  published_by        uuid REFERENCES core.person(id),
  published_at        timestamptz,
  UNIQUE (requirement_set_id, version_no),
  EXCLUDE USING gist (requirement_set_id WITH =, effective WITH &&)
    WHERE (status = 'active')
);
CREATE INDEX evidence_requirement_version_lookup
  ON core.evidence_requirement_version (requirement_set_id, status, lower(effective) DESC);

GRANT SELECT ON core.evidence_requirement_version TO restricted_rw;

CREATE FUNCTION core.evidence_requirement_version_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'draft' THEN
    IF NEW.status = 'draft' THEN
      RAISE EXCEPTION 'cannot return a published evidence requirement to draft';
    END IF;
    IF (NEW.requirement_set_id, NEW.version_no, NEW.requiredness,
        NEW.valid_through, NEW.accepted_mime_types, NEW.message_key)
       IS DISTINCT FROM
       (OLD.requirement_set_id, OLD.version_no, OLD.requiredness,
        OLD.valid_through, OLD.accepted_mime_types, OLD.message_key) THEN
      RAISE EXCEPTION
        'evidence requirement version % is frozen; publish a new version', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER evidence_requirement_version_no_rewrite
  BEFORE UPDATE ON core.evidence_requirement_version
  FOR EACH ROW EXECUTE FUNCTION core.evidence_requirement_version_immutable();

REVOKE DELETE ON core.evidence_requirement_version FROM app_rw;

-- Sport / product / phase: NULL on an axis means "all". Several rows are OR;
-- columns within a row are AND. That is how "licence for this sport" does not
-- leak onto another sport.
CREATE TABLE core.evidence_requirement_applicability (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  requirement_version_id uuid NOT NULL
                           REFERENCES core.evidence_requirement_version(id) ON DELETE CASCADE,
  sport_id               uuid REFERENCES core.sport(id),
  sport_entry_product_id uuid REFERENCES core.sport_entry_product(id),
  phase                  text,
  UNIQUE NULLS NOT DISTINCT
    (requirement_version_id, sport_id, sport_entry_product_id, phase)
);

-- "Translation required when the issuing country is X" — a follow-on on the
-- same requirement, not a second product boolean.
CREATE TABLE core.evidence_requirement_translation (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  requirement_version_id uuid NOT NULL
                           REFERENCES core.evidence_requirement_version(id) ON DELETE CASCADE,
  issuing_country        char(2) NOT NULL,
  message_key            text NOT NULL,
  UNIQUE (requirement_version_id, issuing_country)
);

CREATE FUNCTION core.requirement_child_frozen() RETURNS trigger AS $$
DECLARE
  parent uuid := COALESCE(NEW.requirement_version_id, OLD.requirement_version_id);
  parent_status text;
BEGIN
  SELECT status INTO parent_status
    FROM core.evidence_requirement_version WHERE id = parent;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION
      'evidence requirement version % is % — its applicability and translation rules are frozen; publish a new version',
      parent, parent_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

CREATE TRIGGER evidence_requirement_applicability_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON core.evidence_requirement_applicability
  FOR EACH ROW EXECUTE FUNCTION core.requirement_child_frozen();

CREATE TRIGGER evidence_requirement_translation_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON core.evidence_requirement_translation
  FOR EACH ROW EXECUTE FUNCTION core.requirement_child_frozen();

-- The logical document. Person-owned so collection can happen before an
-- entry exists; applied to entries separately. One row per person per
-- requirement set — resubmission is a new upload, not a new obligation.
CREATE TABLE core.evidence_obligation (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id           uuid NOT NULL REFERENCES core.event(id),
  person_id          uuid NOT NULL REFERENCES core.person(id),
  requirement_set_id uuid NOT NULL,
  classification     text NOT NULL DEFAULT 'ordinary'
                       CHECK (classification = 'ordinary'),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, person_id, requirement_set_id),
  FOREIGN KEY (requirement_set_id, classification)
    REFERENCES core.evidence_requirement_set (id, classification)
);
CREATE INDEX evidence_obligation_by_person ON core.evidence_obligation (person_id, event_id);
REVOKE UPDATE, DELETE ON core.evidence_obligation FROM app_rw;

CREATE TABLE core.evidence_obligation_application (
  obligation_id uuid NOT NULL REFERENCES core.evidence_obligation(id),
  entry_id      uuid NOT NULL REFERENCES core.registration_entry(id),
  applied_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (obligation_id, entry_id)
);
CREATE INDEX evidence_obligation_application_by_entry
  ON core.evidence_obligation_application (entry_id);

-- Immutable issued-document versions. version_no is the resubmission
-- sequence; s3_object_version is the bucket artefact and is allowed to
-- differ — conflating them is how history gets lost.
CREATE TABLE core.evidence_upload (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  obligation_id    uuid NOT NULL REFERENCES core.evidence_obligation(id),
  version_no       integer NOT NULL CHECK (version_no > 0),
  role             text NOT NULL DEFAULT 'original'
                     CHECK (role IN ('original','translation')),
  s3_key           text NOT NULL,
  s3_object_version text,                         -- storage version, not the document's
  mime_type        text,
  size_bytes       bigint,
  checksum         text,
  scan_status      text NOT NULL DEFAULT 'pending'
                     CHECK (scan_status IN ('pending','clean','infected')),
  issuing_country  char(2),
  issued_on        date,
  expires_on       date,
  original_file_name text,
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obligation_id, version_no),
  CONSTRAINT evidence_expiry_after_issue
    CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on)
);
CREATE INDEX evidence_upload_by_obligation
  ON core.evidence_upload (obligation_id, version_no DESC);
CREATE INDEX evidence_upload_expiry
  ON core.evidence_upload (expires_on)
  WHERE expires_on IS NOT NULL;

CREATE FUNCTION core.evidence_upload_immutable() RETURNS trigger AS $$
BEGIN
  IF (NEW.obligation_id, NEW.version_no, NEW.role, NEW.s3_key, NEW.s3_object_version,
      NEW.mime_type, NEW.size_bytes, NEW.checksum, NEW.issuing_country,
      NEW.issued_on, NEW.expires_on, NEW.original_file_name)
     IS DISTINCT FROM
     (OLD.obligation_id, OLD.version_no, OLD.role, OLD.s3_key, OLD.s3_object_version,
      OLD.mime_type, OLD.size_bytes, OLD.checksum, OLD.issuing_country,
      OLD.issued_on, OLD.expires_on, OLD.original_file_name) THEN
    RAISE EXCEPTION 'evidence upload content is immutable; insert a new version instead';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER evidence_upload_no_rewrite
  BEFORE UPDATE ON core.evidence_upload
  FOR EACH ROW EXECUTE FUNCTION core.evidence_upload_immutable();

REVOKE DELETE ON core.evidence_upload FROM app_rw;

CREATE FUNCTION core.evidence_upload_format_guard() RETURNS trigger AS $$
DECLARE
  accepted text[];
BEGIN
  SELECT rv.accepted_mime_types INTO accepted
    FROM core.evidence_obligation o
    JOIN core.evidence_requirement_version rv
      ON rv.requirement_set_id = o.requirement_set_id AND rv.status = 'active'
    WHERE o.id = NEW.obligation_id
    ORDER BY rv.version_no DESC
    LIMIT 1;
  IF accepted IS NOT NULL AND cardinality(accepted) > 0
     AND NEW.mime_type IS NOT NULL
     AND NOT (NEW.mime_type = ANY (accepted)) THEN
    RAISE EXCEPTION 'evidence.format.not_accepted'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER evidence_upload_format_guard
  BEFORE INSERT ON core.evidence_upload
  FOR EACH ROW EXECUTE FUNCTION core.evidence_upload_format_guard();

-- Append-only reviewer decisions. Status of the obligation is DERIVED from
-- these; putting status back on the obligation is how v2 overwrites v1.
CREATE TABLE core.evidence_review (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  upload_id   uuid NOT NULL REFERENCES core.evidence_upload(id),
  decision    text NOT NULL
                CHECK (decision IN ('under_review','approved','rejected')),
  reviewer_id uuid REFERENCES core.person(id),
  reason_key  text,                               -- i18n; required on reject
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_rejected_needs_reason
    CHECK (decision <> 'rejected' OR reason_key IS NOT NULL)
);
CREATE INDEX evidence_review_by_upload ON core.evidence_review (upload_id, occurred_at DESC);
REVOKE UPDATE, DELETE ON core.evidence_review FROM app_rw;

-- An approved link to a requirement, not a status. Revoking inserts no new
-- requirement and does not delete the old one.
CREATE TABLE core.evidence_waiver (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id               uuid NOT NULL REFERENCES core.event(id),
  person_id              uuid NOT NULL REFERENCES core.person(id),
  requirement_set_id     uuid NOT NULL REFERENCES core.evidence_requirement_set(id),
  requirement_version_id uuid NOT NULL REFERENCES core.evidence_requirement_version(id),
  entry_id               uuid REFERENCES core.registration_entry(id),
  status                 text NOT NULL DEFAULT 'approved'
                           CHECK (status IN ('approved','revoked')),
  approved_by            uuid NOT NULL REFERENCES core.person(id),
  approved_at            timestamptz NOT NULL DEFAULT now(),
  reason_key             text NOT NULL,
  valid_until            date
);
CREATE UNIQUE INDEX evidence_waiver_live
  ON core.evidence_waiver (person_id, requirement_set_id, entry_id)
  NULLS NOT DISTINCT
  WHERE status = 'approved';

CREATE FUNCTION core.evidence_requirements_for(
  p_event_id uuid,
  p_sport_id uuid,
  p_product_id uuid
) RETURNS TABLE (
  requirement_version_id uuid,
  requirement_set_id uuid,
  document_kind text,
  requiredness text,
  message_key text
) AS $$
  SELECT rv.id, rs.id, rs.document_kind, rv.requiredness, rv.message_key
    FROM core.evidence_requirement_version rv
    JOIN core.evidence_requirement_set rs ON rs.id = rv.requirement_set_id
   WHERE rs.event_id = p_event_id
     AND rs.classification = 'ordinary'
     AND rv.status = 'active'
     AND (
       NOT EXISTS (
         SELECT 1 FROM core.evidence_requirement_applicability a
          WHERE a.requirement_version_id = rv.id)
       OR EXISTS (
         SELECT 1 FROM core.evidence_requirement_applicability a
          WHERE a.requirement_version_id = rv.id
            AND (a.sport_id IS NULL OR a.sport_id = p_sport_id)
            AND (a.sport_entry_product_id IS NULL
                 OR a.sport_entry_product_id = p_product_id))
     );
$$ LANGUAGE sql STABLE;

-- Outstanding / expired reporting (EVD-04). Waived rows are absent here and
-- still present on evidence_obligation.
CREATE VIEW core.evidence_outstanding AS
SELECT
  o.id AS obligation_id,
  o.event_id,
  o.person_id,
  o.requirement_set_id,
  rs.document_kind,
  rs.code AS requirement_code,
  u.id AS upload_id,
  u.version_no,
  u.expires_on,
  latest.decision AS latest_decision,
  CASE
    WHEN u.id IS NULL THEN 'missing'
    WHEN latest.decision = 'rejected' THEN 'rejected'
    WHEN latest.decision IS NULL OR latest.decision = 'under_review' THEN 'under_review'
    WHEN u.expires_on IS NOT NULL AND u.expires_on < CURRENT_DATE THEN 'expired'
    WHEN rv.valid_through = 'games_day'
     AND u.expires_on IS NOT NULL
     AND u.expires_on < ev.ends_on THEN 'expired'
    ELSE 'current'
  END AS outstanding_reason
FROM core.evidence_obligation o
JOIN core.evidence_requirement_set rs ON rs.id = o.requirement_set_id
JOIN core.event ev ON ev.id = o.event_id
LEFT JOIN LATERAL (
  SELECT rv2.*
    FROM core.evidence_requirement_version rv2
   WHERE rv2.requirement_set_id = o.requirement_set_id
     AND rv2.status = 'active'
   ORDER BY rv2.version_no DESC
   LIMIT 1
) rv ON true
LEFT JOIN LATERAL (
  SELECT u2.*
    FROM core.evidence_upload u2
   WHERE u2.obligation_id = o.id AND u2.role = 'original'
   ORDER BY u2.version_no DESC
   LIMIT 1
) u ON true
LEFT JOIN LATERAL (
  SELECT r.*
    FROM core.evidence_review r
   WHERE r.upload_id = u.id
   ORDER BY r.occurred_at DESC
   LIMIT 1
) latest ON true
WHERE NOT EXISTS (
        SELECT 1 FROM core.evidence_waiver w
         WHERE w.person_id = o.person_id
           AND w.requirement_set_id = o.requirement_set_id
           AND w.status = 'approved'
           AND (w.valid_until IS NULL OR w.valid_until >= CURRENT_DATE)
           AND (w.entry_id IS NULL OR EXISTS (
                 SELECT 1 FROM core.evidence_obligation_application a
                  WHERE a.obligation_id = o.id AND a.entry_id = w.entry_id)))
  AND (rv.requiredness IS NULL OR rv.requiredness <> 'optional' OR u.id IS NOT NULL);

-- Journey read path still selects core.evidence_document by entry_id. The
-- table could not express versions; the view projects the current upload so
-- the existing repository query does not invent a second model.
DROP TABLE core.evidence_document;

CREATE VIEW core.evidence_document AS
SELECT
  o.id,
  a.entry_id,
  rs.document_kind AS kind,
  CASE
    WHEN latest.decision IS NOT NULL THEN latest.decision
    WHEN u.id IS NOT NULL THEN 'uploaded'
    ELSE 'required'
  END AS status,
  u.s3_key,
  u.mime_type,
  u.size_bytes,
  u.checksum,
  COALESCE(u.scan_status, 'pending') AS scan_status,
  u.uploaded_at,
  latest.reviewer_id AS reviewed_by,
  latest.occurred_at AS reviewed_at,
  latest.reason_key AS rejection_reason
FROM core.evidence_obligation o
JOIN core.evidence_requirement_set rs ON rs.id = o.requirement_set_id
JOIN core.evidence_obligation_application a ON a.obligation_id = o.id
LEFT JOIN LATERAL (
  SELECT u2.* FROM core.evidence_upload u2
   WHERE u2.obligation_id = o.id
   ORDER BY u2.version_no DESC
   LIMIT 1
) u ON true
LEFT JOIN LATERAL (
  SELECT r.* FROM core.evidence_review r
   WHERE r.upload_id = u.id
   ORDER BY r.occurred_at DESC
   LIMIT 1
) latest ON true;

-- ---------------------------------------------------------------------------
-- F07 — restricted: same lifecycle, own schema, no join path from core
-- ---------------------------------------------------------------------------

-- Keep evidence_document as the logical obligation (access_log already FKs
-- here). File bytes and reviews move to children so a resubmission cannot
-- overwrite the rejection reason — the defect the restricted screen has today.
ALTER TABLE restricted.evidence_document
  ALTER COLUMN entry_id DROP NOT NULL,
  ADD COLUMN event_id uuid,
  ADD COLUMN requirement_set_id uuid,
  ADD COLUMN classification text NOT NULL DEFAULT 'restricted'
    CHECK (classification = 'restricted');

ALTER TABLE restricted.evidence_document
  ADD CONSTRAINT restricted_evidence_requirement_fk
    FOREIGN KEY (requirement_set_id, classification)
    REFERENCES core.evidence_requirement_set (id, classification);

CREATE TABLE restricted.evidence_document_application (
  document_id uuid NOT NULL REFERENCES restricted.evidence_document(id),
  entry_id    uuid NOT NULL,                      -- no FK to core
  applied_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, entry_id)
);

CREATE TABLE restricted.evidence_upload (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  document_id        uuid NOT NULL REFERENCES restricted.evidence_document(id),
  version_no         integer NOT NULL CHECK (version_no > 0),
  role               text NOT NULL DEFAULT 'original'
                       CHECK (role IN ('original','translation')),
  s3_key             text NOT NULL,
  s3_object_version  text,
  mime_type          text,
  size_bytes         bigint,
  checksum           text,
  scan_status        text NOT NULL DEFAULT 'pending'
                       CHECK (scan_status IN ('pending','clean','infected')),
  issuing_country    char(2),
  issued_on          date,
  expires_on         date,
  original_file_name text,
  uploaded_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_no),
  CONSTRAINT restricted_evidence_expiry_after_issue
    CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on)
);
CREATE INDEX restricted_evidence_upload_by_document
  ON restricted.evidence_upload (document_id, version_no DESC);
CREATE INDEX restricted_evidence_upload_expiry
  ON restricted.evidence_upload (expires_on)
  WHERE expires_on IS NOT NULL;

CREATE FUNCTION restricted.evidence_upload_immutable() RETURNS trigger AS $$
BEGIN
  IF (NEW.document_id, NEW.version_no, NEW.role, NEW.s3_key, NEW.s3_object_version,
      NEW.mime_type, NEW.size_bytes, NEW.checksum, NEW.issuing_country,
      NEW.issued_on, NEW.expires_on, NEW.original_file_name)
     IS DISTINCT FROM
     (OLD.document_id, OLD.version_no, OLD.role, OLD.s3_key, OLD.s3_object_version,
      OLD.mime_type, OLD.size_bytes, OLD.checksum, OLD.issuing_country,
      OLD.issued_on, OLD.expires_on, OLD.original_file_name) THEN
    RAISE EXCEPTION 'restricted evidence upload content is immutable; insert a new version instead';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER restricted_evidence_upload_no_rewrite
  BEFORE UPDATE ON restricted.evidence_upload
  FOR EACH ROW EXECUTE FUNCTION restricted.evidence_upload_immutable();

CREATE TABLE restricted.evidence_review (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  upload_id   uuid NOT NULL REFERENCES restricted.evidence_upload(id),
  decision    text NOT NULL
                CHECK (decision IN ('under_review','approved','rejected')),
  reviewer_id uuid,                               -- no FK to core
  reason_key  text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restricted_evidence_rejected_needs_reason
    CHECK (decision <> 'rejected' OR reason_key IS NOT NULL)
);
CREATE INDEX restricted_evidence_review_by_upload
  ON restricted.evidence_review (upload_id, occurred_at DESC);
REVOKE UPDATE, DELETE ON restricted.evidence_review FROM restricted_rw;

-- No FK to core person/entry: same boundary as the document row. The
-- requirement ids are stored so a reviewer can name which policy was waived
-- without opening a join path from core into this schema.
CREATE TABLE restricted.evidence_waiver (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id               uuid NOT NULL,
  person_id              uuid NOT NULL,
  requirement_set_id     uuid NOT NULL,
  requirement_version_id uuid NOT NULL,
  entry_id               uuid,
  status                 text NOT NULL DEFAULT 'approved'
                           CHECK (status IN ('approved','revoked')),
  approved_by            uuid NOT NULL,
  approved_at            timestamptz NOT NULL DEFAULT now(),
  reason_key             text NOT NULL,
  valid_until            date
);

CREATE UNIQUE INDEX restricted_evidence_waiver_live
  ON restricted.evidence_waiver (person_id, requirement_set_id, entry_id)
  NULLS NOT DISTINCT
  WHERE status = 'approved';

ALTER TABLE restricted.access_log
  ADD COLUMN upload_id uuid REFERENCES restricted.evidence_upload(id);

ALTER TABLE restricted.evidence_document
  DROP COLUMN status,
  DROP COLUMN s3_key,
  DROP COLUMN scan_status,
  DROP COLUMN expires_on,
  DROP COLUMN reviewed_by,
  DROP COLUMN reviewed_at;

CREATE VIEW restricted.evidence_outstanding AS
SELECT
  d.id AS document_id,
  d.event_id,
  d.person_id,
  d.requirement_set_id,
  d.kind AS document_kind,
  u.id AS upload_id,
  u.version_no,
  u.expires_on,
  latest.decision AS latest_decision,
  CASE
    WHEN u.id IS NULL THEN 'missing'
    WHEN latest.decision = 'rejected' THEN 'rejected'
    WHEN latest.decision IS NULL OR latest.decision = 'under_review' THEN 'under_review'
    WHEN u.expires_on IS NOT NULL AND u.expires_on < CURRENT_DATE THEN 'expired'
    ELSE 'current'
  END AS outstanding_reason
FROM restricted.evidence_document d
LEFT JOIN LATERAL (
  SELECT u2.* FROM restricted.evidence_upload u2
   WHERE u2.document_id = d.id AND u2.role = 'original'
   ORDER BY u2.version_no DESC
   LIMIT 1
) u ON true
LEFT JOIN LATERAL (
  SELECT r.* FROM restricted.evidence_review r
   WHERE r.upload_id = u.id
   ORDER BY r.occurred_at DESC
   LIMIT 1
) latest ON true
WHERE NOT EXISTS (
        SELECT 1 FROM restricted.evidence_waiver w
         WHERE w.person_id = d.person_id
           AND w.requirement_set_id = d.requirement_set_id
           AND w.status = 'approved'
           AND (w.valid_until IS NULL OR w.valid_until >= CURRENT_DATE));

REVOKE ALL ON restricted.evidence_document_application FROM app_rw, reporting_ro, PUBLIC;
REVOKE ALL ON restricted.evidence_upload FROM app_rw, reporting_ro, PUBLIC;
REVOKE ALL ON restricted.evidence_review FROM app_rw, reporting_ro, PUBLIC;
REVOKE ALL ON restricted.evidence_waiver FROM app_rw, reporting_ro, PUBLIC;
REVOKE ALL ON restricted.evidence_outstanding FROM app_rw, reporting_ro, PUBLIC;
REVOKE ALL ON restricted.evidence_document FROM app_rw, reporting_ro, PUBLIC;

-- ---------------------------------------------------------------------------
-- F11 — versioned registration policies
-- ---------------------------------------------------------------------------

-- One identity per (event, product, phase). NULL product = event-wide default.
-- Product-specific rows override the default at lookup, they do not overlap it.
CREATE TABLE core.registration_policy_set (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id               uuid NOT NULL REFERENCES core.event(id),
  sport_entry_product_id uuid REFERENCES core.sport_entry_product(id),
  phase                  text,
  name                   text NOT NULL,
  UNIQUE NULLS NOT DISTINCT (event_id, sport_entry_product_id, phase)
);

CREATE TABLE core.registration_policy_version (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  policy_set_id          uuid NOT NULL REFERENCES core.registration_policy_set(id),
  version_no             integer NOT NULL,
  status                 text NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','active','superseded')),
  effective              tstzrange NOT NULL,
  opens_at               timestamptz,
  closes_at              timestamptz,
  substitution_closes_at timestamptz,
  max_live_entries       integer CHECK (max_live_entries IS NULL OR max_live_entries > 0),
  published_by           uuid REFERENCES core.person(id),
  published_at           timestamptz,
  UNIQUE (policy_set_id, version_no),
  EXCLUDE USING gist (policy_set_id WITH =, effective WITH &&)
    WHERE (status = 'active'),
  CONSTRAINT registration_policy_window_ordered
    CHECK (closes_at IS NULL OR opens_at IS NULL OR closes_at > opens_at)
);
CREATE INDEX registration_policy_version_lookup
  ON core.registration_policy_version (policy_set_id, status, lower(effective) DESC);

CREATE FUNCTION core.registration_policy_version_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'draft' THEN
    IF NEW.status = 'draft' THEN
      RAISE EXCEPTION 'cannot return a published registration policy to draft';
    END IF;
    IF (NEW.policy_set_id, NEW.version_no, NEW.opens_at, NEW.closes_at,
        NEW.substitution_closes_at, NEW.max_live_entries)
       IS DISTINCT FROM
       (OLD.policy_set_id, OLD.version_no, OLD.opens_at, OLD.closes_at,
        OLD.substitution_closes_at, OLD.max_live_entries) THEN
      RAISE EXCEPTION
        'registration policy version % is frozen; publish a new version', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER registration_policy_version_no_rewrite
  BEFORE UPDATE ON core.registration_policy_version
  FOR EACH ROW EXECUTE FUNCTION core.registration_policy_version_immutable();

REVOKE DELETE ON core.registration_policy_version FROM app_rw;

-- The ten named states in statusLifecycle.ts. Configuration may narrow which
-- (from, to, actor) triples are legal; it cannot invent a new state. See the
-- report for how the code table and this table should reconcile at runtime.
CREATE TABLE core.registration_policy_transition (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  policy_version_id uuid NOT NULL
                     REFERENCES core.registration_policy_version(id) ON DELETE CASCADE,
  from_status      text NOT NULL
                     CHECK (from_status IN (
                       'draft','pending_evidence','pending_team','pending_payment',
                       'waitlisted','confirmed','cancelled','substituted',
                       'withdrawn','disqualified')),
  to_status        text NOT NULL
                     CHECK (to_status IN (
                       'draft','pending_evidence','pending_team','pending_payment',
                       'waitlisted','confirmed','cancelled','substituted',
                       'withdrawn','disqualified')),
  actor_kind       text NOT NULL
                     CHECK (actor_kind IN ('participant','admin','system')),
  action           text NOT NULL,                 -- same verb as statusLifecycle.ts
  -- Named guards implemented in code; config selects them. Empty = none.
  prerequisite_key text
                     CHECK (prerequisite_key IS NULL OR prerequisite_key IN (
                       'evidence_approved','roster_complete','payment_settled',
                       'within_window','before_substitution_deadline')),
  message_key      text NOT NULL,
  UNIQUE (policy_version_id, from_status, to_status, actor_kind)
);

CREATE TABLE core.registration_policy_roster_rule (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  policy_version_id uuid NOT NULL
                      REFERENCES core.registration_policy_version(id) ON DELETE CASCADE,
  role              text,                         -- NULL = total headcount
  min_count         integer NOT NULL DEFAULT 0 CHECK (min_count >= 0),
  max_count         integer,
  message_key       text NOT NULL,
  UNIQUE NULLS NOT DISTINCT (policy_version_id, role),
  CONSTRAINT roster_rule_bounds
    CHECK (max_count IS NULL OR max_count >= min_count)
);

CREATE TABLE core.registration_policy_incompatibility (
  id                      uuid PRIMARY KEY DEFAULT uuidv7(),
  policy_version_id       uuid NOT NULL
                            REFERENCES core.registration_policy_version(id) ON DELETE CASCADE,
  product_id              uuid NOT NULL REFERENCES core.sport_entry_product(id),
  incompatible_product_id uuid NOT NULL REFERENCES core.sport_entry_product(id),
  message_key             text NOT NULL,
  UNIQUE (policy_version_id, product_id, incompatible_product_id),
  CHECK (product_id <> incompatible_product_id)
);

CREATE FUNCTION core.policy_child_frozen() RETURNS trigger AS $$
DECLARE
  parent uuid := COALESCE(NEW.policy_version_id, OLD.policy_version_id);
  parent_status text;
BEGIN
  SELECT status INTO parent_status
    FROM core.registration_policy_version WHERE id = parent;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION
      'registration policy version % is % — its transitions, roster rules and incompatibilities are frozen; publish a new version',
      parent, parent_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

CREATE TRIGGER registration_policy_transition_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON core.registration_policy_transition
  FOR EACH ROW EXECUTE FUNCTION core.policy_child_frozen();

CREATE TRIGGER registration_policy_roster_rule_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON core.registration_policy_roster_rule
  FOR EACH ROW EXECUTE FUNCTION core.policy_child_frozen();

CREATE TRIGGER registration_policy_incompatibility_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON core.registration_policy_incompatibility
  FOR EACH ROW EXECUTE FUNCTION core.policy_child_frozen();

-- Which version this entry was judged under. Nullable until the first
-- evaluation; afterwards it is the pin. Re-evaluation is a new evaluation
-- row, not an overwrite — same principle as rule_version_id.
ALTER TABLE core.registration_entry
  ADD COLUMN policy_version_id uuid REFERENCES core.registration_policy_version(id);

CREATE TABLE core.registration_policy_evaluation (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  entry_id          uuid NOT NULL REFERENCES core.registration_entry(id),
  policy_version_id uuid NOT NULL REFERENCES core.registration_policy_version(id),
  result            text NOT NULL CHECK (result IN ('pass','fail')),
  failed_limit      text,
  message_key       text,
  detail            jsonb NOT NULL DEFAULT '{}',
  evaluated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX registration_policy_evaluation_by_entry
  ON core.registration_policy_evaluation (entry_id, evaluated_at DESC);
REVOKE UPDATE, DELETE ON core.registration_policy_evaluation FROM app_rw;

CREATE FUNCTION core.policy_version_for_entry(p_entry_id uuid) RETURNS uuid AS $$
DECLARE
  v_pinned uuid;
  v_event uuid;
  v_product uuid;
  v_found uuid;
BEGIN
  SELECT policy_version_id, event_id, sport_entry_product_id
    INTO v_pinned, v_event, v_product
    FROM core.registration_entry WHERE id = p_entry_id;
  IF v_pinned IS NOT NULL THEN
    RETURN v_pinned;
  END IF;
  SELECT pv.id INTO v_found
    FROM core.registration_policy_version pv
    JOIN core.registration_policy_set ps ON ps.id = pv.policy_set_id
   WHERE ps.event_id = v_event
     AND ps.sport_entry_product_id = v_product
     AND pv.status = 'active'
   LIMIT 1;
  IF v_found IS NOT NULL THEN
    RETURN v_found;
  END IF;
  SELECT pv.id INTO v_found
    FROM core.registration_policy_version pv
    JOIN core.registration_policy_set ps ON ps.id = pv.policy_set_id
   WHERE ps.event_id = v_event
     AND ps.sport_entry_product_id IS NULL
     AND pv.status = 'active'
   LIMIT 1;
  RETURN v_found;
END $$ LANGUAGE plpgsql STABLE;

-- Cross-row counts cannot be CHECKs. This trigger is the guarantee that a
-- fifth rower cannot sit on a crew-of-four policy. Under-minimum is an
-- evaluation failure (you cannot refuse the first insert).
CREATE FUNCTION core.roster_cardinality_guard() RETURNS trigger AS $$
DECLARE
  v_roster uuid := COALESCE(NEW.roster_id, OLD.roster_id);
  v_policy uuid;
  r RECORD;
  v_count integer;
BEGIN
  SELECT core.policy_version_for_entry(re.id) INTO v_policy
    FROM core.registration_entry re
   WHERE re.team_roster_id = v_roster
     AND re.status NOT IN ('cancelled','withdrawn','substituted')
   LIMIT 1;
  IF v_policy IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  FOR r IN
    SELECT role, max_count, message_key
      FROM core.registration_policy_roster_rule
     WHERE policy_version_id = v_policy AND max_count IS NOT NULL
  LOOP
    SELECT count(*) INTO v_count
      FROM core.roster_member
     WHERE roster_id = v_roster
       AND (r.role IS NULL OR role IS NOT DISTINCT FROM r.role);
    IF v_count > r.max_count THEN
      RAISE EXCEPTION '%', r.message_key
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

CREATE TRIGGER roster_cardinality_guard
  AFTER INSERT OR UPDATE OR DELETE ON core.roster_member
  FOR EACH ROW EXECUTE FUNCTION core.roster_cardinality_guard();

-- "At most N live events" — also a count across rows. Skip when no policy.
CREATE FUNCTION core.entry_limit_guard() RETURNS trigger AS $$
DECLARE
  v_policy uuid;
  v_max integer;
  v_count integer;
  v_message text := 'registration.entry.limit_exceeded';
BEGIN
  IF NEW.status IN ('cancelled','withdrawn','substituted') THEN
    RETURN NEW;
  END IF;
  v_policy := COALESCE(NEW.policy_version_id, core.policy_version_for_entry(NEW.id));
  IF v_policy IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT max_live_entries INTO v_max
    FROM core.registration_policy_version WHERE id = v_policy;
  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_count
    FROM core.registration_entry re
   WHERE re.athlete_profile_id = NEW.athlete_profile_id
     AND re.event_id = NEW.event_id
     AND re.status NOT IN ('cancelled','withdrawn','substituted');
  IF v_count > v_max THEN
    RAISE EXCEPTION '%', v_message
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER entry_limit_guard
  AFTER INSERT OR UPDATE OF status, athlete_profile_id, policy_version_id
  ON core.registration_entry
  FOR EACH ROW EXECUTE FUNCTION core.entry_limit_guard();

CREATE FUNCTION core.entry_incompatibility_guard() RETURNS trigger AS $$
DECLARE
  v_policy uuid;
  v_other uuid;
  v_message text;
BEGIN
  IF NEW.status IN ('cancelled','withdrawn','substituted') THEN
    RETURN NEW;
  END IF;
  v_policy := COALESCE(NEW.policy_version_id, core.policy_version_for_entry(NEW.id));
  IF v_policy IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT i.incompatible_product_id, i.message_key
    INTO v_other, v_message
    FROM core.registration_policy_incompatibility i
   WHERE i.policy_version_id = v_policy
     AND i.product_id = NEW.sport_entry_product_id
     AND EXISTS (
       SELECT 1 FROM core.registration_entry re
        WHERE re.athlete_profile_id = NEW.athlete_profile_id
          AND re.event_id = NEW.event_id
          AND re.id <> NEW.id
          AND re.sport_entry_product_id = i.incompatible_product_id
          AND re.status NOT IN ('cancelled','withdrawn','substituted'))
   LIMIT 1;
  IF v_other IS NOT NULL THEN
    RAISE EXCEPTION '%', v_message
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER entry_incompatibility_guard
  AFTER INSERT OR UPDATE OF status, sport_entry_product_id, policy_version_id
  ON core.registration_entry
  FOR EACH ROW EXECUTE FUNCTION core.entry_incompatibility_guard();

-- When a policy publishes transition rows, those are the legal moves for
-- entries pinned to it. No rows = the code table (statusLifecycle.ts) remains
-- the law, so existing journeys keep working until a product is configured.
CREATE FUNCTION core.entry_status_policy_guard() RETURNS trigger AS $$
DECLARE
  v_policy uuid;
  v_ok boolean;
BEGIN
  SELECT policy_version_id INTO v_policy
    FROM core.registration_entry WHERE id = NEW.entry_id;
  IF v_policy IS NULL THEN
    RETURN NEW;
  END IF;
  -- Creation of the first status (from_status NULL) is not a configured move.
  IF NEW.from_status IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM core.registration_policy_transition t
        WHERE t.policy_version_id = v_policy) THEN
    RETURN NEW;
  END IF;
  SELECT true INTO v_ok
    FROM core.registration_policy_transition t
   WHERE t.policy_version_id = v_policy
     AND t.from_status IS NOT DISTINCT FROM NEW.from_status
     AND t.to_status = NEW.to_status
     AND t.actor_kind = NEW.actor_kind;
  IF v_ok IS NULL THEN
    RAISE EXCEPTION 'registration.transition.not_permitted'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER entry_status_policy_guard
  BEFORE INSERT ON core.entry_status_event
  FOR EACH ROW EXECUTE FUNCTION core.entry_status_policy_guard();

-- Records the judgement under a specific version. Pins the entry on first
-- use. Never updates a previous evaluation row.
CREATE FUNCTION core.evaluate_registration_policy(
  p_entry_id uuid,
  p_policy_version_id uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_policy uuid;
  v_entry core.registration_entry%ROWTYPE;
  v_result text := 'pass';
  v_failed text;
  v_message text;
  v_detail jsonb := '{}'::jsonb;
  r RECORD;
  v_count integer;
  v_id uuid;
BEGIN
  SELECT * INTO STRICT v_entry FROM core.registration_entry WHERE id = p_entry_id;
  v_policy := COALESCE(p_policy_version_id, core.policy_version_for_entry(p_entry_id));
  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'registration.policy.not_found';
  END IF;

  FOR r IN
    SELECT role, min_count, message_key
      FROM core.registration_policy_roster_rule
     WHERE policy_version_id = v_policy AND min_count > 0
  LOOP
    IF v_entry.team_roster_id IS NULL THEN
      v_count := 0;
    ELSE
      SELECT count(*) INTO v_count
        FROM core.roster_member
       WHERE roster_id = v_entry.team_roster_id
         AND (r.role IS NULL OR role IS NOT DISTINCT FROM r.role);
    END IF;
    IF v_count < r.min_count THEN
      v_result := 'fail';
      v_failed := 'roster_cardinality';
      v_message := r.message_key;
      v_detail := jsonb_build_object('role', r.role, 'have', v_count, 'min', r.min_count);
      EXIT;
    END IF;
  END LOOP;

  IF v_result = 'pass' THEN
    DECLARE
      v_max integer;
      v_opens timestamptz;
      v_closes timestamptz;
    BEGIN
      SELECT max_live_entries, opens_at, closes_at
        INTO v_max, v_opens, v_closes
        FROM core.registration_policy_version WHERE id = v_policy;
      IF v_opens IS NOT NULL AND now() < v_opens THEN
        v_result := 'fail';
        v_failed := 'window';
        v_message := 'registration.window.not_open';
      ELSIF v_closes IS NOT NULL AND now() > v_closes THEN
        v_result := 'fail';
        v_failed := 'window';
        v_message := 'registration.window.closed';
      ELSIF v_max IS NOT NULL THEN
        SELECT count(*) INTO v_count
          FROM core.registration_entry re
         WHERE re.athlete_profile_id = v_entry.athlete_profile_id
           AND re.event_id = v_entry.event_id
           AND re.status NOT IN ('cancelled','withdrawn','substituted');
        IF v_count > v_max THEN
          v_result := 'fail';
          v_failed := 'max_live_entries';
          v_message := 'registration.entry.limit_exceeded';
          v_detail := jsonb_build_object('have', v_count, 'max', v_max);
        END IF;
      END IF;
    END;
  END IF;

  INSERT INTO core.registration_policy_evaluation
    (entry_id, policy_version_id, result, failed_limit, message_key, detail)
  VALUES (p_entry_id, v_policy, v_result, v_failed, v_message, v_detail)
  RETURNING id INTO v_id;

  UPDATE core.registration_entry
     SET policy_version_id = v_policy
   WHERE id = p_entry_id AND policy_version_id IS NULL;

  RETURN v_id;
END $$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION core.evidence_requirements_for(uuid, uuid, uuid) TO app_rw;
GRANT EXECUTE ON FUNCTION core.policy_version_for_entry(uuid) TO app_rw;
GRANT EXECUTE ON FUNCTION core.evaluate_registration_policy(uuid, uuid) TO app_rw;

-- Down Migration

DROP FUNCTION IF EXISTS core.evaluate_registration_policy(uuid, uuid);
DROP FUNCTION IF EXISTS core.policy_version_for_entry(uuid);

DROP TRIGGER IF EXISTS entry_status_policy_guard ON core.entry_status_event;
DROP FUNCTION IF EXISTS core.entry_status_policy_guard();

DROP TRIGGER IF EXISTS entry_incompatibility_guard ON core.registration_entry;
DROP FUNCTION IF EXISTS core.entry_incompatibility_guard();

DROP TRIGGER IF EXISTS entry_limit_guard ON core.registration_entry;
DROP FUNCTION IF EXISTS core.entry_limit_guard();

DROP TRIGGER IF EXISTS roster_cardinality_guard ON core.roster_member;
DROP FUNCTION IF EXISTS core.roster_cardinality_guard();

DROP TABLE IF EXISTS core.registration_policy_evaluation;
ALTER TABLE core.registration_entry DROP COLUMN IF EXISTS policy_version_id;

DROP TRIGGER IF EXISTS registration_policy_incompatibility_frozen ON core.registration_policy_incompatibility;
DROP TRIGGER IF EXISTS registration_policy_roster_rule_frozen ON core.registration_policy_roster_rule;
DROP TRIGGER IF EXISTS registration_policy_transition_frozen ON core.registration_policy_transition;
DROP FUNCTION IF EXISTS core.policy_child_frozen();

DROP TABLE IF EXISTS core.registration_policy_incompatibility;
DROP TABLE IF EXISTS core.registration_policy_roster_rule;
DROP TABLE IF EXISTS core.registration_policy_transition;

DROP TRIGGER IF EXISTS registration_policy_version_no_rewrite ON core.registration_policy_version;
DROP FUNCTION IF EXISTS core.registration_policy_version_immutable();
DROP TABLE IF EXISTS core.registration_policy_version;
DROP TABLE IF EXISTS core.registration_policy_set;

DROP VIEW IF EXISTS restricted.evidence_outstanding;
ALTER TABLE restricted.evidence_document
  ADD COLUMN status text NOT NULL DEFAULT 'required',
  ADD COLUMN s3_key text,
  ADD COLUMN scan_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN expires_on date,
  ADD COLUMN reviewed_by uuid,
  ADD COLUMN reviewed_at timestamptz;
ALTER TABLE restricted.access_log DROP COLUMN IF EXISTS upload_id;
DROP TABLE IF EXISTS restricted.evidence_waiver;
DROP TABLE IF EXISTS restricted.evidence_review;
DROP TRIGGER IF EXISTS restricted_evidence_upload_no_rewrite ON restricted.evidence_upload;
DROP FUNCTION IF EXISTS restricted.evidence_upload_immutable();
DROP TABLE IF EXISTS restricted.evidence_upload;
DROP TABLE IF EXISTS restricted.evidence_document_application;
ALTER TABLE restricted.evidence_document
  DROP CONSTRAINT IF EXISTS restricted_evidence_requirement_fk,
  DROP COLUMN IF EXISTS classification,
  DROP COLUMN IF EXISTS requirement_set_id,
  DROP COLUMN IF EXISTS event_id,
  ALTER COLUMN entry_id SET NOT NULL;

DROP VIEW IF EXISTS core.evidence_document;
DROP VIEW IF EXISTS core.evidence_outstanding;

CREATE TABLE core.evidence_document (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  entry_id         uuid NOT NULL REFERENCES core.registration_entry(id),
  kind             text NOT NULL,
  status           text NOT NULL DEFAULT 'required',
  s3_key           text,
  mime_type        text,
  size_bytes       bigint,
  checksum         text,
  scan_status      text NOT NULL DEFAULT 'pending'
                     CHECK (scan_status IN ('pending','clean','infected')),
  uploaded_at      timestamptz,
  reviewed_by      uuid REFERENCES core.person(id),
  reviewed_at      timestamptz,
  rejection_reason text
);
CREATE INDEX evidence_by_entry ON core.evidence_document (entry_id);
CREATE INDEX evidence_in_review ON core.evidence_document (status) WHERE status = 'under_review';

DROP FUNCTION IF EXISTS core.evidence_requirements_for(uuid, uuid, uuid);

DROP TABLE IF EXISTS core.evidence_waiver;
DROP TABLE IF EXISTS core.evidence_review;
DROP TRIGGER IF EXISTS evidence_upload_format_guard ON core.evidence_upload;
DROP FUNCTION IF EXISTS core.evidence_upload_format_guard();
DROP TRIGGER IF EXISTS evidence_upload_no_rewrite ON core.evidence_upload;
DROP FUNCTION IF EXISTS core.evidence_upload_immutable();
DROP TABLE IF EXISTS core.evidence_upload;
DROP TABLE IF EXISTS core.evidence_obligation_application;
DROP TABLE IF EXISTS core.evidence_obligation;

DROP TRIGGER IF EXISTS evidence_requirement_translation_frozen ON core.evidence_requirement_translation;
DROP TRIGGER IF EXISTS evidence_requirement_applicability_frozen ON core.evidence_requirement_applicability;
DROP FUNCTION IF EXISTS core.requirement_child_frozen();
DROP TABLE IF EXISTS core.evidence_requirement_translation;
DROP TABLE IF EXISTS core.evidence_requirement_applicability;

DROP TRIGGER IF EXISTS evidence_requirement_version_no_rewrite ON core.evidence_requirement_version;
DROP FUNCTION IF EXISTS core.evidence_requirement_version_immutable();
REVOKE SELECT ON core.evidence_requirement_version FROM restricted_rw;
DROP TABLE IF EXISTS core.evidence_requirement_version;
REVOKE SELECT ON core.evidence_requirement_set FROM restricted_rw;
DROP TABLE IF EXISTS core.evidence_requirement_set;

DROP TABLE IF EXISTS core.translation;
