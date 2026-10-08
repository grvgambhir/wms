-- Up Migration

-- The Cognito provider creates a person on first login with a placeholder date of birth
-- (1900-01-01) because `date_of_birth` is NOT NULL and an access token carries no profile.
--
-- That is fine as a row, and dangerous as an ELIGIBILITY INPUT. Age drives banding: on the
-- 2027 reference date a placeholder computes as 127. Today no seeded band is open-ended, so
-- such a person falls out of every band and gets "no matching category" — a safe failure by
-- accident, not by design. The moment anyone adds the "100+" band the plan's RangeBand
-- explicitly supports (`max: null`), a placeholder lands in it silently and is entered in a
-- real category.
--
-- So say it in the schema: a person whose profile is a placeholder cannot hold an entry.
ALTER TABLE core.person
  ADD COLUMN profile_status text NOT NULL DEFAULT 'complete'
    CHECK (profile_status IN ('placeholder','complete'));

COMMENT ON COLUMN core.person.profile_status IS
  'placeholder = created from an auth subject with no profile yet; cannot register until completed';

CREATE FUNCTION core.entry_needs_a_real_profile() RETURNS trigger AS $$
DECLARE
  v_status text;
BEGIN
  SELECT p.profile_status INTO v_status
    FROM core.athlete_profile ap
    JOIN core.person p ON p.id = ap.person_id
   WHERE ap.id = NEW.athlete_profile_id;

  IF v_status = 'placeholder' THEN
    RAISE EXCEPTION
      'person profile is a placeholder: a real date of birth is required before registering'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER registration_entry_needs_real_profile
  BEFORE INSERT OR UPDATE OF athlete_profile_id ON core.registration_entry
  FOR EACH ROW EXECUTE FUNCTION core.entry_needs_a_real_profile();

-- Down Migration

DROP TRIGGER IF EXISTS registration_entry_needs_real_profile ON core.registration_entry;
DROP FUNCTION IF EXISTS core.entry_needs_a_real_profile();
ALTER TABLE core.person DROP COLUMN IF EXISTS profile_status;
