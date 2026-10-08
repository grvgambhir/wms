-- Up Migration
-- Follow-on to ops.exception_* (RUL-06 already has UNIQUE (case_id, signer_id)) and
-- OPS-02 audience-as-data. Do not invent a second exception queue.

ALTER TABLE ops.exception_case
  ADD COLUMN IF NOT EXISTS rule_version_id uuid REFERENCES core.rule_version(id);

DO $$ BEGIN
  ALTER TABLE ops.exception_case
    ADD CONSTRAINT exception_case_status
      CHECK (status IN ('pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE ops.exception_signature
  ADD COLUMN IF NOT EXISTS message_key text;

DO $$ BEGIN
  ALTER TABLE ops.exception_signature
    ADD CONSTRAINT exception_reject_has_message_key
      CHECK (
        decision = 'approve'
        OR (message_key IS NOT NULL AND message_key ~ '^[a-z][a-z0-9._]*$')
      );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE ops.exception_signature
  DROP CONSTRAINT IF EXISTS exception_signature_case_id_signer_id_key;

DO $$ BEGIN
  ALTER TABLE ops.exception_signature
    ADD CONSTRAINT exception_one_signature_per_person UNIQUE (case_id, signer_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ops.exception_signature
    ADD CONSTRAINT exception_signature_signer_fk
      FOREIGN KEY (signer_id) REFERENCES core.person(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS core.comms_audience (
  id        uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id  uuid NOT NULL REFERENCES core.event(id),
  code      text NOT NULL,
  name_key  text NOT NULL,
  filter    jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (event_id, code),
  CONSTRAINT comms_audience_code CHECK (code ~ '^[a-z0-9-]+$'),
  CONSTRAINT comms_audience_name_key CHECK (name_key ~ '^[a-z][a-z0-9._]*$')
);

-- Down Migration

DROP TABLE IF EXISTS core.comms_audience;

ALTER TABLE ops.exception_signature
  DROP CONSTRAINT IF EXISTS exception_signature_signer_fk;
ALTER TABLE ops.exception_signature
  DROP CONSTRAINT IF EXISTS exception_one_signature_per_person;
ALTER TABLE ops.exception_signature
  DROP CONSTRAINT IF EXISTS exception_reject_has_message_key;
ALTER TABLE ops.exception_signature
  DROP COLUMN IF EXISTS message_key;
ALTER TABLE ops.exception_signature
  ADD CONSTRAINT exception_signature_case_id_signer_id_key UNIQUE (case_id, signer_id);

ALTER TABLE ops.exception_case
  DROP CONSTRAINT IF EXISTS exception_case_status;
ALTER TABLE ops.exception_case
  DROP COLUMN IF EXISTS rule_version_id;
