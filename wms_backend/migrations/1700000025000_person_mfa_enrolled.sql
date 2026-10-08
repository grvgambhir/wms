-- Up Migration
-- Enrolment record for the OC MFA threshold. Cognito is the factor; this column
-- is how we count enrolled oc_admins without AdminGetUser.

ALTER TABLE core.person
  ADD COLUMN mfa_enrolled_at timestamptz;

-- Down Migration

ALTER TABLE core.person
  DROP COLUMN IF EXISTS mfa_enrolled_at;
