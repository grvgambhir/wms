-- Up Migration
-- Publishing a second version on the same rule_set must close the outgoing active
-- range. The EXCLUDE on overlapping active `effective` ranges would otherwise refuse
-- the new row, and callers must not UPDATE status themselves (active_needs_impact_analysis).
-- Content stays frozen: rule_version_immutable allows only status and the UPPER bound
-- of `effective` to move.

CREATE OR REPLACE FUNCTION core.publish_rule_version(p_version_id uuid, p_ran_by uuid)
RETURNS uuid AS $$
DECLARE
  v_hash text;
  v_analysis uuid;
  v_set uuid;
BEGIN
  SELECT rule_set_id INTO v_set FROM core.rule_version WHERE id = p_version_id;
  IF v_set IS NULL THEN
    RAISE EXCEPTION 'rule version % does not exist', p_version_id;
  END IF;

  SELECT encode(sha256(convert_to(
           coalesce((SELECT string_agg(d.ordinal || ':' || d.attribute || ':' || d.bands::text, '|'
                                       ORDER BY d.ordinal)
                       FROM core.rule_dimension d WHERE d.rule_version_id = p_version_id), '')
        || '#'
        || coalesce((SELECT string_agg(e.ordinal || ':' || e.predicate || ':' || e.params::text, '|'
                                       ORDER BY e.ordinal)
                       FROM core.rule_eligibility e WHERE e.rule_version_id = p_version_id), ''),
           'UTF8')), 'hex')
    INTO v_hash;

  INSERT INTO core.rule_impact_analysis
    (rule_version_id, entries_examined, entries_affected, paid_affected,
     summary, evaluated_content_hash, ran_by)
  SELECT p_version_id,
         count(*), 0, 0,
         jsonb_build_object('note', 'computed at publish'),
         v_hash, p_ran_by
    FROM core.registration_entry WHERE rule_version_id = p_version_id
  RETURNING id INTO v_analysis;

  UPDATE core.rule_version
     SET status = 'superseded',
         effective = tstzrange(lower(effective), now(), '[)')
   WHERE rule_set_id = v_set
     AND id <> p_version_id
     AND status = 'active';

  UPDATE core.rule_version
     SET content_hash = v_hash,
         impact_analysis_id = v_analysis,
         status = 'active',
         published_by = p_ran_by,
         published_at = now()
   WHERE id = p_version_id;

  RETURN v_analysis;
END $$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION core.publish_rule_version(uuid, uuid) TO app_rw;

-- Down Migration

CREATE OR REPLACE FUNCTION core.publish_rule_version(p_version_id uuid, p_ran_by uuid)
RETURNS uuid AS $$
DECLARE
  v_hash text;
  v_analysis uuid;
BEGIN
  SELECT encode(sha256(convert_to(
           coalesce((SELECT string_agg(d.ordinal || ':' || d.attribute || ':' || d.bands::text, '|'
                                       ORDER BY d.ordinal)
                       FROM core.rule_dimension d WHERE d.rule_version_id = p_version_id), '')
        || '#'
        || coalesce((SELECT string_agg(e.ordinal || ':' || e.predicate || ':' || e.params::text, '|'
                                       ORDER BY e.ordinal)
                       FROM core.rule_eligibility e WHERE e.rule_version_id = p_version_id), ''),
           'UTF8')), 'hex')
    INTO v_hash;

  INSERT INTO core.rule_impact_analysis
    (rule_version_id, entries_examined, entries_affected, paid_affected,
     summary, evaluated_content_hash, ran_by)
  SELECT p_version_id,
         count(*), 0, 0,
         jsonb_build_object('note', 'computed at publish'),
         v_hash, p_ran_by
    FROM core.registration_entry WHERE rule_version_id = p_version_id
  RETURNING id INTO v_analysis;

  UPDATE core.rule_version
     SET content_hash = v_hash,
         impact_analysis_id = v_analysis,
         status = 'active',
         published_by = p_ran_by,
         published_at = now()
   WHERE id = p_version_id;

  RETURN v_analysis;
END $$ LANGUAGE plpgsql;
