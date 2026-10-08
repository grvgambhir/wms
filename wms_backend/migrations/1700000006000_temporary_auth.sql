-- Up Migration

-- TEMPORARY AUTH — placeholder until decision D5 selects an identity provider.
-- Not production: no MFA (PLT-04 is a mandatory gate item), no password reset,
-- passwords stored locally. Drop these tables when LocalIdentityProvider is replaced.
-- Nothing outside this migration and src/auth should reference them.

CREATE TABLE core.user_credential (
  person_id            uuid PRIMARY KEY REFERENCES core.person(id),
  email                citext UNIQUE NOT NULL,
  password_hash        text NOT NULL,
  failed_attempts      integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until         timestamptz,
  password_changed_at  timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.refresh_token (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id    uuid NOT NULL REFERENCES core.person(id),
  token_hash   text UNIQUE NOT NULL,              -- sha256 of the raw token; never the token
  family_id    uuid NOT NULL,
  issued_at    timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  replaced_by  uuid REFERENCES core.refresh_token(id)
);
CREATE INDEX refresh_token_by_family ON core.refresh_token (family_id);
CREATE INDEX refresh_token_by_person ON core.refresh_token (person_id);

CREATE TABLE core.role (
  code        text PRIMARY KEY,
  description text NOT NULL
);

INSERT INTO core.role (code, description) VALUES
  ('participant', 'Registered athlete or team member'),
  ('oc_staff',    'Organising committee staff'),
  ('oc_admin',    'Organising committee administrator'),
  ('finance',     'Finance / refund dual-control');

-- PK is (person_id, role_code) as specified: one grant of a given role per person.
-- event_id records which edition the grant is for (NULL = global). The same person
-- can be oc_staff for one edition and a participant in another (different role_code).
CREATE TABLE core.person_role (
  person_id  uuid NOT NULL REFERENCES core.person(id),
  role_code  text NOT NULL REFERENCES core.role(code),
  event_id   uuid REFERENCES core.event(id),
  granted_by uuid REFERENCES core.person(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, role_code)
);
CREATE INDEX person_role_by_event ON core.person_role (event_id) WHERE event_id IS NOT NULL;

-- Down Migration

DROP TABLE IF EXISTS core.person_role;
DROP TABLE IF EXISTS core.role;
DROP TABLE IF EXISTS core.refresh_token;
DROP TABLE IF EXISTS core.user_credential;
