-- Up Migration

-- F06: a member list is not a selected, versioned team entry.
--
-- WHY this is not an ALTER that stuffs "selected" onto roster_member:
-- the shipped rowing crew holds original rowers AND the replacement in one
-- list, but only the selected subset competes. Importing everyone into the
-- flat list silently adds the reserve to crew-average age maths; importing
-- only the active ones loses the substitute and the original selection.
-- Team name is dropped either way. TEA-04 also needs a proposed roster to
-- exist *unapproved* so fee/refund/category/accreditation can be recalculated
-- before the live selection changes — an in-place edit cannot do that.
--
-- Three objects, the same split as rule_set / rule_version / the pin on
-- registration_entry.rule_version_id:
--   team            — durable named thing, product-associated, reusable pool
--   roster_version  — the selection as it stood at a point in time
--   roster_selection — who is in *this* version, in which role, and whether
--                     they compete (the category-math input)
--
-- core.team_roster is that team. It already has FKs from entries and
-- orders (on_behalf_of); renaming it would break F04. Name, product,
-- publication visibility and matching authority are added here. The
-- membership pool stays on core.roster_member. F11's cardinality trigger
-- still counts that pool; competing-crew age does not.
--
-- Substitution is a proposal → approval pair, not an UPDATE. Invite tokens
-- are stored as sha256 hex, exactly like core.refresh_token.token_hash —
-- there is no plaintext column. partner_request stays the pairwise
-- partner-finder (two athlete profiles, no team, no token).

ALTER TABLE core.team_roster
  ADD COLUMN name text,
  ADD COLUMN sport_entry_product_id uuid REFERENCES core.sport_entry_product(id),
  ADD COLUMN visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private','members','event','public')),
  ADD COLUMN matching_authority text NOT NULL DEFAULT 'captain'
    CHECK (matching_authority IN ('captain','oc','both'));

COMMENT ON TABLE core.team_roster IS
  'The durable team (name, product, publication policy). Membership is roster_member; a competing selection is roster_version.';

-- The selection as it stood. draft is editable; proposed is frozen so TEA-04
-- impacts are calculated against a stable set; approved/superseded/rejected
-- are frozen forever — same rule as core.rule_version.
CREATE TABLE core.roster_version (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  team_id        uuid NOT NULL REFERENCES core.team_roster(id),
  version_no     integer NOT NULL CHECK (version_no > 0),
  status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','proposed','approved','superseded','rejected')),
  supersedes     uuid REFERENCES core.roster_version(id),
  published_by   uuid REFERENCES core.person(id),
  published_at   timestamptz,
  approved_by    uuid REFERENCES core.person(id),
  approved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, version_no),
  CONSTRAINT roster_version_approved_has_approver
    CHECK ((status IN ('approved','superseded')) = (approved_by IS NOT NULL))
);
CREATE INDEX roster_version_by_team ON core.roster_version (team_id, status);

CREATE FUNCTION core.roster_version_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'draft' THEN
    IF NEW.status = 'draft' THEN
      RAISE EXCEPTION 'cannot return a published roster version to draft';
    END IF;
    IF (NEW.team_id, NEW.version_no, NEW.supersedes)
       IS DISTINCT FROM
       (OLD.team_id, OLD.version_no, OLD.supersedes) THEN
      RAISE EXCEPTION
        'roster version % is frozen; propose a new version', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER roster_version_no_rewrite
  BEFORE UPDATE ON core.roster_version
  FOR EACH ROW EXECUTE FUNCTION core.roster_version_immutable();

REVOKE DELETE ON core.roster_version FROM app_rw;

-- Members of THIS version. competes is the category-math switch: a reserve
-- can sit on the version (so the substitute candidate is not lost) without
-- entering crew-average age. date_of_birth is copied so a later profile
-- correction cannot rewrite what this version decided — same idea as
-- category_audit.member_ages.
CREATE TABLE core.roster_selection (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  roster_version_id uuid NOT NULL REFERENCES core.roster_version(id) ON DELETE CASCADE,
  person_id         uuid NOT NULL REFERENCES core.person(id),
  membership_id     uuid REFERENCES core.roster_member(id),
  display_name      text NOT NULL,
  date_of_birth     date NOT NULL,
  role              text NOT NULL,
  position          integer NOT NULL,
  competes          boolean NOT NULL DEFAULT true,
  UNIQUE (roster_version_id, position),
  UNIQUE (roster_version_id, person_id),
  CONSTRAINT reserve_does_not_compete
    CHECK (role <> 'reserve' OR competes = false)
);
CREATE INDEX roster_selection_by_version ON core.roster_selection (roster_version_id);
CREATE INDEX roster_selection_competing
  ON core.roster_selection (roster_version_id)
  WHERE competes;

CREATE FUNCTION core.roster_selection_frozen() RETURNS trigger AS $$
DECLARE
  parent uuid := COALESCE(NEW.roster_version_id, OLD.roster_version_id);
  parent_status text;
BEGIN
  SELECT status INTO parent_status
    FROM core.roster_version WHERE id = parent;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION
      'roster version % is % — its selection is frozen; propose a new version',
      parent, parent_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

CREATE TRIGGER roster_selection_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON core.roster_selection
  FOR EACH ROW EXECUTE FUNCTION core.roster_selection_frozen();

-- An entry pins original and current versions the way it pins rule_version_id.
-- original never moves; current moves only onto an approved version.
ALTER TABLE core.registration_entry
  ADD COLUMN original_roster_version_id uuid REFERENCES core.roster_version(id),
  ADD COLUMN current_roster_version_id  uuid REFERENCES core.roster_version(id);

CREATE FUNCTION core.roster_pins_guard() RETURNS trigger AS $$
DECLARE
  v_status text;
  v_team uuid;
BEGIN
  IF OLD.original_roster_version_id IS NOT NULL
     AND NEW.original_roster_version_id IS DISTINCT FROM OLD.original_roster_version_id THEN
    RAISE EXCEPTION 'original roster version is frozen on the entry';
  END IF;
  IF NEW.current_roster_version_id IS NOT NULL THEN
    SELECT rv.status, rv.team_id INTO v_status, v_team
      FROM core.roster_version rv WHERE rv.id = NEW.current_roster_version_id;
    IF v_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'roster.version.not_approved'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.team_roster_id IS NOT NULL AND v_team IS DISTINCT FROM NEW.team_roster_id THEN
      RAISE EXCEPTION 'roster.version.wrong_team'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.original_roster_version_id IS NOT NULL THEN
    SELECT rv.status INTO v_status
      FROM core.roster_version rv WHERE rv.id = NEW.original_roster_version_id;
    IF v_status IS DISTINCT FROM 'approved' AND v_status IS DISTINCT FROM 'superseded' THEN
      RAISE EXCEPTION 'roster.version.not_approved'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER roster_pins_guard
  BEFORE INSERT OR UPDATE OF original_roster_version_id, current_roster_version_id
  ON core.registration_entry
  FOR EACH ROW EXECUTE FUNCTION core.roster_pins_guard();

-- TEA-04: the proposed version exists unapproved, with impacts recorded
-- *before* approval. Approving is the only thing that flips current.
CREATE TABLE core.roster_substitution (
  id                       uuid PRIMARY KEY DEFAULT uuidv7(),
  entry_id                 uuid NOT NULL REFERENCES core.registration_entry(id),
  from_version_id          uuid NOT NULL REFERENCES core.roster_version(id),
  proposed_version_id      uuid NOT NULL REFERENCES core.roster_version(id),
  status                   text NOT NULL DEFAULT 'proposed'
                             CHECK (status IN ('proposed','approved','rejected')),
  fee_impact_minor         bigint,              -- minor units; 0 means no fee change
  refund_impact_minor      bigint,
  from_category_id        text,
  to_category_id          text,
  accreditation_impact_key text,                -- i18n; never a sentence
  proposed_by              uuid REFERENCES core.person(id),
  proposed_at              timestamptz NOT NULL DEFAULT now(),
  decided_by               uuid REFERENCES core.person(id),
  decided_at               timestamptz,
  message_key              text,
  CONSTRAINT substitution_not_identity
    CHECK (from_version_id <> proposed_version_id),
  CONSTRAINT substitution_impacts_before_approval
    CHECK (status <> 'approved' OR (
      fee_impact_minor IS NOT NULL
      AND refund_impact_minor IS NOT NULL
      AND to_category_id IS NOT NULL
      AND accreditation_impact_key IS NOT NULL
    )),
  CONSTRAINT substitution_approved_has_decider
    CHECK (status = 'proposed' OR decided_by IS NOT NULL)
);
CREATE INDEX roster_substitution_by_entry ON core.roster_substitution (entry_id, proposed_at DESC);

CREATE FUNCTION core.roster_substitution_same_team() RETURNS trigger AS $$
DECLARE
  v_from_team uuid;
  v_to_team uuid;
  v_to_status text;
  v_entry_team uuid;
  v_current uuid;
BEGIN
  SELECT team_id INTO v_from_team FROM core.roster_version WHERE id = NEW.from_version_id;
  SELECT team_id, status INTO v_to_team, v_to_status
    FROM core.roster_version WHERE id = NEW.proposed_version_id;
  IF v_from_team IS DISTINCT FROM v_to_team THEN
    RAISE EXCEPTION 'roster.substitution.wrong_team'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT team_roster_id, current_roster_version_id
    INTO v_entry_team, v_current
    FROM core.registration_entry WHERE id = NEW.entry_id;
  IF v_entry_team IS DISTINCT FROM v_from_team THEN
    RAISE EXCEPTION 'roster.substitution.wrong_team'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'proposed' THEN
    IF v_to_status IS DISTINCT FROM 'proposed' THEN
      RAISE EXCEPTION 'roster.substitution.not_proposed'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_current IS DISTINCT FROM NEW.from_version_id THEN
      RAISE EXCEPTION 'roster.substitution.not_current'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER roster_substitution_same_team
  BEFORE INSERT OR UPDATE ON core.roster_substitution
  FOR EACH ROW EXECUTE FUNCTION core.roster_substitution_same_team();

-- The live roster does not move until this runs. Original stays readable.
CREATE FUNCTION core.approve_roster_substitution(p_id uuid, p_approver uuid) RETURNS uuid AS $$
DECLARE
  v_sub core.roster_substitution%ROWTYPE;
  v_entry_current uuid;
BEGIN
  SELECT * INTO v_sub FROM core.roster_substitution WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'roster.substitution.not_found';
  END IF;
  IF v_sub.status IS DISTINCT FROM 'proposed' THEN
    RAISE EXCEPTION 'roster.substitution.not_proposed'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT current_roster_version_id INTO v_entry_current
    FROM core.registration_entry WHERE id = v_sub.entry_id;
  IF v_entry_current IS DISTINCT FROM v_sub.from_version_id THEN
    RAISE EXCEPTION 'roster.substitution.not_current'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE core.roster_version
     SET status = 'approved', approved_by = p_approver, approved_at = now(),
         published_by = COALESCE(published_by, p_approver),
         published_at = COALESCE(published_at, now())
   WHERE id = v_sub.proposed_version_id;

  UPDATE core.roster_version
     SET status = 'superseded'
   WHERE id = v_sub.from_version_id
     AND status = 'approved';

  UPDATE core.roster_substitution
     SET status = 'approved', decided_by = p_approver, decided_at = now()
   WHERE id = p_id;

  UPDATE core.registration_entry
     SET current_roster_version_id = v_sub.proposed_version_id,
         updated_at = now()
   WHERE id = v_sub.entry_id;

  RETURN v_sub.proposed_version_id;
END $$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION core.approve_roster_substitution(uuid, uuid) TO app_rw;

-- Competing members of a version — the only input category maths may use.
CREATE FUNCTION core.roster_competing_ages(p_version_id uuid, p_reference date)
RETURNS TABLE (person_id uuid, role text, age_years integer) AS $$
  SELECT s.person_id,
         s.role,
         EXTRACT(YEAR FROM age(p_reference, s.date_of_birth))::integer
    FROM core.roster_selection s
   WHERE s.roster_version_id = p_version_id
     AND s.competes;
$$ LANGUAGE sql STABLE;

CREATE FUNCTION core.roster_competing_mean_age(p_version_id uuid, p_reference date)
RETURNS numeric AS $$
  SELECT avg(age_years)
    FROM core.roster_competing_ages(p_version_id, p_reference);
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION core.roster_competing_ages(uuid, date) TO app_rw;
GRANT EXECUTE ON FUNCTION core.roster_competing_mean_age(uuid, date) TO app_rw;

-- TEA-01: invite codes/links. token_hash is sha256 hex; a short code cannot
-- be stored here even by mistake — there is no token column.
CREATE TABLE core.team_invitation (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  team_id                uuid NOT NULL REFERENCES core.team_roster(id),
  sport_entry_product_id uuid NOT NULL REFERENCES core.sport_entry_product(id),
  token_hash             text UNIQUE NOT NULL,
  expires_at             timestamptz NOT NULL,
  inviter_person_id     uuid NOT NULL REFERENCES core.person(id),
  invitee_person_id     uuid REFERENCES core.person(id),
  invitee_email          citext,
  invitee_phone          text,
  status                 text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','accepted','declined','expired','cancelled')),
  accepted_by            uuid REFERENCES core.person(id),
  accepted_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invite_token_is_sha256
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT invitee_contact_present
    CHECK (invitee_person_id IS NOT NULL
        OR invitee_email IS NOT NULL
        OR invitee_phone IS NOT NULL),
  CONSTRAINT invitation_accepted_has_identity
    CHECK (status <> 'accepted' OR accepted_by IS NOT NULL)
);
CREATE INDEX team_invitation_by_team ON core.team_invitation (team_id, status);
CREATE INDEX team_invitation_expiry ON core.team_invitation (expires_at)
  WHERE status = 'pending';

CREATE TABLE core.team_join_request (
  id                     uuid PRIMARY KEY DEFAULT uuidv7(),
  team_id                uuid NOT NULL REFERENCES core.team_roster(id),
  sport_entry_product_id uuid NOT NULL REFERENCES core.sport_entry_product(id),
  requester_person_id   uuid NOT NULL REFERENCES core.person(id),
  status                 text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','accepted','declined','cancelled')),
  decided_by             uuid REFERENCES core.person(id),
  decided_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT join_request_decided_has_actor
    CHECK (status = 'pending' OR decided_by IS NOT NULL)
);
CREATE UNIQUE INDEX team_join_request_live
  ON core.team_join_request (team_id, requester_person_id)
  WHERE status = 'pending';
CREATE INDEX team_join_request_by_team ON core.team_join_request (team_id, status);

-- Pairwise partner-finder. Not a team code, not a join request — REG-07's
-- two-profile flow. Kept so it is not stretched into TEA-01.
CREATE TABLE core.partner_request (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id     uuid NOT NULL REFERENCES core.event(id),
  category_id  text NOT NULL,
  from_id      uuid NOT NULL REFERENCES core.athlete_profile(id),
  to_id        uuid NOT NULL REFERENCES core.athlete_profile(id),
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (from_id <> to_id)
);
CREATE UNIQUE INDEX partner_request_live
  ON core.partner_request (event_id, category_id, from_id, to_id)
  WHERE status IN ('pending','accepted');
CREATE INDEX partner_request_inbox ON core.partner_request (to_id, status);

-- Down Migration

DROP TABLE IF EXISTS core.partner_request;
DROP TABLE IF EXISTS core.team_join_request;
DROP TABLE IF EXISTS core.team_invitation;

DROP FUNCTION IF EXISTS core.roster_competing_mean_age(uuid, date);
DROP FUNCTION IF EXISTS core.roster_competing_ages(uuid, date);
DROP FUNCTION IF EXISTS core.approve_roster_substitution(uuid, uuid);

DROP TRIGGER IF EXISTS roster_substitution_same_team ON core.roster_substitution;
DROP FUNCTION IF EXISTS core.roster_substitution_same_team();
DROP TABLE IF EXISTS core.roster_substitution;

DROP TRIGGER IF EXISTS roster_pins_guard ON core.registration_entry;
DROP FUNCTION IF EXISTS core.roster_pins_guard();
ALTER TABLE core.registration_entry
  DROP COLUMN IF EXISTS current_roster_version_id,
  DROP COLUMN IF EXISTS original_roster_version_id;

DROP TRIGGER IF EXISTS roster_selection_frozen ON core.roster_selection;
DROP FUNCTION IF EXISTS core.roster_selection_frozen();
DROP TABLE IF EXISTS core.roster_selection;

DROP TRIGGER IF EXISTS roster_version_no_rewrite ON core.roster_version;
DROP FUNCTION IF EXISTS core.roster_version_immutable();
DROP TABLE IF EXISTS core.roster_version;

ALTER TABLE core.team_roster
  DROP COLUMN IF EXISTS matching_authority,
  DROP COLUMN IF EXISTS visibility,
  DROP COLUMN IF EXISTS sport_entry_product_id,
  DROP COLUMN IF EXISTS name;
