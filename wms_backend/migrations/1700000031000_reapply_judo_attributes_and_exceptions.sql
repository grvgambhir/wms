-- Up Migration
-- The preceding migration was applied by an early local environment before it carried its
-- required SQL direction marker. This idempotent follow-up makes deployed databases match the
-- corrected migration while clean databases simply confirm the same shape.

INSERT INTO core.attribute_type
  (name, value_kind, unit, scale, allowed_codes, requires_verification)
VALUES ('federation_licence', 'enum', NULL, 0, ARRAY['active'], true)
ON CONFLICT (name) DO NOTHING;

UPDATE core.attribute_type
   SET allowed_codes = ARRAY['2kyu','1kyu','1dan','2dan','3dan','4dan','5dan']
 WHERE name = 'belt_rank';

ALTER TABLE core.rule_eligibility DROP CONSTRAINT IF EXISTS rule_eligibility_predicate_check;
ALTER TABLE core.rule_eligibility ADD CONSTRAINT rule_eligibility_predicate_check
  CHECK (predicate IN ('min_age','max_age','federation_member','licence_valid',
                       'class_not_expired','grade_in','attribute_in','attribute_range','not_in_list'));

ALTER TABLE core.evidence_upload
  ADD COLUMN IF NOT EXISTS declared_attributes jsonb NOT NULL DEFAULT '[]'::jsonb;

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

ALTER TABLE ops.exception_case ADD COLUMN IF NOT EXISTS reason_keys text[] NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS exception_case_one_live_refusal
  ON ops.exception_case (entry_id, rule_version_id)
  WHERE entry_id IS NOT NULL AND status IN ('pending', 'approved');

-- Down Migration
