-- Up Migration
-- RFP §9.3 scenario 4: Judo facts are evidence-backed and a refused entry can use
-- the existing RUL-06 exception queue.  There is deliberately no second exception table.

INSERT INTO core.attribute_type
  (name, value_kind, unit, scale, allowed_codes, requires_verification)
VALUES
  ('federation_licence', 'enum', NULL, 0, ARRAY['active'], true)
ON CONFLICT (name) DO NOTHING;

UPDATE core.attribute_type
   SET allowed_codes = ARRAY['2kyu','1kyu','1dan','2dan','3dan','4dan','5dan']
 WHERE name = 'belt_rank';

ALTER TABLE core.rule_eligibility
  DROP CONSTRAINT IF EXISTS rule_eligibility_predicate_check;
ALTER TABLE core.rule_eligibility
  ADD CONSTRAINT rule_eligibility_predicate_check
  CHECK (predicate IN ('min_age','max_age','federation_member','licence_valid',
                       'class_not_expired','grade_in','attribute_in','attribute_range','not_in_list'));

-- The declaration belongs to the immutable upload version.  It is not a fact yet: only an
-- OC approval below can materialise it as a verified `entrant_attribute`.
ALTER TABLE core.evidence_upload
  ADD COLUMN declared_attributes jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION core.evidence_upload_immutable() RETURNS trigger AS $$
BEGIN
  IF (NEW.obligation_id, NEW.version_no, NEW.role, NEW.s3_key, NEW.s3_object_version,
      NEW.mime_type, NEW.size_bytes, NEW.checksum, NEW.issuing_country,
      NEW.issued_on, NEW.expires_on, NEW.original_file_name, NEW.declared_attributes)
     IS DISTINCT FROM
     (OLD.obligation_id, OLD.version_no, OLD.role, OLD.s3_key, OLD.s3_object_version,
      OLD.mime_type, OLD.size_bytes, OLD.checksum, OLD.issuing_country,
      OLD.issued_on, OLD.expires_on, OLD.original_file_name, OLD.declared_attributes) THEN
    RAISE EXCEPTION 'evidence upload content is immutable; insert a new version instead';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

ALTER TABLE ops.exception_case
  ADD COLUMN reason_keys text[] NOT NULL DEFAULT '{}';

-- One unresolved refusal for an entry/rule version is enough.  Rejected requests may be
-- resubmitted after the athlete supplies new evidence; a pending/approved duplicate may not.
CREATE UNIQUE INDEX exception_case_one_live_refusal
  ON ops.exception_case (entry_id, rule_version_id)
  WHERE entry_id IS NOT NULL AND status IN ('pending', 'approved');

-- Down Migration

DROP INDEX IF EXISTS ops.exception_case_one_live_refusal;
ALTER TABLE ops.exception_case DROP COLUMN IF EXISTS reason_keys;
ALTER TABLE core.evidence_upload DROP COLUMN IF EXISTS declared_attributes;
ALTER TABLE core.rule_eligibility DROP CONSTRAINT IF EXISTS rule_eligibility_predicate_check;
ALTER TABLE core.rule_eligibility
  ADD CONSTRAINT rule_eligibility_predicate_check
  CHECK (predicate IN ('min_age','max_age','federation_member','licence_valid',
                       'class_not_expired','grade_in','attribute_in','not_in_list'));
DELETE FROM core.attribute_type WHERE name = 'federation_licence';
