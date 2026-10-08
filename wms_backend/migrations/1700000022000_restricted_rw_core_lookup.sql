-- Up Migration
-- restricted_rw authenticates separately. It still has to look up ordinary keys
-- (requirement sets, lawful basis, person names, entries) on the same connection
-- as the restricted write. USAGE + SELECT is not membership in restricted_rw and
-- is not a join path from core into restricted.
GRANT USAGE ON SCHEMA core TO restricted_rw;
GRANT SELECT ON
  core.evidence_requirement_set,
  core.evidence_requirement_version,
  core.evidence_requirement_applicability,
  core.consent,
  core.lawful_basis,
  core.privacy_notice,
  core.person,
  core.registration_entry
TO restricted_rw;

-- /v1/ready reads pgmigrations as app_rw. Permission denied was swallowed as
-- "no migrations applied" and the probe returned 503.
GRANT SELECT ON TABLE public.pgmigrations TO app_rw;

-- Consent is append-only for the application (REVOKE DELETE). GDPR purge of an
-- invited user who never signed in still has to remove those rows. The function
-- runs as owner; app_rw only EXECUTEs it after the service has checked blockers.
CREATE FUNCTION core.purge_invited_person(p_person_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  DELETE FROM core.consent WHERE person_id = p_person_id;
  DELETE FROM core.person_role WHERE person_id = p_person_id;
  DELETE FROM core.person WHERE id = p_person_id RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION core.purge_invited_person(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.purge_invited_person(uuid) TO app_rw;

-- Down Migration

REVOKE ALL ON FUNCTION core.purge_invited_person(uuid) FROM app_rw;
DROP FUNCTION IF EXISTS core.purge_invited_person(uuid);

REVOKE SELECT ON TABLE public.pgmigrations FROM app_rw;
REVOKE SELECT ON
  core.evidence_requirement_set,
  core.evidence_requirement_version,
  core.evidence_requirement_applicability,
  core.consent,
  core.lawful_basis,
  core.privacy_notice,
  core.person,
  core.registration_entry
FROM restricted_rw;
REVOKE USAGE ON SCHEMA core FROM restricted_rw;
