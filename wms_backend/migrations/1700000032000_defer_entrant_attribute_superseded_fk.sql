-- Up Migration
-- A newly verified fact replaces the current fact in one transaction.  Mark the old fact
-- superseded before inserting its successor so the current-fact unique index is never violated;
-- the self-reference is valid by COMMIT once the successor has been inserted.
ALTER TABLE core.entrant_attribute
  DROP CONSTRAINT entrant_attribute_superseded_by_fkey,
  ADD CONSTRAINT entrant_attribute_superseded_by_fkey
    FOREIGN KEY (superseded_by) REFERENCES core.entrant_attribute(id)
    DEFERRABLE INITIALLY DEFERRED;

-- Down Migration
ALTER TABLE core.entrant_attribute
  DROP CONSTRAINT entrant_attribute_superseded_by_fkey,
  ADD CONSTRAINT entrant_attribute_superseded_by_fkey
    FOREIGN KEY (superseded_by) REFERENCES core.entrant_attribute(id);
