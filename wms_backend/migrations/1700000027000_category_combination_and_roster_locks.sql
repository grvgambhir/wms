-- Up Migration

-- CMP-03 (category combination preserving the original award category) and
-- CMP-04 (roster locks + controlled Games-time substitutions with revalidation).
--
-- Both requirements already had their tables. What neither had was the thing that makes the
-- requirement true rather than merely recorded:
--
--   * `core.category_combination` stored a decision nothing read, and nothing stopped the
--     combined field from being written over the athlete's award category — which is the one
--     outcome CMP-03 exists to prevent.
--   * `core.team_roster.locked_at` was written by `POST /v1/teams/:id/lock` and read by
--     nothing at all. A lock nobody checks is a timestamp.
--
-- Both gaps are closed here as constraints, not as service code, for the usual reason: the
-- next caller is the one that forgets.


-- ── CMP-03: the combination is a mapping, never a rewrite ──────────────────────────────────

-- `source_keys text[]` could not carry the guarantee that matters. An athlete's category may
-- be merged into AT MOST ONE field — two combinations claiming the same source category would
-- put one entrant on two start lists, and an array column cannot express that uniqueness.
-- The array was never read by anything (this table has been unused since it was created), so
-- it becomes a child table rather than being duplicated by one.
ALTER TABLE core.category_combination
  DROP CONSTRAINT IF EXISTS category_combination_source_keys_check,
  DROP COLUMN IF EXISTS source_keys;

-- The published explanation CMP-03 asks for. `reason` stays the OC's internal note; this is
-- the key the participant app renders, in the participant's language. A sentence stored here
-- would be a sentence in one language on a document read in four.
ALTER TABLE core.category_combination
  ADD COLUMN IF NOT EXISTS reason_key text;

UPDATE core.category_combination SET reason_key = 'competition.combination.low_entries'
 WHERE reason_key IS NULL;

ALTER TABLE core.category_combination
  ALTER COLUMN reason_key SET NOT NULL;

-- Needed so the child rows can carry the product through a composite foreign key instead of
-- trusting a trigger to keep a denormalised copy honest.
ALTER TABLE core.category_combination
  ADD CONSTRAINT category_combination_id_product UNIQUE (id, sport_entry_product_id);

CREATE TABLE core.category_combination_source (
  combination_id         uuid NOT NULL REFERENCES core.category_combination(id) ON DELETE CASCADE,
  sport_entry_product_id uuid NOT NULL,
  source_key             text NOT NULL,
  PRIMARY KEY (combination_id, source_key),
  -- THE constraint. One category, one field.
  CONSTRAINT source_category_combined_once UNIQUE (sport_entry_product_id, source_key),
  CONSTRAINT source_belongs_to_its_combination
    FOREIGN KEY (combination_id, sport_entry_product_id)
    REFERENCES core.category_combination (id, sport_entry_product_id) ON DELETE CASCADE
);

COMMENT ON TABLE core.category_combination_source IS
  'The categories merged into a combined field. UNIQUE (product, source_key) is CMP-03: an entrant competes in exactly one field.';

-- The one correct way to record a combination. "At least two sources", "a field cannot be
-- combined into another field", and "the combined key is not one of its own sources" are all
-- statements about a SET of rows, which no row-level CHECK can make. Putting them in a
-- function means tests, seeds and the admin endpoint cannot each invent their own version.
CREATE FUNCTION core.combine_categories(
  p_product      uuid,
  p_combined_key text,
  p_source_keys  text[],
  p_min_entries  integer,
  p_reason       text,
  p_reason_key   text,
  p_decided_by   uuid
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_event uuid;
  v_id    uuid;
  v_key   text;
BEGIN
  IF p_source_keys IS NULL OR cardinality(p_source_keys) < 2 THEN
    RAISE EXCEPTION 'competition.combination.needs_two_sources'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_combined_key = ANY (p_source_keys) THEN
    RAISE EXCEPTION 'competition.combination.combined_key_is_a_source'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT event_id INTO v_event
    FROM core.sport_entry_product WHERE id = p_product;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'competition.product.not_found' USING ERRCODE = 'check_violation';
  END IF;

  -- No chaining. A field built out of other fields makes the award lineage a graph to walk
  -- rather than a fact to read, and every consumer would have to walk it correctly.
  FOREACH v_key IN ARRAY p_source_keys LOOP
    IF EXISTS (SELECT 1 FROM core.category_combination
                WHERE sport_entry_product_id = p_product AND combined_key = v_key) THEN
      RAISE EXCEPTION 'competition.combination.source_is_a_combined_field'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM core.category_combination_source
              WHERE sport_entry_product_id = p_product AND source_key = p_combined_key) THEN
    RAISE EXCEPTION 'competition.combination.combined_key_already_merged'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO core.category_combination
    (event_id, sport_entry_product_id, combined_key, min_entries, reason, reason_key, decided_by)
  VALUES (v_event, p_product, p_combined_key, p_min_entries, p_reason, p_reason_key, p_decided_by)
  RETURNING id INTO v_id;

  INSERT INTO core.category_combination_source (combination_id, sport_entry_product_id, source_key)
  SELECT DISTINCT v_id, p_product, src_key
    FROM unnest(p_source_keys) AS src_key;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION
  core.combine_categories(uuid, text, text[], integer, text, text, uuid) TO app_rw;

-- The guarantee the RFP actually asks for, stated once, in the only place it cannot be
-- bypassed: **the award category is never overwritten by the field.**
--
-- `registration_entry.current_category_*` is what medals are awarded against (RUL-04). The
-- combined field is where the athlete physically races. Assigning the field to the entry is
-- the obvious shortcut — one column already exists, and the start list would come out right
-- — and it silently destroys the entrant lineage that makes a medal traceable to the 40–44
-- band the athlete entered.
CREATE FUNCTION core.award_category_is_not_a_combined_field() RETURNS trigger AS $$
BEGIN
  -- Both columns: a late entry created after the combination could otherwise be born with the
  -- field as its ORIGINAL category, which loses the lineage just as surely.
  IF EXISTS (
       SELECT 1 FROM core.category_combination c
        WHERE c.sport_entry_product_id = NEW.sport_entry_product_id
          AND c.combined_key IN (NEW.current_category_name, NEW.original_category_name)
     ) THEN
    RAISE EXCEPTION
      'competition.combination.award_category_overwritten'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER award_category_is_not_a_combined_field
  BEFORE INSERT OR UPDATE OF current_category_name, original_category_name, sport_entry_product_id
  ON core.registration_entry
  FOR EACH ROW EXECUTE FUNCTION core.award_category_is_not_a_combined_field();


-- ── CMP-03 on the published document ───────────────────────────────────────────────────────

-- A start list for a combined field names the field in its header; every line still carries
-- the category that entrant is awarded in. Both, always — a document with only one of them is
-- either unusable by an official or useless to the medal table.
ALTER TABLE core.start_list
  ADD COLUMN combination_id uuid REFERENCES core.category_combination(id);

ALTER TABLE core.start_list_entry
  ADD COLUMN award_category_name text;

COMMENT ON COLUMN core.start_list_entry.category_name IS
  'The field this entrant competes in — the combined key when the list is combined.';
COMMENT ON COLUMN core.start_list_entry.award_category_name IS
  'CMP-03 entrant lineage: the category the entrant is awarded in. Never the combined field.';

CREATE FUNCTION core.start_list_award_lineage() RETURNS trigger AS $$
DECLARE
  v_combination uuid;
BEGIN
  SELECT combination_id INTO v_combination
    FROM core.start_list WHERE id = NEW.start_list_id;
  IF v_combination IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.award_category_name IS NULL THEN
    RAISE EXCEPTION 'competition.combination.award_category_missing'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM core.category_combination_source s
     WHERE s.combination_id = v_combination
       AND s.source_key = NEW.award_category_name
  ) THEN
    RAISE EXCEPTION 'competition.combination.award_category_not_a_source'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER start_list_award_lineage
  BEFORE INSERT OR UPDATE ON core.start_list_entry
  FOR EACH ROW EXECUTE FUNCTION core.start_list_award_lineage();

-- The header guard already refuses repointing a published list; the combination is part of
-- what "this document covers" means, so it joins the same list.
CREATE OR REPLACE FUNCTION core.start_list_header_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'draft' AND (
       NEW.sport_entry_product_id IS DISTINCT FROM OLD.sport_entry_product_id
    OR NEW.category_name IS DISTINCT FROM OLD.category_name
    OR NEW.combination_id IS DISTINCT FROM OLD.combination_id
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

GRANT SELECT, INSERT ON core.category_combination TO app_rw;
GRANT SELECT, INSERT ON core.category_combination_source TO app_rw;


-- ── CMP-04: the lock, and what it escalates ────────────────────────────────────────────────

-- `team_roster.locked_at` has existed since 1700000002000 and has never been read. These are
-- the two things it now means.
--
-- (1) After the lock, a team cannot simply publish a new roster version. `publishVersion`
--     moves draft → approved and repoints every entry on the team, which is exactly the
--     uncontrolled path CMP-04 forbids at Games time. A substitution moves
--     proposed → approved instead, so the two routes are already distinguishable in the data
--     and no session flag is needed to tell them apart.
CREATE FUNCTION core.roster_version_respects_lock() RETURNS trigger AS $$
DECLARE
  v_locked timestamptz;
BEGIN
  IF OLD.status = 'draft' AND NEW.status = 'approved' THEN
    SELECT locked_at INTO v_locked FROM core.team_roster WHERE id = NEW.team_id;
    IF v_locked IS NOT NULL AND v_locked <= now() THEN
      RAISE EXCEPTION 'roster.locked'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER roster_version_respects_lock
  BEFORE UPDATE ON core.roster_version
  FOR EACH ROW EXECUTE FUNCTION core.roster_version_respects_lock();

-- (2) A substitution approved after the lock is a GAMES-TIME substitution and must have been
--     revalidated against both category and accreditation. Recording what the revalidation
--     found is not enough on its own — these CHECKs are what make it impossible to approve
--     one without it.
ALTER TABLE core.roster_substitution
  ADD COLUMN games_time                  boolean NOT NULL DEFAULT false,
  ADD COLUMN category_revalidated_at     timestamptz,
  ADD COLUMN accreditation_revalidated_at timestamptz,
  ADD COLUMN accreditation_unmet         text[],
  ADD COLUMN revalidated_by              uuid REFERENCES core.person(id);

COMMENT ON COLUMN core.roster_substitution.games_time IS
  'True when the team roster was locked at the moment of approval. Set by trigger, never by a caller.';
COMMENT ON COLUMN core.roster_substitution.accreditation_unmet IS
  'Gate keys still unmet across the proposed crew. Empty array means checked and clean; NULL means never checked.';

ALTER TABLE core.roster_substitution
  ADD CONSTRAINT games_time_substitution_is_revalidated
    CHECK (status <> 'approved' OR games_time = false OR (
      category_revalidated_at IS NOT NULL
      AND accreditation_revalidated_at IS NOT NULL
      AND revalidated_by IS NOT NULL
    )),
  -- An unaccredited athlete cannot be walked onto the field of play by a roster edit. The
  -- accreditation gate is configuration (ACC-03); this refuses to approve around it.
  ADD CONSTRAINT games_time_accreditation_is_clean
    CHECK (status <> 'approved' OR games_time = false
           OR (accreditation_unmet IS NOT NULL AND cardinality(accreditation_unmet) = 0)),
  -- CMP-03 meets CMP-04. Before the lock, a substitution that moves the crew into another age
  -- band is a legitimate category change with a fee impact (TEA-04). After the lock the start
  -- list is printed and the field is set, so the same change is not a substitution at all —
  -- it is a different entry. Refused here; the override path is the exception queue
  -- (`ops.exception_case`), which is dual-signed and leaves a record.
  ADD CONSTRAINT games_time_award_category_survives
    CHECK (status <> 'approved' OR games_time = false
           OR from_category_id IS NOT DISTINCT FROM to_category_id);

-- `games_time` is decided at APPROVAL, not at proposal. A substitution proposed an hour
-- before the lock and approved an hour after it is a Games-time substitution; deciding at
-- insert would let the queue be used to bank pre-lock approvals.
CREATE FUNCTION core.roster_substitution_games_time() RETURNS trigger AS $$
DECLARE
  v_locked timestamptz;
BEGIN
  SELECT tr.locked_at INTO v_locked
    FROM core.registration_entry re
    JOIN core.team_roster tr ON tr.id = re.team_roster_id
   WHERE re.id = NEW.entry_id;
  NEW.games_time := (v_locked IS NOT NULL AND v_locked <= now());

  -- A revalidation performed BEFORE the lock does not describe the locked roster: the crew
  -- it checked could still change afterwards. Rather than add a second refusal that has to
  -- agree with the first, the stale timestamps are cleared here and
  -- `games_time_substitution_is_revalidated` refuses for the reason it already refuses for.
  IF NEW.games_time AND v_locked IS NOT NULL THEN
    IF NEW.category_revalidated_at IS NOT NULL AND NEW.category_revalidated_at < v_locked THEN
      NEW.category_revalidated_at := NULL;
    END IF;
    IF NEW.accreditation_revalidated_at IS NOT NULL
       AND NEW.accreditation_revalidated_at < v_locked THEN
      NEW.accreditation_revalidated_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER roster_substitution_games_time
  BEFORE INSERT OR UPDATE ON core.roster_substitution
  FOR EACH ROW EXECUTE FUNCTION core.roster_substitution_games_time();

-- The accreditation half of the revalidation, reusing the gate evaluator ACC-03 already has
-- rather than restating which checks matter. Every COMPETING member of the proposed crew must
-- hold an accreditation with no unmet gate; a member with no accreditation row at all is the
-- commonest real case and must not read as "nothing unmet".
CREATE FUNCTION core.roster_accreditation_unmet(p_version_id uuid, p_event_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(array_agg(DISTINCT gate ORDER BY gate), '{}'::text[])
    FROM core.roster_selection s
    LEFT JOIN LATERAL (
      SELECT a.id, a.status, a.valid_from, a.valid_until
        FROM core.accreditation a
       WHERE a.person_id = s.person_id
         AND a.event_id = p_event_id
         AND a.revoked_at IS NULL
       ORDER BY (a.status = 'issued') DESC, a.issued_at DESC NULLS LAST
       LIMIT 1
    ) acc ON true
    CROSS JOIN LATERAL unnest(
      CASE
        WHEN acc.id IS NULL              THEN ARRAY['accreditation.missing']
        WHEN acc.status <> 'issued'      THEN ARRAY['accreditation.not_issued']
        WHEN current_date < acc.valid_from
          OR current_date > acc.valid_until THEN ARRAY['accreditation.outside_validity']
        -- NULL means no gate is configured for this role. The accreditation desk already
        -- treats that as a refusal (`accreditation.gate.not_configured`); failing open here
        -- would make an unconfigured event the easiest way past the check.
        ELSE COALESCE(core.accreditation_unmet_gates(acc.id),
                      ARRAY['accreditation.gate.not_configured'])
      END
    ) AS gate
   WHERE s.roster_version_id = p_version_id
     AND s.competes;
$$;

GRANT EXECUTE ON FUNCTION core.roster_accreditation_unmet(uuid, uuid) TO app_rw;

-- Down Migration

DROP FUNCTION IF EXISTS core.roster_accreditation_unmet(uuid, uuid);
DROP TRIGGER IF EXISTS roster_substitution_games_time ON core.roster_substitution;
DROP FUNCTION IF EXISTS core.roster_substitution_games_time();
ALTER TABLE core.roster_substitution
  DROP CONSTRAINT IF EXISTS games_time_award_category_survives,
  DROP CONSTRAINT IF EXISTS games_time_accreditation_is_clean,
  DROP CONSTRAINT IF EXISTS games_time_substitution_is_revalidated,
  DROP COLUMN IF EXISTS revalidated_by,
  DROP COLUMN IF EXISTS accreditation_unmet,
  DROP COLUMN IF EXISTS accreditation_revalidated_at,
  DROP COLUMN IF EXISTS category_revalidated_at,
  DROP COLUMN IF EXISTS games_time;
DROP TRIGGER IF EXISTS roster_version_respects_lock ON core.roster_version;
DROP FUNCTION IF EXISTS core.roster_version_respects_lock();
DROP TRIGGER IF EXISTS start_list_award_lineage ON core.start_list_entry;
DROP FUNCTION IF EXISTS core.start_list_award_lineage();
ALTER TABLE core.start_list_entry DROP COLUMN IF EXISTS award_category_name;
ALTER TABLE core.start_list DROP COLUMN IF EXISTS combination_id;
DROP TRIGGER IF EXISTS award_category_is_not_a_combined_field ON core.registration_entry;
DROP FUNCTION IF EXISTS core.award_category_is_not_a_combined_field();
DROP FUNCTION IF EXISTS core.combine_categories(uuid, text, text[], integer, text, text, uuid);
DROP TABLE IF EXISTS core.category_combination_source;
ALTER TABLE core.category_combination
  DROP CONSTRAINT IF EXISTS category_combination_id_product,
  DROP COLUMN IF EXISTS reason_key,
  ADD COLUMN IF NOT EXISTS source_keys text[] NOT NULL DEFAULT '{}';
