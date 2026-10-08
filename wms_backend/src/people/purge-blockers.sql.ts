/**
 * One-statement eligibility check for purging a person with no obligations.
 * Returns blocker reason keys; an empty array means purgeable.
 */
const PERSON_PURGE_BLOCKERS_EXPR = `
array_remove(ARRAY[
  CASE WHEN p.profile_status IS DISTINCT FROM 'placeholder' THEN 'has_signed_in' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM core.registration_order o WHERE o.payer_person_id = p.id
  ) THEN 'has_registration_order' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM core.payment_intent pi
     WHERE pi.payer_person_id = p.id
        OR EXISTS (
          SELECT 1 FROM core.registration_order ro
           WHERE ro.id = pi.order_id AND ro.payer_person_id = p.id
        )
  ) THEN 'has_payment_intent' END,
  CASE WHEN EXISTS (
    SELECT 1
      FROM core.payment_allocation pa
      JOIN core.payment_intent pi ON pi.id = pa.intent_id
      LEFT JOIN core.registration_order ro ON ro.id = pi.order_id
     WHERE pi.payer_person_id = p.id OR ro.payer_person_id = p.id
  ) THEN 'has_payment_allocation' END,
  CASE WHEN EXISTS (
    SELECT 1
      FROM core.registration_entry re
      JOIN core.athlete_profile ap ON ap.id = re.athlete_profile_id
     WHERE ap.person_id = p.id
  ) THEN 'has_registration_entry' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM core.accreditation a WHERE a.person_id = p.id
  ) THEN 'has_accreditation' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM core.roster_member rm WHERE rm.person_id = p.id
  ) THEN 'has_roster_member' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM core.roster_selection rs WHERE rs.person_id = p.id
  ) THEN 'has_roster_selection' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM core.protected_evidence_ref per WHERE per.person_id = p.id
  ) OR restricted.person_has_restricted_data(p.id) THEN 'has_restricted_data' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM core.retention_hold rh
     WHERE rh.person_id = p.id AND rh.released_at IS NULL
  ) THEN 'has_retention_hold' END
], NULL)`;

export const PERSON_PURGE_BLOCKERS_SQL = `
SELECT ${PERSON_PURGE_BLOCKERS_EXPR} AS blockers
  FROM core.person p
 WHERE p.id = $1
`;

export const PERSON_PURGE_BLOCKERS_BATCH_SQL = `
SELECT p.id AS person_id,
       ${PERSON_PURGE_BLOCKERS_EXPR} AS blockers
  FROM core.person p
 WHERE p.id = ANY($1::uuid[])
`;

export const PURGE_BLOCKER_LABELS: Record<string, string> = {
  has_signed_in: 'This person has signed in and completed or started a profile.',
  has_registration_order: 'This person has a registration order.',
  has_payment_intent: 'This person has a payment intent.',
  has_payment_allocation: 'This person has a payment allocation.',
  has_registration_entry: 'This person has a registration entry.',
  has_accreditation: 'This person has been issued accreditation.',
  has_roster_member: 'This person is on a team roster.',
  has_roster_selection: 'This person appears in a roster selection.',
  has_restricted_data: 'This person has restricted medical, classification, or identity data.',
  has_retention_hold: 'This person has an active retention hold.',
};

export function formatPurgeBlockers(blockers: string[]): string {
  return blockers.map((key) => PURGE_BLOCKER_LABELS[key] ?? key).join(' ');
}
