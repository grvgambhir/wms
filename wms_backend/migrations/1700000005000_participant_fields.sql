-- Up Migration

-- Shipped participant fields the plan's schema would otherwise drop on first
-- migrate. The participant pass already prints a validity window, and the
-- profile screen already saves a phone, portrait key, emergency contact and
-- passport number. None of those had a column. This is restore-what-ships,
-- not a new feature.

-- Phone and the bundled portrait key are ordinary profile fields. They are
-- not identity documents — a SELECT on a person is supposed to return them.
ALTER TABLE core.person
  ADD COLUMN phone             text,
  ADD COLUMN profile_image_key text;

-- A table, not three columns on person. The shipped UI collects one contact
-- today, but the RFP never caps it at one, and an inline triple would encode
-- the current form into the schema — a second contact would then be a
-- breaking migration. Rows keep 0-N without pretending the product decided
-- "exactly one". ordinal preserves display order when more than one exists.
-- Indexed on person_id because the profile screen loads contacts by owner.
CREATE TABLE core.emergency_contact (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id    uuid NOT NULL REFERENCES core.person(id),
  name         text NOT NULL,
  relationship text,
  phone        text NOT NULL,
  ordinal      smallint NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX emergency_contact_by_person ON core.emergency_contact (person_id);

-- PRV-04 classifies identity documents as restricted data, and §4.7 puts
-- that class in `restricted` with its own role and deliberately no FK back
-- to core — so a SELECT * on a person can never leak a passport number.
-- Putting it on core.person would defeat that boundary on day one.
-- lawful_basis and retain_until match the siblings in this schema: holding
-- an identity document is only defensible with a recorded basis and a date
-- it must be gone.
CREATE TABLE restricted.identity_document (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id        uuid NOT NULL,                   -- no FK: no join path from core
  kind             text NOT NULL DEFAULT 'passport',
  document_number  text NOT NULL,
  lawful_basis     text NOT NULL,
  retain_until     date NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX identity_document_by_person ON restricted.identity_document (person_id);
REVOKE ALL ON restricted.identity_document FROM app_rw, reporting_ro, PUBLIC;

-- §4.8 was specified in BACKEND_DB_PLAN.md but never applied, so there is
-- no table to ALTER. The plan's draft also omitted the validity window the
-- already-shipped pass prints (validFrom/validUntil), plus eligibility
-- status, sport name and QR payload which the same screens read.
-- badge_number is nullable because pending fixture records have no number
-- yet; UNIQUE still holds for issued badges (Postgres UNIQUE treats NULLs
-- as distinct). Indexed on person_id because the participant pass is loaded
-- by the athlete, not by badge number.
CREATE TABLE core.accreditation (
  id                    uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id              uuid NOT NULL REFERENCES core.event(id),
  person_id             uuid NOT NULL REFERENCES core.person(id),
  registration_entry_id uuid REFERENCES core.registration_entry(id),
  badge_number          text UNIQUE,                -- NULL until the OC issues
  role                  text NOT NULL,              -- Accreditation.accessLevel
  sport_name            text,                       -- printed on the pass
  zones                 text[] NOT NULL DEFAULT '{}',
  photo_status          text NOT NULL DEFAULT 'missing',
  eligibility_status    text NOT NULL DEFAULT 'pending',
  status                text NOT NULL DEFAULT 'pending',
  qr_value              text,                       -- payload the pass QR encodes
  valid_from            date NOT NULL,
  valid_until           date NOT NULL,
  issued_at             timestamptz,
  revoked_at            timestamptz,
  revoked_reason        text,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accreditation_window_ordered CHECK (valid_until >= valid_from)
);
CREATE INDEX accreditation_by_person ON core.accreditation (person_id);

-- Down Migration

DROP TABLE IF EXISTS core.accreditation;
DROP TABLE IF EXISTS restricted.identity_document;
DROP TABLE IF EXISTS core.emergency_contact;
ALTER TABLE core.person
  DROP COLUMN IF EXISTS profile_image_key,
  DROP COLUMN IF EXISTS phone;
