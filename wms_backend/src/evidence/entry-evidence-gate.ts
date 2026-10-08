/**
 * The entry's evidence gate, recomputed from the evidence itself.
 *
 * A reviewer approving a document used to change nothing on the entry: `registration_entry`
 * only moved when the participant app called `PUT /v1/registration-entries/:id/evidence` and
 * told it what to think. So an athlete whose medical certificate had been approved still saw
 * "Review pending" and a locked checkout — the demo's first scenario, stuck.
 *
 * The gate now follows the documents, ordinary and restricted together:
 *
 * | Any required item | Gate |
 * |---|---|
 * | rejected | `rejected` |
 * | uploaded / under review | `pending_review` |
 * | all approved or waived | `approved` |
 * | otherwise | `required` |
 *
 * Restricted statuses cannot be read with the application pool — that is the point of the
 * boundary — so the restricted service passes them in. When they are not passed and the entry has
 * restricted evidence, this returns null and leaves the decision to the call that can see it all.
 */

import type { Queryable } from '../common/idempotency/idempotency.service';

export type EntryEvidenceGate = 'required' | 'pending_review' | 'approved' | 'rejected';

type StatusRow = { status: string };

export async function recomputeEntryEvidenceGate(
  db: Queryable,
  entryId: string,
  restrictedStatuses?: string[],
): Promise<EntryEvidenceGate | null> {
  const entry = await db.query<{ requires_evidence: boolean; evidence_status: string }>(
    `SELECT product.requires_evidence, entry.evidence_status
       FROM core.registration_entry entry
       JOIN core.sport_entry_product product ON product.id = entry.sport_entry_product_id
      WHERE entry.id = $1`,
    [entryId],
  );
  const header = entry.rows[0];
  if (!header || !header.requires_evidence) return null;

  const ordinary = await db.query<StatusRow>(
    `SELECT status FROM core.evidence_document WHERE entry_id = $1`,
    [entryId],
  );
  if (restrictedStatuses === undefined) {
    const { rows: refs } = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM core.protected_evidence_ref
        WHERE person_id = (
                SELECT athlete.person_id
                  FROM core.athlete_profile athlete
                  JOIN core.registration_entry entry ON entry.athlete_profile_id = athlete.id
                 WHERE entry.id = $1)
          AND event_id = (SELECT event_id FROM core.registration_entry WHERE id = $1)`,
      [entryId],
    );
    // Restricted evidence exists and this caller cannot see its state; the restricted path owns
    // the gate for this entry.
    if (Number(refs[0]?.count ?? '0') > 0) return null;
  }
  const rows = [...ordinary.rows, ...(restrictedStatuses ?? []).map((status) => ({ status }))];
  if (rows.length === 0) return null;

  const statuses = rows.map((row) => row.status);
  const gate: EntryEvidenceGate = statuses.includes('rejected')
    ? 'rejected'
    : statuses.some((status) => ['uploaded', 'under_review', 'pending_review'].includes(status))
      ? 'pending_review'
      : statuses.every((status) => ['approved', 'waived'].includes(status))
        ? 'approved'
        : 'required';

  if (gate === header.evidence_status) return gate;
  await db.query(
    `UPDATE core.registration_entry SET evidence_status = $2, updated_at = now() WHERE id = $1`,
    [entryId, gate],
  );

  // An approved gate is what unlocks checkout, so the entry has to move with it. One writer:
  // the status event first (the database trigger decides whether the transition is legal), the
  // row second, in this transaction — the same order `RegistrationMutations.writeStatus` uses.
  if (gate === 'approved' || gate === 'rejected') {
    const toStatus = gate === 'approved' ? 'pending_payment' : 'pending_evidence';
    const current = await db.query<{ status: string }>(
      `SELECT status FROM core.registration_entry WHERE id = $1 FOR UPDATE`,
      [entryId],
    );
    const from = current.rows[0]?.status;
    if (from && from !== toStatus && (from === 'pending_evidence' || from === 'pending_payment')) {
      await db.query(
        `INSERT INTO core.entry_status_event
           (entry_id, from_status, to_status, actor_kind, actor_id, reason)
         VALUES ($1, $2, $3, 'system', NULL, $4)`,
        [entryId, from, toStatus, gate === 'approved' ? 'evidence_approved' : 'evidence_rejected'],
      );
      await db.query(
        `UPDATE core.registration_entry SET status = $2, updated_at = now() WHERE id = $1`,
        [entryId, toStatus],
      );
      await db.query(
        `UPDATE core.registration_order o
            SET status = $2
           FROM core.order_line ol
          WHERE ol.order_id = o.id AND ol.entry_id = $1 AND o.status <> 'paid'`,
        [entryId, gate === 'approved' ? 'pending_payment' : 'draft'],
      );
    }
  }
  return gate;
}
