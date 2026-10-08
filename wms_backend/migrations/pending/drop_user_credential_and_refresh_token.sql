-- NOT in the migrate:up sequence. Apply only after Cognito is proven in
-- production; dropping credentials before that is unrecoverable.
-- Leave this file here unapplied. AUTH_PROVIDER=local still needs these tables.

-- Up Migration

DROP TABLE IF EXISTS core.refresh_token;
DROP TABLE IF EXISTS core.user_credential;

-- Down Migration

CREATE TABLE core.user_credential (
  person_id            uuid PRIMARY KEY REFERENCES core.person(id),
  email                citext UNIQUE NOT NULL,
  password_hash        text NOT NULL,
  failed_attempts       integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until         timestamptz,
  password_changed_at  timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.refresh_token (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id    uuid NOT NULL REFERENCES core.person(id),
  token_hash   text UNIQUE NOT NULL,
  family_id    uuid NOT NULL,
  issued_at    timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  replaced_by  uuid REFERENCES core.refresh_token(id)
);
CREATE INDEX refresh_token_by_family ON core.refresh_token (family_id);
CREATE INDEX refresh_token_by_person ON core.refresh_token (person_id);
