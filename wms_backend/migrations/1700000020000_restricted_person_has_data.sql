-- Up Migration
-- PRV-04: app_rw may ask whether restricted rows exist. It may not read them.
-- SECURITY DEFINER runs as the owner; search_path is pinned so a caller cannot
-- redirect the unqualified names onto a malicious schema.

CREATE FUNCTION restricted.person_has_restricted_data(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = restricted, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM restricted.evidence_document WHERE person_id = p_person_id
    UNION ALL
    SELECT 1 FROM restricted.identity_document WHERE person_id = p_person_id
    UNION ALL
    SELECT 1 FROM restricted.classification_fact WHERE person_id = p_person_id
    UNION ALL
    SELECT 1 FROM restricted.accommodation_need
     WHERE person_id = p_person_id OR companion_person_id = p_person_id
  );
$$;

REVOKE ALL ON FUNCTION restricted.person_has_restricted_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION restricted.person_has_restricted_data(uuid) TO app_rw;

-- EXECUTE is unusable without schema lookup. This is not a table grant:
-- app_rw still has no SELECT/INSERT/UPDATE on restricted.*.
GRANT USAGE ON SCHEMA restricted TO app_rw;

-- Local-dev: Nest must be able to connect as app_rw. Migrations stay on the owner.
-- Password matches .env.example; production must set its own.
ALTER ROLE app_rw WITH LOGIN PASSWORD 'wms_app';

-- Down Migration

ALTER ROLE app_rw WITH NOLOGIN;
REVOKE USAGE ON SCHEMA restricted FROM app_rw;
REVOKE ALL ON FUNCTION restricted.person_has_restricted_data(uuid) FROM app_rw;
DROP FUNCTION IF EXISTS restricted.person_has_restricted_data(uuid);
