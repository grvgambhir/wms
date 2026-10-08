-- Up Migration

-- The quota-pool replacement accidentally changed the name consumed by the HTTP error
-- contract. Keep the database as the final oversell guard and restore the stable name so
-- a race is returned as 409 QUOTA_FULL rather than a generic rule violation.
ALTER TABLE core.quota_pool
  RENAME CONSTRAINT pool_not_exceeded TO quota_not_exceeded;

-- The original waitlist CHECK covered only the vocabulary. These are the state facts the
-- mutation writer relies on: an offer always has an expiry, and an eligible row has not
-- joined the queue yet.
ALTER TABLE core.waitlist_entry
  ADD CONSTRAINT waitlist_state_fields_consistent CHECK (
    (status = 'eligible'
      AND position IS NULL AND joined_at IS NULL AND offer_expires_at IS NULL)
    OR
    (status = 'waiting'
      AND position IS NOT NULL AND joined_at IS NOT NULL AND offer_expires_at IS NULL)
    OR
    (status = 'offered'
      AND position IS NOT NULL AND joined_at IS NOT NULL AND offer_expires_at IS NOT NULL)
    OR
    (status IN ('claimed', 'expired')
      AND position IS NOT NULL AND joined_at IS NOT NULL AND offer_expires_at IS NULL)
  );

-- REG-11's configured policy may narrow this baseline, but an entry without a published
-- policy must still be guarded by PostgreSQL. Keeping the fallback as data makes the table
-- in @wms/domain and the database independently reviewable.
CREATE TABLE core.entry_status_transition (
  from_status text NOT NULL,
  to_status   text NOT NULL,
  actor_kind  text NOT NULL CHECK (actor_kind IN ('participant','admin','system')),
  action      text NOT NULL,
  PRIMARY KEY (from_status, to_status, actor_kind)
);

INSERT INTO core.entry_status_transition (from_status, to_status, actor_kind, action) VALUES
  ('draft',            'pending_evidence', 'system',      'submit_evidence'),
  ('draft',            'pending_team',     'system',      'submit_team'),
  ('draft',            'pending_payment',  'system',      'submit'),
  ('draft',            'waitlisted',       'system',      'waitlist'),
  ('draft',            'withdrawn',        'participant', 'withdraw'),
  ('draft',            'cancelled',        'admin',       'cancel'),
  ('pending_evidence', 'pending_payment',  'system',      'evidence_approved'),
  ('pending_evidence', 'draft',            'system',      'reconfigure'),
  ('pending_evidence', 'withdrawn',        'participant', 'withdraw'),
  ('pending_evidence', 'cancelled',        'admin',       'cancel'),
  ('pending_team',     'pending_payment',  'system',      'team_complete'),
  ('pending_team',     'draft',            'system',      'reconfigure'),
  ('pending_team',     'substituted',      'admin',       'substitute'),
  ('pending_team',     'withdrawn',        'participant', 'withdraw'),
  ('pending_team',     'cancelled',        'admin',       'cancel'),
  ('pending_payment',  'confirmed',        'system',      'paid'),
  ('pending_payment',  'waitlisted',       'system',      'waitlist'),
  ('pending_payment',  'pending_evidence', 'system',      'evidence_rejected'),
  ('pending_payment',  'draft',            'system',      'reconfigure'),
  ('pending_payment',  'withdrawn',        'participant', 'withdraw'),
  ('pending_payment',  'cancelled',        'admin',       'cancel'),
  ('waitlisted',       'pending_payment',  'system',      'offer_claimed'),
  ('waitlisted',       'draft',            'system',      'reconfigure'),
  ('waitlisted',       'withdrawn',        'participant', 'withdraw'),
  ('waitlisted',       'cancelled',        'admin',       'cancel'),
  ('confirmed',        'withdrawn',        'participant', 'withdraw'),
  ('confirmed',        'substituted',      'admin',       'substitute'),
  ('confirmed',        'disqualified',     'admin',       'disqualify'),
  ('confirmed',        'cancelled',        'admin',       'cancel'),
  ('cancelled',        'draft',            'admin',       'reinstate'),
  ('substituted',      'draft',            'admin',       'reinstate'),
  ('withdrawn',        'draft',            'admin',       'reinstate'),
  ('disqualified',     'confirmed',        'admin',       'reinstate');

CREATE OR REPLACE FUNCTION core.entry_status_policy_guard() RETURNS trigger AS $$
DECLARE
  v_policy uuid;
  v_current text;
  v_ok boolean;
BEGIN
  SELECT policy_version_id, status INTO v_policy, v_current
    FROM core.registration_entry
   WHERE id = NEW.entry_id
   FOR UPDATE;

  -- Creation of the first audit event is not a transition.
  IF NEW.from_status IS NULL THEN
    IF NEW.to_status IS NOT DISTINCT FROM v_current
       AND NOT EXISTS (SELECT 1 FROM core.entry_status_event WHERE entry_id = NEW.entry_id) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'registration.transition.invalid_initial_event'
      USING ERRCODE = '23514', CONSTRAINT = 'entry_status_transition_allowed';
  END IF;

  -- The event must describe the row it is changing. Without this comparison a caller can
  -- forge a legal edge from another state and then update the entry to an illegal target.
  IF NEW.from_status IS DISTINCT FROM v_current THEN
    RAISE EXCEPTION 'registration.transition.stale_from_status'
      USING ERRCODE = '23514', CONSTRAINT = 'entry_status_transition_allowed';
  END IF;

  IF v_policy IS NOT NULL AND EXISTS (
       SELECT 1 FROM core.registration_policy_transition t
        WHERE t.policy_version_id = v_policy) THEN
    SELECT true INTO v_ok
      FROM core.registration_policy_transition t
     WHERE t.policy_version_id = v_policy
       AND t.from_status = NEW.from_status
       AND t.to_status = NEW.to_status
       AND t.actor_kind = NEW.actor_kind;
  ELSE
    SELECT true INTO v_ok
      FROM core.entry_status_transition t
     WHERE t.from_status = NEW.from_status
       AND t.to_status = NEW.to_status
       AND t.actor_kind = NEW.actor_kind;
  END IF;

  IF v_ok IS NULL THEN
    RAISE EXCEPTION 'registration.transition.not_permitted'
      USING ERRCODE = '23514', CONSTRAINT = 'entry_status_transition_allowed';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- The domain payment response needs the provider/idempotency facts, and reconciliation
-- needs to locate the exact intent created before the provider call.
ALTER TABLE core.payment_intent
  ADD COLUMN payment_method text NOT NULL DEFAULT 'card'
    CHECK (payment_method IN ('card')),
  ADD COLUMN idempotency_scope text,
  ADD COLUMN idempotency_key text,
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN charge_count integer NOT NULL DEFAULT 0 CHECK (charge_count >= 0),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT payment_intent_idempotency_pair CHECK (
    (idempotency_scope IS NULL) = (idempotency_key IS NULL)
  );
CREATE UNIQUE INDEX payment_intent_idempotency
  ON core.payment_intent (idempotency_scope, idempotency_key)
  WHERE idempotency_scope IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS core.payment_intent_idempotency;
ALTER TABLE core.payment_intent
  DROP CONSTRAINT IF EXISTS payment_intent_idempotency_pair,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS charge_count,
  DROP COLUMN IF EXISTS attempt_count,
  DROP COLUMN IF EXISTS idempotency_key,
  DROP COLUMN IF EXISTS idempotency_scope,
  DROP COLUMN IF EXISTS payment_method;

CREATE OR REPLACE FUNCTION core.entry_status_policy_guard() RETURNS trigger AS $$
DECLARE
  v_policy uuid;
  v_ok boolean;
BEGIN
  SELECT policy_version_id INTO v_policy
    FROM core.registration_entry WHERE id = NEW.entry_id;
  IF v_policy IS NULL OR NEW.from_status IS NULL THEN
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

DROP TABLE IF EXISTS core.entry_status_transition;
ALTER TABLE core.waitlist_entry
  DROP CONSTRAINT IF EXISTS waitlist_state_fields_consistent;
ALTER TABLE core.quota_pool
  RENAME CONSTRAINT quota_not_exceeded TO pool_not_exceeded;
