-- Up Migration

-- F08: restricted data is a boundary, not a label.
--
-- The schema/role split already works: app_rw cannot read restricted.*, and
-- there is no FK from core into it. This migration does not reopen that. What
-- was missing is everything *around* the boundary:
--
-- 1. Classification *sources* stay in restricted. The desk still needs
--    "para class S6, verified" without the medical certificate. That is an
--    authorised redacted projection, granted to classification_ro — not a
--    column on an ordinary table (the plan's entrant_attribute.evidence_id
--    pointing at core.evidence_document is the defect; that table is not
--    added here).
-- 2. A para fact must cite supporting evidence without granting contents.
--    core.protected_evidence_ref is the existence record; the bytes stay
--    in restricted.evidence_document with no join path from core.
-- 3. Lawful basis is a dictionary + a real consent/notice row, not a
--    free-text default. A legal hold survives retain_until.
-- 4. PRV-05 rights requests record the search across every component and
--    the completion evidence. The component list is the in-scope systems
--    (this database, both S3 buckets, the IdP, the PSP, the mail provider)
--    — naming them is the deliverable; searching them is not this schema.
--
-- ACS-05: accommodation_need is stored separately from classification, with
-- an operational reporting view that withholds the medical narrative.

DO $$ BEGIN CREATE ROLE classification_ro NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN CREATE ROLE accommodation_ro NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT USAGE ON SCHEMA core TO classification_ro, accommodation_ro;

DO $$ BEGIN
  EXECUTE format('GRANT classification_ro TO %I', current_user);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  EXECUTE format('GRANT accommodation_ro TO %I', current_user);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE core.lawful_basis (
  code        text PRIMARY KEY,
  message_key text NOT NULL
);

INSERT INTO core.lawful_basis (code, message_key) VALUES
  ('explicit_consent',      'privacy.basis.explicit_consent'),
  ('contract',              'privacy.basis.contract'),
  ('legal_obligation',     'privacy.basis.legal_obligation'),
  ('vital_interest',        'privacy.basis.vital_interest'),
  ('public_task',           'privacy.basis.public_task'),
  ('legitimate_interest',  'privacy.basis.legitimate_interest');

-- Approved notice artefacts. Binding a restricted row to "explicit_consent"
-- is empty unless we can name *which* notice they agreed to, at which version.
CREATE TABLE core.privacy_notice (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id     uuid REFERENCES core.event(id),
  code         text NOT NULL,                   -- 'sensitive_processing'
  version_no   integer NOT NULL CHECK (version_no > 0),
  status       text NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','approved','superseded')),
  message_key  text NOT NULL,
  approved_by  uuid REFERENCES core.person(id),
  approved_at  timestamptz,
  UNIQUE NULLS NOT DISTINCT (event_id, code, version_no),
  CONSTRAINT privacy_notice_approved_has_approver
    CHECK (status = 'draft' OR approved_by IS NOT NULL)
);

CREATE FUNCTION core.privacy_notice_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'draft' THEN
    IF NEW.status = 'draft' THEN
      RAISE EXCEPTION 'cannot return an approved privacy notice to draft';
    END IF;
    IF (NEW.event_id, NEW.code, NEW.version_no, NEW.message_key)
       IS DISTINCT FROM
       (OLD.event_id, OLD.code, OLD.version_no, OLD.message_key) THEN
      RAISE EXCEPTION
        'privacy notice % is frozen; publish a new version', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER privacy_notice_no_rewrite
  BEFORE UPDATE ON core.privacy_notice
  FOR EACH ROW EXECUTE FUNCTION core.privacy_notice_immutable();

REVOKE DELETE ON core.privacy_notice FROM app_rw;

-- Existing restricted rows keep their text basis; the dictionary is now the
-- only legal value. Dropping the default is the point: a new row must name
-- a real code, not inherit "explicit_consent" by silence.
ALTER TABLE restricted.evidence_document
  ALTER COLUMN lawful_basis DROP DEFAULT,
  ADD COLUMN consent_id uuid,
  ADD COLUMN notice_id uuid,
  ADD CONSTRAINT restricted_evidence_basis_fk
    FOREIGN KEY (lawful_basis) REFERENCES core.lawful_basis(code);

ALTER TABLE restricted.identity_document
  ADD COLUMN consent_id uuid,
  ADD COLUMN notice_id uuid,
  ADD CONSTRAINT restricted_identity_basis_fk
    FOREIGN KEY (lawful_basis) REFERENCES core.lawful_basis(code);

-- Existence without contents. A general reader can see that a para
-- certificate exists; they cannot follow this uuid into restricted.
CREATE TABLE core.protected_evidence_ref (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id            uuid NOT NULL REFERENCES core.person(id),
  event_id             uuid NOT NULL REFERENCES core.event(id),
  kind                 text NOT NULL
                         CHECK (kind IN ('medical_certificate','para_classification','identity')),
  restricted_record_id uuid NOT NULL,           -- no FK: no join path
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, event_id, kind, restricted_record_id)
);
CREATE INDEX protected_evidence_ref_by_person
  ON core.protected_evidence_ref (person_id, event_id);

-- The classification SOURCE. Class code and verification live here, behind
-- restricted_rw. The operational projection below is what the desk reads.
CREATE TABLE restricted.classification_fact (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id               uuid NOT NULL,
  person_id              uuid NOT NULL,
  sport_code             text,
  class_code             text NOT NULL,        -- 'S6'
  verification_status     text NOT NULL
                           CHECK (verification_status IN ('declared','verified','rejected','expired')),
  supporting_document_id uuid REFERENCES restricted.evidence_document(id),
  protected_evidence_id  uuid,                  -- core.protected_evidence_ref.id, no FK
  consent_id             uuid NOT NULL,        -- core.consent.id, no FK
  notice_id              uuid,                  -- core.privacy_notice.id, no FK
  lawful_basis           text NOT NULL REFERENCES core.lawful_basis(code),
  retain_until           date NOT NULL,
  recorded_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX classification_fact_by_person
  ON restricted.classification_fact (person_id, event_id);

CREATE FUNCTION restricted.classification_requires_consent() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM core.consent c
     WHERE c.id = NEW.consent_id
       AND c.person_id = NEW.person_id
       AND c.granted
  ) THEN
    RAISE EXCEPTION 'privacy.consent.required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.notice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM core.privacy_notice n
     WHERE n.id = NEW.notice_id
       AND n.status IN ('approved','superseded')
  ) THEN
    RAISE EXCEPTION 'privacy.notice.unapproved'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = core, pg_temp;

CREATE TRIGGER classification_requires_consent
  BEFORE INSERT OR UPDATE OF consent_id, notice_id, person_id
  ON restricted.classification_fact
  FOR EACH ROW EXECUTE FUNCTION restricted.classification_requires_consent();

REVOKE ALL ON restricted.classification_fact FROM app_rw, reporting_ro, PUBLIC;

-- Releases class + verification + "a supporting document exists". Withholds
-- the document, consent row, notice, basis, retention, issuer notes.
CREATE VIEW core.para_class_projection AS
SELECT
  f.person_id,
  f.event_id,
  f.sport_code,
  f.class_code,
  f.verification_status,
  (f.supporting_document_id IS NOT NULL OR f.protected_evidence_id IS NOT NULL)
    AS evidence_exists
FROM restricted.classification_fact f;

ALTER VIEW core.para_class_projection SET (security_invoker = false);
REVOKE ALL ON core.para_class_projection FROM app_rw, reporting_ro, PUBLIC;
GRANT SELECT ON core.para_class_projection TO classification_ro;

-- ACS-05: stored separately from sport class, with its own consent and
-- retention. Deliberately not an entrant_attribute — that would feed it to
-- rule_dimension as a categorisation input.
CREATE TABLE restricted.accommodation_need (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id            uuid NOT NULL,
  person_id           uuid NOT NULL,
  category            text NOT NULL
                        CHECK (category IN ('mobility','sensory','cognitive',
                                            'dietary','medical','companion','other')),
  detail              text,                     -- withheld from the operational view
  companion_person_id uuid,
  consent_id          uuid NOT NULL,
  notice_id           uuid,
  lawful_basis        text NOT NULL REFERENCES core.lawful_basis(code),
  valid_until         date,
  retain_until        date NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX accommodation_need_by_person ON restricted.accommodation_need (person_id, event_id);
REVOKE ALL ON restricted.accommodation_need FROM app_rw, reporting_ro, PUBLIC;

CREATE FUNCTION restricted.accommodation_requires_consent() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM core.consent c
     WHERE c.id = NEW.consent_id
       AND c.person_id = NEW.person_id
       AND c.granted
  ) THEN
    RAISE EXCEPTION 'privacy.consent.required'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = core, pg_temp;

CREATE TRIGGER accommodation_requires_consent
  BEFORE INSERT OR UPDATE OF consent_id, person_id
  ON restricted.accommodation_need
  FOR EACH ROW EXECUTE FUNCTION restricted.accommodation_requires_consent();

-- Operational path for authorised OC venue/access teams. Category and
-- companion are usable at a gate; detail is the medical narrative and stays
-- behind restricted_rw.
CREATE VIEW core.accommodation_operational AS
SELECT
  n.id,
  n.event_id,
  n.person_id,
  n.category,
  n.companion_person_id,
  (n.companion_person_id IS NOT NULL) AS companion_needed,
  n.valid_until
FROM restricted.accommodation_need n;

ALTER VIEW core.accommodation_operational SET (security_invoker = false);
REVOKE ALL ON core.accommodation_operational FROM app_rw, reporting_ro, PUBLIC;
GRANT SELECT ON core.accommodation_operational TO accommodation_ro;

-- A hold must survive a retention date. Person-level (subject_id NULL)
-- blocks every restricted row for that person; record-level names one id.
CREATE TABLE core.retention_hold (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id      uuid NOT NULL REFERENCES core.person(id),
  subject_schema text NOT NULL DEFAULT 'restricted'
                   CHECK (subject_schema IN ('core','restricted')),
  subject_table  text,
  subject_id     uuid,
  reason_key     text NOT NULL,
  placed_by      uuid NOT NULL REFERENCES core.person(id),
  placed_at      timestamptz NOT NULL DEFAULT now(),
  released_at    timestamptz
);
CREATE UNIQUE INDEX retention_hold_live
  ON core.retention_hold (person_id, subject_schema, subject_table, subject_id)
  NULLS NOT DISTINCT
  WHERE released_at IS NULL;

CREATE FUNCTION restricted.retention_hold_blocks_delete() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM core.retention_hold h
     WHERE h.released_at IS NULL
       AND h.person_id = OLD.person_id
       AND h.subject_schema = 'restricted'
       AND (h.subject_id IS NULL OR h.subject_id = OLD.id)
       AND (h.subject_table IS NULL OR h.subject_table = TG_TABLE_NAME)
  ) THEN
    RAISE EXCEPTION 'privacy.retention.hold_active'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = core, pg_temp;

CREATE TRIGGER evidence_document_hold
  BEFORE DELETE ON restricted.evidence_document
  FOR EACH ROW EXECUTE FUNCTION restricted.retention_hold_blocks_delete();

CREATE TRIGGER identity_document_hold
  BEFORE DELETE ON restricted.identity_document
  FOR EACH ROW EXECUTE FUNCTION restricted.retention_hold_blocks_delete();

CREATE TRIGGER classification_fact_hold
  BEFORE DELETE ON restricted.classification_fact
  FOR EACH ROW EXECUTE FUNCTION restricted.retention_hold_blocks_delete();

CREATE TRIGGER accommodation_need_hold
  BEFORE DELETE ON restricted.accommodation_need
  FOR EACH ROW EXECUTE FUNCTION restricted.retention_hold_blocks_delete();

-- PRV-05: the request, the components searched, the completion record.
-- Component names are the in-scope systems, not a wish-list.
CREATE TABLE core.rights_request (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id    uuid NOT NULL REFERENCES core.person(id),
  event_id     uuid REFERENCES core.event(id),
  kind          text NOT NULL
                 CHECK (kind IN ('access','erasure','rectification',
                                 'restriction','portability','objection')),
  status       text NOT NULL DEFAULT 'received'
                 CHECK (status IN ('received','in_progress','completed','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid REFERENCES core.person(id),
  message_key  text NOT NULL
);
CREATE INDEX rights_request_by_person ON core.rights_request (person_id, requested_at DESC);

CREATE TABLE core.rights_request_component (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  request_id   uuid NOT NULL REFERENCES core.rights_request(id) ON DELETE CASCADE,
  -- postgres_core / postgres_restricted: this cluster.
  -- s3_ordinary / s3_restricted: object store + KMS keys (PRV-04).
  -- idp: identity provider (D5 unmade; still in scope for a rights search).
  -- psp: payment service provider (intents, PAN tokens — we do not hold PAN).
  -- mail_provider: transactional/marketing mailbox (F09 models the boundary).
  component    text NOT NULL
                 CHECK (component IN (
                   'postgres_core','postgres_restricted',
                   's3_ordinary','s3_restricted',
                   'idp','psp','mail_provider'
                 )),
  searched_at  timestamptz,
  found        boolean,
  result_key   text,                            -- i18n
  UNIQUE (request_id, component)
);

CREATE TABLE core.rights_request_completion (
  request_id      uuid PRIMARY KEY REFERENCES core.rights_request(id),
  completed_by    uuid NOT NULL REFERENCES core.person(id),
  completed_at    timestamptz NOT NULL DEFAULT now(),
  evidence_s3_key text,                         -- documented completion evidence
  message_key     text NOT NULL
);
REVOKE UPDATE, DELETE ON core.rights_request_completion FROM app_rw;

-- Down Migration

DROP TABLE IF EXISTS core.rights_request_completion;
DROP TABLE IF EXISTS core.rights_request_component;
DROP TABLE IF EXISTS core.rights_request;

DROP TRIGGER IF EXISTS accommodation_need_hold ON restricted.accommodation_need;
DROP TRIGGER IF EXISTS classification_fact_hold ON restricted.classification_fact;
DROP TRIGGER IF EXISTS identity_document_hold ON restricted.identity_document;
DROP TRIGGER IF EXISTS evidence_document_hold ON restricted.evidence_document;
DROP FUNCTION IF EXISTS restricted.retention_hold_blocks_delete();
DROP TABLE IF EXISTS core.retention_hold;

DROP VIEW IF EXISTS core.accommodation_operational;
DROP TRIGGER IF EXISTS accommodation_requires_consent ON restricted.accommodation_need;
DROP FUNCTION IF EXISTS restricted.accommodation_requires_consent();
DROP TABLE IF EXISTS restricted.accommodation_need;

DROP VIEW IF EXISTS core.para_class_projection;
DROP TRIGGER IF EXISTS classification_requires_consent ON restricted.classification_fact;
DROP FUNCTION IF EXISTS restricted.classification_requires_consent();
DROP TABLE IF EXISTS restricted.classification_fact;
DROP TABLE IF EXISTS core.protected_evidence_ref;

ALTER TABLE restricted.identity_document
  DROP CONSTRAINT IF EXISTS restricted_identity_basis_fk,
  DROP COLUMN IF EXISTS notice_id,
  DROP COLUMN IF EXISTS consent_id;

ALTER TABLE restricted.evidence_document
  DROP CONSTRAINT IF EXISTS restricted_evidence_basis_fk,
  DROP COLUMN IF EXISTS notice_id,
  DROP COLUMN IF EXISTS consent_id,
  ALTER COLUMN lawful_basis SET DEFAULT 'explicit_consent';

DROP TRIGGER IF EXISTS privacy_notice_no_rewrite ON core.privacy_notice;
DROP FUNCTION IF EXISTS core.privacy_notice_immutable();
DROP TABLE IF EXISTS core.privacy_notice;
DROP TABLE IF EXISTS core.lawful_basis;

REVOKE USAGE ON SCHEMA core FROM classification_ro, accommodation_ro;

DO $$ BEGIN
  EXECUTE format('REVOKE classification_ro FROM %I', current_user);
EXCEPTION WHEN undefined_object THEN NULL;
         WHEN invalid_grant_operation THEN NULL;
END $$;
DO $$ BEGIN
  EXECUTE format('REVOKE accommodation_ro FROM %I', current_user);
EXCEPTION WHEN undefined_object THEN NULL;
         WHEN invalid_grant_operation THEN NULL;
END $$;

DO $$ BEGIN
  DROP ROLE classification_ro;
EXCEPTION WHEN undefined_object THEN NULL;
         WHEN dependent_objects_still_exist THEN NULL;
END $$;
DO $$ BEGIN
  DROP ROLE accommodation_ro;
EXCEPTION WHEN undefined_object THEN NULL;
         WHEN dependent_objects_still_exist THEN NULL;
END $$;
