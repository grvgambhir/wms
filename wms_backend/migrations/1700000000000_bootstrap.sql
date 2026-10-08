-- Up Migration
-- Bootstrap: extensions, schemas, roles. Copied from BACKEND_DB_PLAN.md §4.0.1–4.0.3.

-- 4.0.1 Extensions
CREATE EXTENSION IF NOT EXISTS citext;      -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- uuid '=' operator for the rule_version EXCLUDE

-- 4.0.2 Schemas
CREATE SCHEMA core;        -- ordinary operational data
CREATE SCHEMA restricted;  -- Art. 9 special-category data (PRV-04)
CREATE SCHEMA ops;         -- back-office workflow
CREATE SCHEMA audit;       -- append-only trails

-- 4.0.3 Roles — every REVOKE/GRANT below depends on these existing
-- PLAN DEFECT on PG18: CREATE ROLE is cluster-scoped. Applying this
-- migration to a second database (wms_test, vitest throwaway DBs) fails
-- with "role already exists". The DO wrappers are the only deviation
-- from BACKEND_DB_PLAN.md §4.0.3; schemas/grants stay verbatim.
DO $$ BEGIN
  CREATE ROLE app_rw        NOLOGIN;  -- the application; cannot see `restricted`
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE restricted_rw NOLOGIN;  -- the medical/para review path only
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE reporting_ro  NOLOGIN;  -- read replica: exports, finance, analytics
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT USAGE ON SCHEMA core, ops, audit TO app_rw;
GRANT USAGE ON SCHEMA core            TO reporting_ro;
REVOKE ALL ON SCHEMA restricted FROM app_rw, reporting_ro, PUBLIC;
GRANT USAGE ON SCHEMA restricted TO restricted_rw;

-- Down Migration
-- Reverse of §4.0.1–4.0.3. Schemas first (they hold the GRANTs), then cluster-level roles, then extensions.

REVOKE USAGE ON SCHEMA restricted FROM restricted_rw;
REVOKE USAGE ON SCHEMA core FROM reporting_ro;
REVOKE USAGE ON SCHEMA core, ops, audit FROM app_rw;

DROP SCHEMA audit;
DROP SCHEMA ops;
DROP SCHEMA restricted;
DROP SCHEMA core;

-- Roles are cluster-scoped. Skip the drop when another database still grants them
-- (e.g. wms_dev still migrated while a test DB is torn down).
DO $$ BEGIN
  DROP ROLE reporting_ro;
EXCEPTION WHEN undefined_object THEN NULL;
         WHEN dependent_objects_still_exist THEN NULL;
END $$;
DO $$ BEGIN
  DROP ROLE restricted_rw;
EXCEPTION WHEN undefined_object THEN NULL;
         WHEN dependent_objects_still_exist THEN NULL;
END $$;
DO $$ BEGIN
  DROP ROLE app_rw;
EXCEPTION WHEN undefined_object THEN NULL;
         WHEN dependent_objects_still_exist THEN NULL;
END $$;

DROP EXTENSION btree_gist;
DROP EXTENSION citext;
