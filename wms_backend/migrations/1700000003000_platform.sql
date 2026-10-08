-- Up Migration

-- BACKEND_DB_PLAN.md §4.6 (idempotency), §4.7 (evidence + restricted), §4.10 (ops, audit).

-- SCOPED, not global. A bare `key PRIMARY KEY` lets one caller collide with another's key
-- and be handed THAT caller's stored response body — for a registration or a payment that
-- is a personal-data leak, not merely a correctness bug.
CREATE TABLE core.idempotency_key (
  scope           text NOT NULL,
  key             text NOT NULL,
  endpoint        text NOT NULL,
  request_hash    text NOT NULL,                    -- same key + different body must NOT replay
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
CREATE INDEX idempotency_reaper ON core.idempotency_key (created_at);
CREATE INDEX idempotency_stuck  ON core.idempotency_key (created_at) WHERE state = 'in_progress';

-- A document is downloadable only when scan_status = 'clean' (REG-10). The presign
-- endpoint refuses anything else, so an unscanned file is unreachable by construction
-- rather than by remembering to check.
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

-- ops
CREATE TABLE ops.exception_case (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id    uuid NOT NULL REFERENCES core.event(id),
  entry_id    uuid REFERENCES core.registration_entry(id),
  kind        text NOT NULL,
  impact      text NOT NULL CHECK (impact IN ('low','medium','high')),
  summary     text NOT NULL,
  status      text NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX exception_queue ON ops.exception_case (event_id, status, created_at DESC);

-- RUL-06. "Dual control without identity is theatre": one reviewer signing twice is now a
-- unique violation, so requiredSignatures() counts rows guaranteed to be distinct people.
CREATE TABLE ops.exception_signature (
  id        uuid PRIMARY KEY DEFAULT uuidv7(),
  case_id   uuid NOT NULL REFERENCES ops.exception_case(id),
  signer_id uuid NOT NULL,
  decision  text NOT NULL CHECK (decision IN ('approve','reject')),
  note      text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, signer_id)
);

-- audit — partitioned monthly; SEC-05 wants 12 months retained.
-- A partitioned table's PK MUST contain the partition key; `id` alone is rejected.
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
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

-- A partitioned parent holds no rows: with no partitions the first INSERT fails outright.
CREATE TABLE audit.activity_log_2026_09 PARTITION OF audit.activity_log
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE audit.activity_log_default PARTITION OF audit.activity_log DEFAULT;

-- REVOKE on the parent does NOT cascade to partitions — each is revoked as it is created.
REVOKE UPDATE, DELETE ON audit.activity_log, audit.activity_log_2026_09,
                          audit.activity_log_default FROM app_rw;

-- restricted — a PERMISSION boundary, not a code convention. Separate schema, separate
-- role, separate bucket/KMS key, and deliberately NO foreign key back to core: no
-- accidental join, and no SELECT * can drag Article 9 data into a general response.
CREATE TABLE restricted.evidence_document (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  entry_id      uuid NOT NULL,
  person_id     uuid NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('medical_certificate','para_classification')),
  status        text NOT NULL DEFAULT 'required',
  s3_key        text,
  scan_status   text NOT NULL DEFAULT 'pending',
  expires_on    date,
  lawful_basis  text NOT NULL DEFAULT 'explicit_consent',
  retain_until  date NOT NULL,                      -- Art. 9 data gets its own retention
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE restricted.access_log (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  document_id uuid NOT NULL REFERENCES restricted.evidence_document(id),
  actor_id    uuid NOT NULL,
  action      text NOT NULL CHECK (action IN ('view','download','decide')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  ip          inet
);
REVOKE UPDATE, DELETE ON restricted.access_log FROM restricted_rw;

-- Belt and braces over ALTER DEFAULT PRIVILEGES: the app role must not reach `restricted`
-- even if a future default privilege is set carelessly.
REVOKE ALL ON ALL TABLES IN SCHEMA restricted FROM app_rw, reporting_ro, PUBLIC;

-- Down Migration

DROP TABLE IF EXISTS restricted.access_log;
DROP TABLE IF EXISTS restricted.evidence_document;
DROP TABLE IF EXISTS audit.activity_log_default;
DROP TABLE IF EXISTS audit.activity_log_2026_09;
DROP TABLE IF EXISTS audit.activity_log;
DROP TABLE IF EXISTS ops.exception_signature;
DROP TABLE IF EXISTS ops.exception_case;
DROP TABLE IF EXISTS core.evidence_document;
DROP TABLE IF EXISTS core.idempotency_key;
