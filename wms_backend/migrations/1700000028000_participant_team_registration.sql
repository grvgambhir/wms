-- Up Migration

-- REG-06 / REG-07: an invitation must retain the role chosen under the entry's policy, and a
-- partner request must retain the exact doubles entry it configures.  Without the latter an
-- accepting athlete could attach themselves to whichever of the sender's entries happened to
-- be newest at response time.

ALTER TABLE core.team_invitation
  ADD COLUMN role text;

ALTER TABLE core.partner_request
  ADD COLUMN entry_id uuid REFERENCES core.registration_entry(id);

CREATE INDEX partner_request_by_entry
  ON core.partner_request (entry_id, status)
  WHERE entry_id IS NOT NULL;

-- New requests always carry the entry. Historical demo rows deliberately remain nullable: no
-- migration can safely infer which of a sender's entries an old generic request intended.

-- Down Migration

DROP INDEX IF EXISTS core.partner_request_by_entry;

ALTER TABLE core.partner_request
  DROP COLUMN IF EXISTS entry_id;

ALTER TABLE core.team_invitation
  DROP COLUMN IF EXISTS role;
