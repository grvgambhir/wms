-- Up Migration

-- F09: templates are not translated strings.
--
-- core.translation / core.locale give language variants of a string. OPS-01
-- asks for approved reusable templates with variables, preview, test send,
-- scheduling, throttling, unsubscribe/transactional classification and delivery
-- status. A catalogue of strings cannot freeze what was sent, refuse an
-- undeclared placeholder, or distinguish a marketing send from a
-- transactional one that must ignore unsubscribe.
--
-- WHY extend broadcast/delivery rather than replace them: those names already
-- mean "the send" and "per-recipient status" in the plan. They were specified
-- in §4.9 and never migrated, so this file creates them with the missing
-- contract (template pin, content snapshot, schedule, classification) rather
-- than introducing a second send log. A later template edit cannot rewrite a
-- snapshot — same principle as invoice_line. No mail/SMS provider is called;
-- delivery_attempt.provider is the named boundary.

CREATE TABLE core.comms_template (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id        uuid NOT NULL REFERENCES core.event(id),
  code            text NOT NULL,
  channel         text NOT NULL
                    CHECK (channel IN ('email','sms','inapp')),
  classification  text NOT NULL
                    CHECK (classification IN ('transactional','marketing')),
  name_key        text NOT NULL,                 -- i18n; never a sentence
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, code)
);

CREATE TABLE core.comms_template_version (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  template_id  uuid NOT NULL REFERENCES core.comms_template(id),
  version_no   integer NOT NULL CHECK (version_no > 0),
  status       text NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','approved','superseded')),
  approved_by  uuid REFERENCES core.person(id),
  approved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_no),
  CONSTRAINT comms_template_approved_has_approver
    CHECK (status = 'draft' OR approved_by IS NOT NULL)
);

CREATE FUNCTION core.comms_template_version_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'draft' THEN
    IF NEW.status = 'draft' THEN
      RAISE EXCEPTION 'cannot return an approved template to draft';
    END IF;
    IF (NEW.template_id, NEW.version_no)
       IS DISTINCT FROM
       (OLD.template_id, OLD.version_no) THEN
      RAISE EXCEPTION
        'comms template version % is frozen; publish a new version', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER comms_template_version_no_rewrite
  BEFORE UPDATE ON core.comms_template_version
  FOR EACH ROW EXECUTE FUNCTION core.comms_template_version_immutable();

REVOKE DELETE ON core.comms_template_version FROM app_rw;

-- The variable contract. A send cannot reference a name that is not here,
-- and cannot omit a required one.
CREATE TABLE core.comms_template_variable (
  template_version_id uuid NOT NULL
                        REFERENCES core.comms_template_version(id) ON DELETE CASCADE,
  name                text NOT NULL
                        CHECK (name ~ '^[a-z][a-z0-9_]*$'),
  required            boolean NOT NULL DEFAULT false,
  PRIMARY KEY (template_version_id, name)
);

-- Locale copies hang off the version so EN/IT are not two templates.
CREATE TABLE core.comms_template_copy (
  template_version_id uuid NOT NULL
                        REFERENCES core.comms_template_version(id) ON DELETE CASCADE,
  locale              text NOT NULL REFERENCES core.locale(code),
  subject             text,
  body                text NOT NULL,
  PRIMARY KEY (template_version_id, locale)
);

CREATE FUNCTION core.comms_template_child_frozen() RETURNS trigger AS $$
DECLARE
  parent uuid := COALESCE(NEW.template_version_id, OLD.template_version_id);
  parent_status text;
BEGIN
  SELECT status INTO parent_status
    FROM core.comms_template_version WHERE id = parent;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION
      'comms template version % is % — its variables and copy are frozen; publish a new version',
      parent, parent_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

CREATE TRIGGER comms_template_variable_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON core.comms_template_variable
  FOR EACH ROW EXECUTE FUNCTION core.comms_template_child_frozen();

CREATE TRIGGER comms_template_copy_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON core.comms_template_copy
  FOR EACH ROW EXECUTE FUNCTION core.comms_template_child_frozen();

-- The send. subject_snapshot / body_snapshot are what the recipient was
-- actually given; re-translating the template later cannot change them.
CREATE TABLE core.broadcast (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id             uuid NOT NULL REFERENCES core.event(id),
  template_id          uuid REFERENCES core.comms_template(id),
  template_version_id  uuid REFERENCES core.comms_template_version(id),
  channel              text NOT NULL
                         CHECK (channel IN ('email','sms','inapp')),
  classification        text NOT NULL
                         CHECK (classification IN ('transactional','marketing')),
  audience             jsonb NOT NULL DEFAULT '{}',
  locale                text NOT NULL REFERENCES core.locale(code),
  subject_snapshot      text,
  body_snapshot         text NOT NULL,
  bindings             jsonb NOT NULL DEFAULT '{}',
  scheduled_for        timestamptz,           -- NULL = send now
  throttle_per_minute  integer
                         CHECK (throttle_per_minute IS NULL OR throttle_per_minute > 0),
  is_test              boolean NOT NULL DEFAULT false,
  status               text NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued','sending','sent','cancelled','failed')),
  sent_by              uuid NOT NULL REFERENCES core.person(id),
  sent_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_future_stays_queued
    CHECK (scheduled_for IS NULL OR status IN ('queued','cancelled','sending','sent','failed'))
);
CREATE INDEX broadcast_by_event ON core.broadcast (event_id, created_at DESC);
CREATE INDEX broadcast_queue ON core.broadcast (scheduled_for)
  WHERE status = 'queued' AND scheduled_for IS NOT NULL;

CREATE FUNCTION core.broadcast_variable_contract() RETURNS trigger AS $$
DECLARE
  v_status text;
  v_class text;
  v_channel text;
  ph text;
BEGIN
  IF NEW.template_version_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tv.status, t.classification, t.channel
    INTO v_status, v_class, v_channel
    FROM core.comms_template_version tv
    JOIN core.comms_template t ON t.id = tv.template_id
   WHERE tv.id = NEW.template_version_id;

  IF v_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'comms.template.unapproved'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.classification IS DISTINCT FROM v_class THEN
    RAISE EXCEPTION 'comms.template.classification_mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.channel IS DISTINCT FROM v_channel THEN
    RAISE EXCEPTION 'comms.template.channel_mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR ph IN
    SELECT DISTINCT m[1]
      FROM regexp_matches(
             COALESCE(NEW.subject_snapshot, '') || E'\n' || NEW.body_snapshot,
             '\{\{([a-z][a-z0-9_]*)\}\}',
             'g'
           ) AS m
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM core.comms_template_variable v
       WHERE v.template_version_id = NEW.template_version_id
         AND v.name = ph
    ) THEN
      RAISE EXCEPTION 'comms.template.undeclared_variable'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM jsonb_object_keys(NEW.bindings) AS k(var_name)
     WHERE NOT EXISTS (
       SELECT 1 FROM core.comms_template_variable v
        WHERE v.template_version_id = NEW.template_version_id
          AND v.name = k.var_name
     )
  ) THEN
    RAISE EXCEPTION 'comms.template.undeclared_variable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM core.comms_template_variable v
     WHERE v.template_version_id = NEW.template_version_id
       AND v.required
       AND NOT (NEW.bindings ? v.name)
  ) THEN
    RAISE EXCEPTION 'comms.template.required_variable'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER broadcast_variable_contract
  BEFORE INSERT OR UPDATE OF template_version_id, body_snapshot, subject_snapshot, bindings
  ON core.broadcast
  FOR EACH ROW EXECUTE FUNCTION core.broadcast_variable_contract();

CREATE FUNCTION core.broadcast_snapshot_frozen() RETURNS trigger AS $$
BEGIN
  IF (NEW.subject_snapshot, NEW.body_snapshot, NEW.template_version_id, NEW.bindings,
      NEW.classification, NEW.channel, NEW.locale)
     IS DISTINCT FROM
     (OLD.subject_snapshot, OLD.body_snapshot, OLD.template_version_id, OLD.bindings,
      OLD.classification, OLD.channel, OLD.locale) THEN
    RAISE EXCEPTION 'comms.broadcast.snapshot_frozen';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER broadcast_snapshot_frozen
  BEFORE UPDATE ON core.broadcast
  FOR EACH ROW EXECUTE FUNCTION core.broadcast_snapshot_frozen();

REVOKE DELETE ON core.broadcast FROM app_rw;

CREATE TABLE core.delivery (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  broadcast_id uuid NOT NULL REFERENCES core.broadcast(id),
  person_id    uuid NOT NULL REFERENCES core.person(id),
  status       text NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','sent','delivered','bounced','read','suppressed','failed')),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broadcast_id, person_id)
);
CREATE INDEX delivery_inbox ON core.delivery (person_id, updated_at DESC);

-- Marketing must not reach a suppressed recipient. Transactional ignores
-- unsubscribe — getting this backwards is a GDPR problem and a
-- deliverability one. There is no suppression row for transactional.
CREATE TABLE core.comms_suppression (
  person_id      uuid NOT NULL REFERENCES core.person(id),
  channel        text NOT NULL CHECK (channel IN ('email','sms','inapp')),
  classification text NOT NULL CHECK (classification = 'marketing'),
  suppressed_at  timestamptz NOT NULL DEFAULT now(),
  reason_key     text NOT NULL,
  PRIMARY KEY (person_id, channel)
);

CREATE FUNCTION core.delivery_suppression_guard() RETURNS trigger AS $$
DECLARE
  v_class text;
  v_channel text;
BEGIN
  SELECT classification, channel INTO v_class, v_channel
    FROM core.broadcast WHERE id = NEW.broadcast_id;
  IF v_class = 'marketing' AND EXISTS (
    SELECT 1 FROM core.comms_suppression s
     WHERE s.person_id = NEW.person_id
       AND s.channel = v_channel
  ) THEN
    RAISE EXCEPTION 'comms.suppressed'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER delivery_suppression_guard
  BEFORE INSERT ON core.delivery
  FOR EACH ROW EXECUTE FUNCTION core.delivery_suppression_guard();

-- Per-provider attempts so a bounce is attributable and retryable.
-- provider is a name, not a live call — none is chosen.
CREATE TABLE core.delivery_attempt (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  delivery_id          uuid NOT NULL REFERENCES core.delivery(id),
  provider             text NOT NULL DEFAULT 'unspecified',
  provider_message_id  text,
  attempted_at         timestamptz NOT NULL DEFAULT now(),
  result               text NOT NULL
                         CHECK (result IN ('accepted','bounced','failed','delivered','rejected')),
  response_key         text                          -- i18n
);
CREATE INDEX delivery_attempt_by_delivery
  ON core.delivery_attempt (delivery_id, attempted_at DESC);
REVOKE UPDATE, DELETE ON core.delivery_attempt FROM app_rw;

-- Down Migration

DROP TABLE IF EXISTS core.delivery_attempt;
DROP TRIGGER IF EXISTS delivery_suppression_guard ON core.delivery;
DROP FUNCTION IF EXISTS core.delivery_suppression_guard();
DROP TABLE IF EXISTS core.comms_suppression;
DROP TABLE IF EXISTS core.delivery;

DROP TRIGGER IF EXISTS broadcast_snapshot_frozen ON core.broadcast;
DROP FUNCTION IF EXISTS core.broadcast_snapshot_frozen();
DROP TRIGGER IF EXISTS broadcast_variable_contract ON core.broadcast;
DROP FUNCTION IF EXISTS core.broadcast_variable_contract();
DROP TABLE IF EXISTS core.broadcast;

DROP TRIGGER IF EXISTS comms_template_copy_frozen ON core.comms_template_copy;
DROP TRIGGER IF EXISTS comms_template_variable_frozen ON core.comms_template_variable;
DROP FUNCTION IF EXISTS core.comms_template_child_frozen();
DROP TABLE IF EXISTS core.comms_template_copy;
DROP TABLE IF EXISTS core.comms_template_variable;
DROP TRIGGER IF EXISTS comms_template_version_no_rewrite ON core.comms_template_version;
DROP FUNCTION IF EXISTS core.comms_template_version_immutable();
DROP TABLE IF EXISTS core.comms_template_version;
DROP TABLE IF EXISTS core.comms_template;
