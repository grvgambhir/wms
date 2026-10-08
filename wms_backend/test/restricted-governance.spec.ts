/**
 * F08: restricted data is a boundary, not a label.
 *
 * The redacted para-class projection, legal holds, and the app role's
 * continued denial of restricted.* are database grants and triggers.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { PERSON_PURGE_BLOCKERS_SQL } from '../src/people/purge-blockers.sql';
import { asDatabaseRole, testOwnerPool, testRestrictedPool } from './db-url';

const CONNECTION = process.env.DATABASE_URL as string;

const id = (n: number) => `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

const EVENT = id(0xf0800);
const PERSON = id(0xf0820);
const DPO = id(0xf0821);
const CONSENT = id(0xf0830);
const NOTICE = id(0xf0831);
const REQ_SET = id(0xf0840);
const DOC = id(0xf0850);
const REF = id(0xf0851);
const FACT = id(0xf0852);
const PASSPORT = id(0xf0853);
const HOLD = id(0xf0860);
const NEED = id(0xf0870);
const RIGHTS = id(0xf0880);

let pool: Pool;
const asRole = asDatabaseRole;
const restricted = () => testRestrictedPool();

beforeAll(async () => {
  pool = new Pool({ connectionString: CONNECTION, max: 4 });
  await pool.query('SELECT 1');

  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1, 'como-f08', 'Como Lake 2027', '2027-09-17', '2027-09-26', '2027-12-31')`,
    [EVENT],
  );
  await pool.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
     VALUES ($1, 'f08.athlete@example.com', 'Para', 'Athlete', '1990-06-01'),
            ($2, 'f08.dpo@example.com', 'Dana', 'Officer', '1975-01-01')`,
    [PERSON, DPO],
  );
  await pool.query(
    `INSERT INTO core.consent (id, person_id, event_id, kind, granted, version, source)
     VALUES ($1, $2, $3, 'eligibility_medical_evidence', true, 'Sensitive v1', 'participant')`,
    [CONSENT, PERSON, EVENT],
  );
  await pool.query(
    `INSERT INTO core.privacy_notice (id, event_id, code, version_no, status, message_key, approved_by, approved_at)
     VALUES ($1, $2, 'sensitive_processing', 1, 'draft', 'privacy.notice.sensitive', $3, now())`,
    [NOTICE, EVENT, DPO],
  );
  await pool.query(
    `UPDATE core.privacy_notice SET status = 'approved', approved_at = now() WHERE id = $1`,
    [NOTICE],
  );

  await pool.query(
    `INSERT INTO core.evidence_requirement_set
       (id, event_id, code, document_kind, classification)
     VALUES ($1, $2, 'para_class', 'para_classification', 'restricted')`,
    [REQ_SET, EVENT],
  );
  await restricted().query(
    `INSERT INTO restricted.evidence_document
       (id, event_id, person_id, kind, requirement_set_id, lawful_basis, retain_until, consent_id, notice_id)
     VALUES ($1, $2, $3, 'para_classification', $4, 'explicit_consent', '2028-12-31', $5, $6)`,
    [DOC, EVENT, PERSON, REQ_SET, CONSENT, NOTICE],
  );
  await pool.query(
    `INSERT INTO core.protected_evidence_ref
       (id, person_id, event_id, kind, restricted_record_id)
     VALUES ($1, $2, $3, 'para_classification', $4)`,
    [REF, PERSON, EVENT, DOC],
  );
  await restricted().query(
    `INSERT INTO restricted.classification_fact
       (id, event_id, person_id, sport_code, class_code, verification_status,
        supporting_document_id, protected_evidence_id, consent_id, notice_id,
        lawful_basis, retain_until)
     VALUES ($1, $2, $3, 'swimming', 'S6', 'verified', $4, $5, $6, $7,
             'explicit_consent', '2028-12-31')`,
    [FACT, EVENT, PERSON, DOC, REF, CONSENT, NOTICE],
  );
  await restricted().query(
    `INSERT INTO restricted.identity_document
       (id, person_id, kind, document_number, lawful_basis, retain_until)
     VALUES ($1, $2, 'passport', 'AB1234567', 'contract', '2020-01-01')`,
    [PASSPORT, PERSON],
  );
  await restricted().query(
    `INSERT INTO restricted.accommodation_need
       (id, event_id, person_id, category, detail, companion_person_id,
        consent_id, notice_id, lawful_basis, valid_until, retain_until)
     VALUES ($1, $2, $3, 'mobility', 'wheelchair + hoist at pontoon', $4,
             $5, $6, 'explicit_consent', '2027-09-26', '2028-06-01')`,
    [NEED, EVENT, PERSON, DPO, CONSENT, NOTICE],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('F08 — redacted projection and restricted boundary', () => {
  it('returns para class S6, verified to classification_ro and withholds the document', async () => {
    const projected = await asRole(
      'classification_ro',
      `SELECT class_code, verification_status, evidence_exists
         FROM core.para_class_projection WHERE person_id = $1`,
      [PERSON],
    );
    expect(projected.rows[0]).toEqual({
      class_code: 'S6',
      verification_status: 'verified',
      evidence_exists: true,
    });

    const cols = await testOwnerPool().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'core' AND table_name = 'para_class_projection'
        ORDER BY column_name`,
    );
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual([
      'class_code',
      'event_id',
      'evidence_exists',
      'person_id',
      'sport_code',
      'verification_status',
    ]);

    await expect(asRole('app_rw', 'SELECT 1 FROM restricted.classification_fact')).rejects.toMatchObject({
      code: '42501',
    });
    await expect(asRole('app_rw', 'SELECT 1 FROM restricted.evidence_document')).rejects.toMatchObject({
      code: '42501',
    });
    await expect(asRole('app_rw', 'SELECT 1 FROM restricted.identity_document')).rejects.toMatchObject({
      code: '42501',
    });
    await expect(asRole('app_rw', 'SELECT 1 FROM core.para_class_projection')).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('lets a general reader see that protected evidence exists, not its contents', async () => {
    const seen = await asRole(
      'app_rw',
      `SELECT kind, restricted_record_id IS NOT NULL AS cited
         FROM core.protected_evidence_ref WHERE id = $1`,
      [REF],
    );
    expect(seen.rows[0]).toEqual({ kind: 'para_classification', cited: true });

    const leak = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'core' AND table_name = 'protected_evidence_ref'
          AND column_name IN ('s3_key','document_number','detail','class_code')`,
    );
    expect(leak.rows).toEqual([]);
  });

  it('a legal hold prevents deletion past a retention date', async () => {
    await pool.query(
      `INSERT INTO core.retention_hold
         (id, person_id, subject_schema, subject_table, subject_id, reason_key, placed_by)
       VALUES ($1, $2, 'restricted', 'identity_document', $3, 'privacy.hold.legal', $4)`,
      [HOLD, PERSON, PASSPORT, DPO],
    );

    await expect(
      testOwnerPool().query(`DELETE FROM restricted.identity_document WHERE id = $1`, [PASSPORT]),
    ).rejects.toThrow(/privacy\.retention\.hold_active/);

    await pool.query(`UPDATE core.retention_hold SET released_at = now() WHERE id = $1`, [HOLD]);
    const deleted = await testOwnerPool().query(`DELETE FROM restricted.identity_document WHERE id = $1`, [
      PASSPORT,
    ]);
    expect(deleted.rowCount).toBe(1);
  });

  it('accommodation reporting withholds the medical narrative from the operational path', async () => {
    const report = await asRole(
      'accommodation_ro',
      `SELECT category, companion_needed, companion_person_id
         FROM core.accommodation_operational WHERE id = $1`,
      [NEED],
    );
    expect(report.rows[0]).toEqual({
      category: 'mobility',
      companion_needed: true,
      companion_person_id: DPO,
    });

    const cols = await testOwnerPool().query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'core' AND table_name = 'accommodation_operational'
          AND column_name IN ('detail','lawful_basis','consent_id','retain_until')`,
    );
    expect(cols.rows).toEqual([]);

    await expect(asRole('app_rw', 'SELECT 1 FROM restricted.accommodation_need')).rejects.toMatchObject({
      code: '42501',
    });
    await expect(asRole('app_rw', 'SELECT 1 FROM core.accommodation_operational')).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('records a PRV-05 rights request across the in-scope components', async () => {
    await pool.query(
      `INSERT INTO core.rights_request (id, person_id, event_id, kind, status, requested_by, message_key)
       VALUES ($1, $2, $3, 'access', 'in_progress', $4, 'privacy.rights.access')`,
      [RIGHTS, PERSON, EVENT, DPO],
    );
    const components = [
      'postgres_core',
      'postgres_restricted',
      's3_ordinary',
      's3_restricted',
      'idp',
      'psp',
      'mail_provider',
    ];
    for (const component of components) {
      await pool.query(
        `INSERT INTO core.rights_request_component (request_id, component, searched_at, found, result_key)
         VALUES ($1, $2, now(), true, 'privacy.rights.component_searched')`,
        [RIGHTS, component],
      );
    }
    await pool.query(
      `INSERT INTO core.rights_request_completion
         (request_id, completed_by, evidence_s3_key, message_key)
       VALUES ($1, $2, 's3://audit/rights/f08-access.pdf', 'privacy.rights.completed')`,
      [RIGHTS, DPO],
    );
    await pool.query(`UPDATE core.rights_request SET status = 'completed' WHERE id = $1`, [RIGHTS]);

    const count = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM core.rights_request_component WHERE request_id = $1`,
      [RIGHTS],
    );
    expect(count.rows[0]!.n).toBe('7');
  });
});

describe('app_rw may ask, not read', () => {
  it('is not a member of restricted_rw', async () => {
    const membership = await pool.query<{ member: boolean }>(
      `SELECT pg_has_role('app_rw', 'restricted_rw', 'MEMBER') AS member`,
    );
    expect(membership.rows[0]?.member).toBe(false);
  });
  it('refuses a restricted table select and answers the boolean both ways', async () => {
    await expect(asRole('app_rw', 'SELECT 1 FROM restricted.evidence_document')).rejects.toMatchObject({
      code: '42501',
    });

    const withRows = await asRole(
      'app_rw',
      'SELECT restricted.person_has_restricted_data($1) AS yes',
      [PERSON],
    );
    expect(withRows.rows[0]?.yes).toBe(true);

    const clean = id(0xf0829);
    await pool.query(
      `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
       VALUES ($1, 'f08.clean@example.com', 'No', 'Restricted', '1992-02-02')
       ON CONFLICT (id) DO NOTHING`,
      [clean],
    );
    const withoutRows = await asRole(
      'app_rw',
      'SELECT restricted.person_has_restricted_data($1) AS yes',
      [clean],
    );
    expect(withoutRows.rows[0]?.yes).toBe(false);
  });

  it('reports has_restricted_data from the purge check while running as app_rw', async () => {
    const clean = id(0xf0829);
    await pool.query(
      `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
       VALUES ($1, 'f08.clean@example.com', 'No', 'Restricted', '1992-02-02')
       ON CONFLICT (id) DO NOTHING`,
      [clean],
    );

    const blocked = await asRole('app_rw', PERSON_PURGE_BLOCKERS_SQL, [PERSON]);
    expect(blocked.rows[0]?.blockers).toContain('has_restricted_data');

    const open = await asRole('app_rw', PERSON_PURGE_BLOCKERS_SQL, [clean]);
    expect(open.rows[0]?.blockers ?? []).not.toContain('has_restricted_data');
  });

  it('the purge blocker check still works with no restricted connection', async () => {
    const onlyApp = new Pool({ connectionString: CONNECTION, max: 1 });
    try {
      const client = await onlyApp.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE app_rw');
        const blocked = await client.query<{ blockers: string[] }>(PERSON_PURGE_BLOCKERS_SQL, [
          PERSON,
        ]);
        expect(blocked.rows[0]?.blockers).toContain('has_restricted_data');
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        client.release();
      }
    } finally {
      await onlyApp.end();
    }
  });
});
