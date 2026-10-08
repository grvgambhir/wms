-- Up Migration

-- REG-11 / RUL-04: an administrator ending or replacing an athlete's entry must say why.
-- The admin screen asks for a reason, but a guarantee that lives only in the UI is not a
-- guarantee: another client, a script or a future screen could still write a silent cancellation
-- into the athlete's permanent record. The database refuses it instead.
--
-- Participant and system transitions are untouched: an athlete withdrawing chooses to, and a
-- system transition already carries its own machine reason key where one exists.

ALTER TABLE core.entry_status_event
  ADD CONSTRAINT admin_ending_status_has_reason
  CHECK (
    actor_kind <> 'admin'
    OR to_status NOT IN ('cancelled','disqualified','substituted')
    OR (reason IS NOT NULL AND length(btrim(reason)) >= 3)
  ) NOT VALID;

-- NOT VALID on purpose: rows written before this rule existed (demo cancellations made from the
-- admin screen while the reason was optional) cannot be given a reason after the fact, and the
-- status trail is append-only — REVOKE UPDATE, DELETE ... FROM app_rw. New rows are checked.
-- Once a clean database is seeded this can become `VALIDATE CONSTRAINT`.

-- Down Migration

ALTER TABLE core.entry_status_event
  DROP CONSTRAINT IF EXISTS admin_ending_status_has_reason;
