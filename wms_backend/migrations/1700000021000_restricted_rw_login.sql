-- Up Migration
-- Restricted evidence authenticates as restricted_rw. LOGIN is the boundary:
-- app_rw is not a member of this role and cannot SET ROLE into it.
-- Password matches local-dev; production must set its own.
ALTER ROLE restricted_rw WITH LOGIN PASSWORD 'wms_restricted';

-- Who / what / why. action is the verb; purpose is the endpoint or reason.
ALTER TABLE restricted.access_log
  ADD COLUMN purpose text NOT NULL DEFAULT 'restricted-evidence';

ALTER TABLE restricted.access_log
  ALTER COLUMN purpose DROP DEFAULT;

COMMENT ON COLUMN restricted.access_log.purpose IS
  'Why the privileged role touched this record (endpoint or purpose).';

-- Down Migration

ALTER TABLE restricted.access_log DROP COLUMN IF EXISTS purpose;
ALTER ROLE restricted_rw WITH NOLOGIN;
