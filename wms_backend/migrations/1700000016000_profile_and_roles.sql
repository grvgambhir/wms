-- Up Migration

-- Completing a profile is what turns a Cognito first-login placeholder into a
-- registerable athlete. These rules are the parts that must not depend on a
-- service remembering to check.

-- 1. profile_status only moves forward. A completed profile is never a placeholder
--    again — the column would otherwise lie about whether the date of birth is real.
CREATE FUNCTION core.person_profile_status_forward() RETURNS trigger AS $$
BEGIN
  IF OLD.profile_status = 'complete' AND NEW.profile_status = 'placeholder' THEN
    RAISE EXCEPTION 'profile.status.cannot_revert'
      USING ERRCODE = '23514', CONSTRAINT = 'person_profile_status_forward';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER person_profile_status_forward
  BEFORE UPDATE OF profile_status ON core.person
  FOR EACH ROW EXECUTE FUNCTION core.person_profile_status_forward();

-- 2. Date of birth drives age banding. Changing it after any registration entry
--    exists is a category change, not a profile edit. Placeholder → real is free
--    because a placeholder cannot hold an entry (1700000015000).
CREATE FUNCTION core.person_dob_locked_after_entry() RETURNS trigger AS $$
BEGIN
  IF NEW.date_of_birth IS NOT DISTINCT FROM OLD.date_of_birth THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1
      FROM core.athlete_profile ap
      JOIN core.registration_entry re ON re.athlete_profile_id = ap.id
     WHERE ap.person_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'profile.date_of_birth.needs_review'
      USING ERRCODE = '23514', CONSTRAINT = 'person_dob_change_needs_review';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER person_dob_locked_after_entry
  BEFORE UPDATE OF date_of_birth ON core.person
  FOR EACH ROW EXECUTE FUNCTION core.person_dob_locked_after_entry();

-- 3. The edition a self-granted participant role attaches to. Prefer an event
--    that is actually taking entries; fall back so a single planned test event
--    still resolves.
CREATE FUNCTION core.current_event_id() RETURNS uuid AS $$
  SELECT id
    FROM core.event
   ORDER BY
     CASE status
       WHEN 'registration_open' THEN 0
       WHEN 'live' THEN 1
       WHEN 'planned' THEN 2
       ELSE 3
     END,
     starts_on ASC,
     id ASC
   LIMIT 1
$$ LANGUAGE sql STABLE;

-- 4. The only SQL path that inserts role_code = 'participant'. Called from the
--    profile-completion transaction, never from the admin grant endpoint.
CREATE FUNCTION core.grant_participant(p_person uuid, p_granted_by uuid) RETURNS uuid AS $$
DECLARE
  v_event uuid;
  v_id uuid;
BEGIN
  v_event := core.current_event_id();
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'profile.event.unavailable'
      USING ERRCODE = '23514', CONSTRAINT = 'participant_needs_current_event';
  END IF;
  INSERT INTO core.person_role (person_id, role_code, event_id, granted_by)
  VALUES (p_person, 'participant', v_event, p_granted_by)
  ON CONFLICT ON CONSTRAINT person_role_unique_per_event DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN v_event;
END $$ LANGUAGE plpgsql;

-- 5. participant is self-service. An administrator's person_id as granted_by on
--    someone else's participant row is refused here, so a missed service check
--    cannot create a second source of truth.
CREATE FUNCTION core.participant_is_self_granted() RETURNS trigger AS $$
BEGIN
  IF NEW.role_code = 'participant' AND NEW.granted_by IS DISTINCT FROM NEW.person_id THEN
    RAISE EXCEPTION 'admin.role.participant_self_service'
      USING ERRCODE = '23514', CONSTRAINT = 'person_role_participant_self_grant';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER person_role_participant_self_grant
  BEFORE INSERT ON core.person_role
  FOR EACH ROW EXECUTE FUNCTION core.participant_is_self_granted();

-- 6. Never delete the last oc_admin grant in the table. An empty administrator
--    set is a support incident nobody can fix from inside the API.
CREATE FUNCTION core.keep_one_oc_admin() RETURNS trigger AS $$
BEGIN
  IF OLD.role_code = 'oc_admin' AND NOT EXISTS (
    SELECT 1 FROM core.person_role
     WHERE role_code = 'oc_admin' AND id IS DISTINCT FROM OLD.id
  ) THEN
    RAISE EXCEPTION 'admin.role.last_oc_admin'
      USING ERRCODE = '23514', CONSTRAINT = 'person_role_last_oc_admin';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER person_role_last_oc_admin
  BEFORE DELETE ON core.person_role
  FOR EACH ROW EXECUTE FUNCTION core.keep_one_oc_admin();

-- Keyset paging for GET /v1/admin/people. Search is 20k rows; the composite is
-- what keeps page N from walking the whole table.
CREATE INDEX person_admin_keyset ON core.person (created_at DESC, id DESC);

-- Plan §4.1: ordinal is unique per person so a second contact cannot collide
-- on display order.
ALTER TABLE core.emergency_contact
  ADD CONSTRAINT emergency_contact_ordinal_unique UNIQUE (person_id, ordinal);

GRANT EXECUTE ON FUNCTION core.current_event_id() TO app_rw;
GRANT EXECUTE ON FUNCTION core.grant_participant(uuid, uuid) TO app_rw;

-- Down Migration

REVOKE EXECUTE ON FUNCTION core.grant_participant(uuid, uuid) FROM app_rw;
REVOKE EXECUTE ON FUNCTION core.current_event_id() FROM app_rw;
ALTER TABLE core.emergency_contact DROP CONSTRAINT IF EXISTS emergency_contact_ordinal_unique;
DROP INDEX IF EXISTS core.person_admin_keyset;
DROP TRIGGER IF EXISTS person_role_last_oc_admin ON core.person_role;
DROP FUNCTION IF EXISTS core.keep_one_oc_admin();
DROP TRIGGER IF EXISTS person_role_participant_self_grant ON core.person_role;
DROP FUNCTION IF EXISTS core.participant_is_self_granted();
DROP FUNCTION IF EXISTS core.grant_participant(uuid, uuid);
DROP FUNCTION IF EXISTS core.current_event_id();
DROP TRIGGER IF EXISTS person_dob_locked_after_entry ON core.person;
DROP FUNCTION IF EXISTS core.person_dob_locked_after_entry();
DROP TRIGGER IF EXISTS person_profile_status_forward ON core.person;
DROP FUNCTION IF EXISTS core.person_profile_status_forward();
