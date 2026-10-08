-- Up Migration

-- The participant self-grant rule was enforced by a trigger; OC roles were not. So the
-- LOW-risk role was a database guarantee and the HIGH-risk one was a service check — the
-- inverse of what this schema does everywhere else (quota_not_exceeded,
-- refund_needs_two_people, line_not_over_refunded). Granting yourself oc_admin by direct
-- INSERT succeeded.
--
-- The database cannot know who made the HTTP request. It can know something better: whether
-- the person named as `granted_by` actually holds oc_admin. That is the rule, and it is
-- checkable here.
CREATE FUNCTION core.oc_role_needs_an_admin_granter() RETURNS trigger AS $$
DECLARE
  granter_is_admin boolean;
  any_admin_exists boolean;
BEGIN
  IF NEW.role_code = 'participant' THEN
    RETURN NEW;                                  -- self-service; its own trigger covers it
  END IF;

  SELECT EXISTS (SELECT 1 FROM core.person_role WHERE role_code = 'oc_admin')
    INTO any_admin_exists;

  -- Bootstrap: the first oc_admin has nobody to be granted by. Allowed exactly
  -- once, only for oc_admin, and only while no oc_admin exists at all.
  IF NOT any_admin_exists THEN
    IF NEW.role_code = 'oc_admin' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'admin.role.granter_must_be_oc_admin'
      USING ERRCODE = '23514', CONSTRAINT = 'person_role_oc_needs_admin_granter';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM core.person_role
     WHERE person_id = NEW.granted_by AND role_code = 'oc_admin'
  ) INTO granter_is_admin;

  IF NEW.granted_by IS NULL OR NOT granter_is_admin THEN
    RAISE EXCEPTION 'admin.role.granter_must_be_oc_admin'
      USING ERRCODE = '23514', CONSTRAINT = 'person_role_oc_needs_admin_granter';
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER person_role_oc_needs_admin_granter
  BEFORE INSERT OR UPDATE ON core.person_role
  FOR EACH ROW EXECUTE FUNCTION core.oc_role_needs_an_admin_granter();

-- Down Migration

DROP TRIGGER IF EXISTS person_role_oc_needs_admin_granter ON core.person_role;
DROP FUNCTION IF EXISTS core.oc_role_needs_an_admin_granter();
