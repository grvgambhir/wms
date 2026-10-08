-- Up Migration

-- CMP-01 and CMP-06.
--
-- A start list is a SNAPSHOT, not a query.
--
-- The tempting design is to generate it live from `registration_entry` on every read. That is
-- wrong for the same reason a rule version is frozen: officials print it, athletes turn up
-- against it, and a late withdrawal must not silently rewrite the document people are holding.
-- What changes after publication is a NEW version with a recorded reason — CMP-05 asks for
-- "approval/correction/version history" precisely because corrections happen and have to be
-- traceable.
--
-- So this follows the `rule_version` pattern already proven in this schema: draft → approved →
-- published, immutable once it leaves draft, superseded rather than edited.

CREATE TABLE core.start_list (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id          uuid NOT NULL REFERENCES core.event(id),
  sport_entry_product_id uuid NOT NULL REFERENCES core.sport_entry_product(id),
  -- The category this list covers. Null means the product has no category split.
  category_name     text,
  version_no        integer NOT NULL CHECK (version_no > 0),
  supersedes        uuid REFERENCES core.start_list(id),

  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','approved','published','superseded')),

  -- CMP-06. An embargo is a TIME, not a second status: "approved, visible from 09:00" is the
  -- normal case, and modelling it as a status would need someone or something to flip it at
  -- exactly the right moment. A timestamp is true without anyone acting.
  embargo_until     timestamptz,

  approved_by       uuid REFERENCES core.person(id),
  approved_at       timestamptz,
  published_by      uuid REFERENCES core.person(id),
  published_at      timestamptz,
  -- Why this version exists. Version 1 has none; a correction must say what it corrects.
  correction_reason_key text,
  content_hash      text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT start_list_one_version_per_scope
    UNIQUE NULLS NOT DISTINCT (sport_entry_product_id, category_name, version_no),
  -- A published list must carry who published it and when. Without that, "who approved this
  -- start list?" has no answer, and CMP-05 asks for exactly that history.
  CONSTRAINT published_needs_a_publisher
    CHECK (status <> 'published' OR (published_by IS NOT NULL AND published_at IS NOT NULL)),
  CONSTRAINT approved_needs_an_approver
    CHECK (status = 'draft' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  -- A correction must explain itself — but only once it is PUBLISHED. The reason is written
  -- at publication, not at build time: an official assembling a replacement list does not yet
  -- know it will need one. Enforcing it at insert would force a placeholder reason, and a
  -- placeholder in a field that exists to explain a change is worse than an empty one.
  CONSTRAINT correction_states_why
    CHECK (status <> 'published' OR version_no = 1 OR supersedes IS NULL
           OR correction_reason_key IS NOT NULL)
);

CREATE INDEX start_list_by_event ON core.start_list (event_id, status);
CREATE INDEX start_list_by_product ON core.start_list (sport_entry_product_id, version_no DESC);

-- One live list per scope. Two published start lists for the same event would be two
-- documents claiming to be authoritative, and the officials holding them would disagree.
CREATE UNIQUE INDEX start_list_one_published_per_scope
  ON core.start_list (sport_entry_product_id, category_name)
  WHERE status = 'published';

CREATE TABLE core.start_list_entry (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  start_list_id     uuid NOT NULL REFERENCES core.start_list(id) ON DELETE CASCADE,
  registration_entry_id uuid NOT NULL REFERENCES core.registration_entry(id),
  -- COPIED, not joined. The list states what was true when it was published; a later name
  -- change or category recalculation must not alter a document already in circulation.
  display_name      text NOT NULL,
  category_name     text,
  -- Para class travels to competition; the medical evidence behind it never does (PRV-04).
  class_code        text,
  team_name         text,
  club_or_nation    text,
  -- Lane, heat, seed — whatever ordering the sport uses. Free-form because ten sports order
  -- differently and a per-sport column set is the branching the RFP rejects elsewhere.
  position_label    text,
  ordinal           integer NOT NULL,

  CONSTRAINT start_list_entry_once UNIQUE (start_list_id, registration_entry_id),
  CONSTRAINT start_list_order_unique UNIQUE (start_list_id, ordinal)
);

CREATE INDEX start_list_entry_by_registration
  ON core.start_list_entry (registration_entry_id);

-- Immutability, the same way `rule_version_immutable` does it. Once a list is approved the
-- document is fixed: a mistake becomes a new version that says what it corrects.
CREATE FUNCTION core.start_list_frozen() RETURNS trigger AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM core.start_list
   WHERE id = COALESCE(NEW.start_list_id, OLD.start_list_id);
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'start list % is % and its entries are frozen; publish a new version',
      COALESCE(NEW.start_list_id, OLD.start_list_id), v_status
      USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

CREATE TRIGGER start_list_entry_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON core.start_list_entry
  FOR EACH ROW EXECUTE FUNCTION core.start_list_frozen();

-- The header itself may only move forward through the lifecycle, and its scope never changes.
CREATE FUNCTION core.start_list_header_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'draft' AND (
       NEW.sport_entry_product_id IS DISTINCT FROM OLD.sport_entry_product_id
    OR NEW.category_name IS DISTINCT FROM OLD.category_name
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
  ) THEN
    RAISE EXCEPTION 'a published start list cannot be repointed or rewritten'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'published' AND NEW.status NOT IN ('published','superseded') THEN
    RAISE EXCEPTION 'a published start list can only be superseded'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER start_list_header_guard
  BEFORE UPDATE ON core.start_list
  FOR EACH ROW EXECUTE FUNCTION core.start_list_header_guard();

GRANT SELECT, INSERT, UPDATE ON core.start_list TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.start_list_entry TO app_rw;

-- Down Migration

DROP TRIGGER IF EXISTS start_list_header_guard ON core.start_list;
DROP FUNCTION IF EXISTS core.start_list_header_guard();
DROP TRIGGER IF EXISTS start_list_entry_frozen ON core.start_list_entry;
DROP FUNCTION IF EXISTS core.start_list_frozen();
DROP TABLE IF EXISTS core.start_list_entry;
DROP TABLE IF EXISTS core.start_list;
