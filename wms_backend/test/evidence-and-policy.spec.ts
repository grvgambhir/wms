/**
 * F07 / F11: configurable evidence requirements and registration policies.
 *
 * Observable behaviour against real Postgres. Sport applicability, resubmission
 * lineage, waivers, expiry reporting, roster cardinality and frozen judgement
 * are database guarantees — a service-layer `if` that passed these would be
 * the wrong reason.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { testRestrictedPool } from './db-url';

const CONNECTION = process.env.DATABASE_URL as string;

const id = (n: number) => `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

const EVENT = id(0xf0700);
const ROWING = id(0xf0701);
const SWIMMING = id(0xf0702);
const RULE_SET_ROW = id(0xf0703);
const RULE_SET_SWIM = id(0xf0704);
const RULE_V_ROW = id(0xf0705);
const RULE_V_SWIM = id(0xf0706);
const PRODUCT_CREW = id(0xf0707);
const PRODUCT_SWIM = id(0xf0708);
const REQ_SET_LICENCE = id(0xf0710);
const REQ_V_LICENCE = id(0xf0711);
const REQ_SET_MEDICAL = id(0xf0712);
const REQ_V_MEDICAL = id(0xf0713);
const REQ_SET_FED = id(0xf0714);
const REQ_V_FED = id(0xf0715);
const PERSON = id(0xf0720);
const REVIEWER = id(0xf0721);
const PROFILE = id(0xf0722);
const ROSTER = id(0xf0723);
const ENTRY = id(0xf0724);
const OBLIGATION = id(0xf0730);
const UPLOAD_V1 = id(0xf0731);
const UPLOAD_V2 = id(0xf0732);
const POLICY_SET = id(0xf0740);
const POLICY_V1 = id(0xf0741);
const POLICY_V2 = id(0xf0742);

let pool: Pool;

const asApp = async (sql: string, params: unknown[] = []) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE app_rw');
    return await client.query(sql, params);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
};

beforeAll(async () => {
  pool = new Pool({ connectionString: CONNECTION, max: 4 });
  await pool.query('SELECT 1');

  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1, 'como-f07-f11', 'Como Lake 2027', '2027-09-17', '2027-09-26', '2027-12-31')`,
    [EVENT],
  );
  await pool.query(`INSERT INTO core.sport (id, event_id, code, name) VALUES ($1, $2, 'rowing', 'Rowing')`, [
    ROWING,
    EVENT,
  ]);
  await pool.query(`INSERT INTO core.sport (id, event_id, code, name) VALUES ($1, $2, 'swimming', 'Swimming')`, [
    SWIMMING,
    EVENT,
  ]);
  await pool.query(`INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1, $2, 'rowing')`, [
    RULE_SET_ROW,
    EVENT,
  ]);
  await pool.query(`INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1, $2, 'swimming')`, [
    RULE_SET_SWIM,
    EVENT,
  ]);
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1, $2, 1, '2027-12-31', tstzrange(now(), NULL), 'draft')`,
    [RULE_V_ROW, RULE_SET_ROW],
  );
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1, $2, 1, '2027-12-31', tstzrange(now(), NULL), 'draft')`,
    [RULE_V_SWIM, RULE_SET_SWIM],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product
       (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1, $2, $3, 'Rowing eight', 'crew', $4)`,
    [PRODUCT_CREW, EVENT, ROWING, RULE_SET_ROW],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product
       (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1, $2, $3, 'Swim 50 free', 'individual', $4)`,
    [PRODUCT_SWIM, EVENT, SWIMMING, RULE_SET_SWIM],
  );

  await pool.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
     VALUES ($1, 'f07.athlete@example.com', 'Alex', 'Rower', '1988-04-12'),
            ($2, 'f07.reviewer@example.com', 'Riley', 'Reviewer', '1979-11-02')`,
    [PERSON, REVIEWER],
  );
  await pool.query(`INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1, $2, $3)`, [
    PROFILE,
    PERSON,
    EVENT,
  ]);
  await pool.query(`INSERT INTO core.team_roster (id, event_id) VALUES ($1, $2)`, [ROSTER, EVENT]);
  await pool.query(
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, team_roster_id)
     VALUES ($1, $2, $3, $4, 'competitive', $5, $6)`,
    [ENTRY, EVENT, PROFILE, PRODUCT_CREW, RULE_V_ROW, ROSTER],
  );

  await pool.query(
    `INSERT INTO core.evidence_requirement_set
       (id, event_id, code, document_kind, classification)
     VALUES ($1, $2, 'rowing_licence', 'licence', 'ordinary')`,
    [REQ_SET_LICENCE, EVENT],
  );
  await pool.query(
    `INSERT INTO core.evidence_requirement_version
       (id, requirement_set_id, version_no, status, effective, requiredness, valid_through,
        accepted_mime_types, message_key)
     VALUES ($1, $2, 1, 'draft', tstzrange(now(), NULL), 'required', 'games_day',
             '{application/pdf}', 'evidence.rowing_licence.required')`,
    [REQ_V_LICENCE, REQ_SET_LICENCE],
  );
  await pool.query(
    `INSERT INTO core.evidence_requirement_applicability (requirement_version_id, sport_id)
     VALUES ($1, $2)`,
    [REQ_V_LICENCE, ROWING],
  );
  await pool.query(
    `INSERT INTO core.evidence_requirement_translation
       (requirement_version_id, issuing_country, message_key)
     VALUES ($1, 'CN', 'evidence.rowing_licence.translation_required')`,
    [REQ_V_LICENCE],
  );
  await pool.query(
    `INSERT INTO core.translation (event_id, entity_type, field, locale, value)
     VALUES ($1, 'evidence_requirement', 'evidence.rowing_licence.required', 'en', 'Rowing licence required'),
            ($1, 'evidence_requirement', 'evidence.rowing_licence.required', 'it', 'Licenza di canottaggio obbligatoria')`,
    [EVENT],
  );
  await pool.query(
    `UPDATE core.evidence_requirement_version SET status = 'active', published_at = now() WHERE id = $1`,
    [REQ_V_LICENCE],
  );

  await pool.query(
    `INSERT INTO core.evidence_requirement_set
       (id, event_id, code, document_kind, classification)
     VALUES ($1, $2, 'federation_membership', 'federation', 'ordinary')`,
    [REQ_SET_FED, EVENT],
  );
  await pool.query(
    `INSERT INTO core.evidence_requirement_version
       (id, requirement_set_id, version_no, status, effective, requiredness, valid_through, message_key)
     VALUES ($1, $2, 1, 'draft', tstzrange(now(), NULL), 'required_unless_waived', 'none',
             'evidence.federation.required')`,
    [REQ_V_FED, REQ_SET_FED],
  );
  await pool.query(
    `UPDATE core.evidence_requirement_version SET status = 'active', published_at = now() WHERE id = $1`,
    [REQ_V_FED],
  );

  await pool.query(
    `INSERT INTO core.evidence_requirement_set
       (id, event_id, code, document_kind, classification)
     VALUES ($1, $2, 'medical_certificate', 'medical_certificate', 'restricted')`,
    [REQ_SET_MEDICAL, EVENT],
  );
  await pool.query(
    `INSERT INTO core.evidence_requirement_version
       (id, requirement_set_id, version_no, status, effective, requiredness, valid_through, message_key)
     VALUES ($1, $2, 1, 'draft', tstzrange(now(), NULL), 'required_unless_waived', 'stated_expiry',
             'evidence.medical.required')`,
    [REQ_V_MEDICAL, REQ_SET_MEDICAL],
  );
  await pool.query(
    `UPDATE core.evidence_requirement_version SET status = 'active', published_at = now() WHERE id = $1`,
    [REQ_V_MEDICAL],
  );

  await pool.query(
    `INSERT INTO core.registration_policy_set (id, event_id, sport_entry_product_id, name)
     VALUES ($1, $2, $3, 'Rowing eight crew')`,
    [POLICY_SET, EVENT, PRODUCT_CREW],
  );
  await pool.query(
    `INSERT INTO core.registration_policy_version
       (id, policy_set_id, version_no, status, effective, max_live_entries)
     VALUES ($1, $2, 1, 'draft', tstzrange(now(), NULL), 3)`,
    [POLICY_V1, POLICY_SET],
  );
  await pool.query(
    `INSERT INTO core.registration_policy_roster_rule
       (policy_version_id, role, min_count, max_count, message_key)
     VALUES ($1, 'rower', 4, 4, 'registration.roster.rower_cardinality'),
            ($1, 'coxswain', 1, 1, 'registration.roster.cox_cardinality')`,
    [POLICY_V1],
  );
  await pool.query(
    `UPDATE core.registration_policy_version SET status = 'active', published_at = now() WHERE id = $1`,
    [POLICY_V1],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('F07 — evidence requirements', () => {
  it('a requirement applying to one sport does not apply to another', async () => {
    const rowing = await pool.query(
      `SELECT document_kind FROM core.evidence_requirements_for($1, $2, $3)`,
      [EVENT, ROWING, PRODUCT_CREW],
    );
    const swimming = await pool.query(
      `SELECT document_kind FROM core.evidence_requirements_for($1, $2, $3)`,
      [EVENT, SWIMMING, PRODUCT_SWIM],
    );
    expect(rowing.rows.map((r) => r.document_kind)).toContain('licence');
    expect(swimming.rows.map((r) => r.document_kind)).not.toContain('licence');
  });

  it('rejected v1 and accepted v2 are the same obligation, and the history survives', async () => {
    await pool.query(
      `INSERT INTO core.evidence_obligation (id, event_id, person_id, requirement_set_id)
       VALUES ($1, $2, $3, $4)`,
      [OBLIGATION, EVENT, PERSON, REQ_SET_LICENCE],
    );
    await pool.query(
      `INSERT INTO core.evidence_obligation_application (obligation_id, entry_id)
       VALUES ($1, $2)`,
      [OBLIGATION, ENTRY],
    );
    await pool.query(
      `INSERT INTO core.evidence_upload
         (id, obligation_id, version_no, s3_key, mime_type, issuing_country, issued_on, expires_on)
       VALUES ($1, $2, 1, 's3://evidence/licence-v1.pdf', 'application/pdf', 'IT', '2025-01-01', '2028-01-01')`,
      [UPLOAD_V1, OBLIGATION],
    );
    await pool.query(
      `INSERT INTO core.evidence_review (upload_id, decision, reviewer_id, reason_key)
       VALUES ($1, 'rejected', $2, 'evidence.rejected.illegible')`,
      [UPLOAD_V1, REVIEWER],
    );
    await pool.query(
      `INSERT INTO core.evidence_upload
         (id, obligation_id, version_no, s3_key, mime_type, issuing_country, issued_on, expires_on)
       VALUES ($1, $2, 2, 's3://evidence/licence-v2.pdf', 'application/pdf', 'IT', '2025-06-01', '2028-06-01')`,
      [UPLOAD_V2, OBLIGATION],
    );
    await pool.query(
      `INSERT INTO core.evidence_review (upload_id, decision, reviewer_id)
       VALUES ($1, 'approved', $2)`,
      [UPLOAD_V2, REVIEWER],
    );

    const versions = await pool.query<{ version_no: number; decision: string }>(
      `SELECT u.version_no, r.decision
         FROM core.evidence_upload u
         JOIN core.evidence_review r ON r.upload_id = u.id
        WHERE u.obligation_id = $1
        ORDER BY u.version_no`,
      [OBLIGATION],
    );
    expect(versions.rows).toEqual([
      { version_no: 1, decision: 'rejected' },
      { version_no: 2, decision: 'approved' },
    ]);

    const obligations = await pool.query(
      `SELECT count(*)::int AS n FROM core.evidence_obligation WHERE person_id = $1 AND requirement_set_id = $2`,
      [PERSON, REQ_SET_LICENCE],
    );
    expect(obligations.rows[0]!.n).toBe(1);

    await expect(
      pool.query(`UPDATE core.evidence_upload SET s3_key = 'tampered' WHERE id = $1`, [UPLOAD_V1]),
    ).rejects.toThrow(/immutable/);

    await expect(asApp('DELETE FROM core.evidence_review')).rejects.toMatchObject({ code: '42501' });
  });

  it('an approved waiver removes a requirement without deleting it', async () => {
    const missingId = id(0xf0750);
    await pool.query(
      `INSERT INTO core.evidence_obligation (id, event_id, person_id, requirement_set_id)
       VALUES ($1, $2, $3, $4)`,
      [missingId, EVENT, PERSON, REQ_SET_FED],
    );

    const before = await pool.query(
      `SELECT outstanding_reason FROM core.evidence_outstanding WHERE obligation_id = $1`,
      [missingId],
    );
    expect(before.rows[0]!.outstanding_reason).toBe('missing');

    await pool.query(
      `INSERT INTO core.evidence_waiver
         (event_id, person_id, requirement_set_id, requirement_version_id, approved_by, reason_key)
       VALUES ($1, $2, $3, $4, $5, 'evidence.waiver.federation_authorised')`,
      [EVENT, PERSON, REQ_SET_FED, REQ_V_FED, REVIEWER],
    );

    const after = await pool.query(
      `SELECT outstanding_reason FROM core.evidence_outstanding WHERE obligation_id = $1`,
      [missingId],
    );
    expect(after.rows).toHaveLength(0);

    const stillThere = await pool.query(
      `SELECT 1 FROM core.evidence_obligation WHERE id = $1`,
      [missingId],
    );
    expect(stillThere.rows).toHaveLength(1);

    const setStillThere = await pool.query(
      `SELECT 1 FROM core.evidence_requirement_set WHERE id = $1`,
      [REQ_SET_FED],
    );
    expect(setStillThere.rows).toHaveLength(1);
  });

  it('an expired licence appears in an outstanding/expired query', async () => {
    const expiredPerson = id(0xf0760);
    const expiredProfile = id(0xf0761);
    const expiredObligation = id(0xf0762);
    await pool.query(
      `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
       VALUES ($1, 'f07.expired@example.com', 'Ex', 'Pired', '1984-07-20')`,
      [expiredPerson],
    );
    await pool.query(`INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1, $2, $3)`, [
      expiredProfile,
      expiredPerson,
      EVENT,
    ]);
    await pool.query(
      `INSERT INTO core.evidence_obligation (id, event_id, person_id, requirement_set_id)
       VALUES ($1, $2, $3, $4)`,
      [expiredObligation, EVENT, expiredPerson, REQ_SET_LICENCE],
    );
    await pool.query(
      `INSERT INTO core.evidence_upload
         (obligation_id, version_no, s3_key, mime_type, issuing_country, issued_on, expires_on)
       VALUES ($1, 1, 's3://evidence/expired.pdf', 'application/pdf', 'IT', '2020-01-01', '2021-01-01')`,
      [expiredObligation],
    );
    const upload = await pool.query<{ id: string }>(
      `SELECT id FROM core.evidence_upload WHERE obligation_id = $1`,
      [expiredObligation],
    );
    await pool.query(
      `INSERT INTO core.evidence_review (upload_id, decision, reviewer_id)
       VALUES ($1, 'approved', $2)`,
      [upload.rows[0]!.id, REVIEWER],
    );

    const expired = await pool.query(
      `SELECT outstanding_reason FROM core.evidence_outstanding
        WHERE obligation_id = $1 AND outstanding_reason = 'expired'`,
      [expiredObligation],
    );
    expect(expired.rows).toHaveLength(1);
  });

  it('refuses a second live obligation for the same person and requirement', async () => {
    await expect(
      pool.query(
        `INSERT INTO core.evidence_obligation (event_id, person_id, requirement_set_id)
         VALUES ($1, $2, $3)`,
        [EVENT, PERSON, REQ_SET_LICENCE],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('stores refusal copy as an i18n key, never as English on the requirement', async () => {
    const row = await pool.query<{ message_key: string }>(
      `SELECT message_key FROM core.evidence_requirement_version WHERE id = $1`,
      [REQ_V_LICENCE],
    );
    expect(row.rows[0]!.message_key).toBe('evidence.rowing_licence.required');
    expect(row.rows[0]!.message_key.includes(' ')).toBe(false);
  });
});

describe('F07 — restricted evidence uses the same lifecycle', () => {
  const DOC = id(0xf0770);
  const R_UPLOAD_V1 = id(0xf0771);
  const R_UPLOAD_V2 = id(0xf0772);

  it('rejected v1 and accepted v2 share one restricted document; app_rw cannot read it', async () => {
    await testRestrictedPool().query(
      `INSERT INTO restricted.evidence_document
         (id, event_id, person_id, entry_id, kind, requirement_set_id, lawful_basis, retain_until)
       VALUES ($1, $2, $3, $4, 'medical_certificate', $5, 'explicit_consent', '2028-12-31')`,
      [DOC, EVENT, PERSON, ENTRY, REQ_SET_MEDICAL],
    );
    await testRestrictedPool().query(
      `INSERT INTO restricted.evidence_upload
         (id, document_id, version_no, s3_key, mime_type, issuing_country, issued_on, expires_on)
       VALUES ($1, $2, 1, 's3://restricted/med-v1.pdf', 'application/pdf', 'IT', '2025-01-01', '2026-01-01')`,
      [R_UPLOAD_V1, DOC],
    );
    await testRestrictedPool().query(
      `INSERT INTO restricted.evidence_review (upload_id, decision, reviewer_id, reason_key)
       VALUES ($1, 'rejected', $2, 'evidence.rejected.expired_scan')`,
      [R_UPLOAD_V1, REVIEWER],
    );
    await testRestrictedPool().query(
      `INSERT INTO restricted.evidence_upload
         (id, document_id, version_no, s3_key, mime_type, issuing_country, issued_on, expires_on)
       VALUES ($1, $2, 2, 's3://restricted/med-v2.pdf', 'application/pdf', 'IT', '2026-02-01', '2028-02-01')`,
      [R_UPLOAD_V2, DOC],
    );
    await testRestrictedPool().query(
      `INSERT INTO restricted.evidence_review (upload_id, decision, reviewer_id)
       VALUES ($1, 'approved', $2)`,
      [R_UPLOAD_V2, REVIEWER],
    );

    const history = await testRestrictedPool().query(
      `SELECT u.version_no, r.decision, r.reason_key
         FROM restricted.evidence_upload u
         JOIN restricted.evidence_review r ON r.upload_id = u.id
        WHERE u.document_id = $1
        ORDER BY u.version_no`,
      [DOC],
    );
    expect(history.rows).toEqual([
      { version_no: 1, decision: 'rejected', reason_key: 'evidence.rejected.expired_scan' },
      { version_no: 2, decision: 'approved', reason_key: null },
    ]);

    await expect(asApp('SELECT 1 FROM restricted.evidence_document')).rejects.toMatchObject({
      code: '42501',
    });
    await expect(asApp('SELECT 1 FROM restricted.evidence_upload')).rejects.toMatchObject({
      code: '42501',
    });
    await expect(asApp('SELECT 1 FROM restricted.evidence_review')).rejects.toMatchObject({
      code: '42501',
    });
  });
});

describe('F11 — registration policy', () => {
  it('refuses a roster that exceeds the configured cardinality', async () => {
    for (let i = 0; i < 4; i += 1) {
      await pool.query(
        `INSERT INTO core.roster_member (roster_id, person_id, display_name, date_of_birth, role, position)
         VALUES ($1, $2, $3, '1990-01-15', 'rower', $4)`,
        [ROSTER, PERSON, `Rower ${i + 1}`, i + 1],
      );
    }
    await pool.query(
      `INSERT INTO core.roster_member (roster_id, person_id, display_name, date_of_birth, role, position)
       VALUES ($1, $2, 'Cox', '1988-05-01', 'coxswain', 5)`,
      [ROSTER, PERSON],
    );

    await expect(
      pool.query(
        `INSERT INTO core.roster_member (roster_id, person_id, display_name, date_of_birth, role, position)
         VALUES ($1, $2, 'Fifth rower', '1991-03-03', 'rower', 6)`,
        [ROSTER, PERSON],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('a policy edit after an entry was judged does not change that entry’s judgement', async () => {
    const thinRoster = id(0xf0780);
    const thinEntry = id(0xf0781);
    const thinProfile = id(0xf0782);
    const thinPerson = id(0xf0783);
    await pool.query(
      `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
       VALUES ($1, 'f11.thin@example.com', 'Thin', 'Crew', '1987-02-14')`,
      [thinPerson],
    );
    await pool.query(`INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1, $2, $3)`, [
      thinProfile,
      thinPerson,
      EVENT,
    ]);
    await pool.query(`INSERT INTO core.team_roster (id, event_id) VALUES ($1, $2)`, [thinRoster, EVENT]);
    await pool.query(
      `INSERT INTO core.registration_entry
         (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, team_roster_id)
       VALUES ($1, $2, $3, $4, 'competitive', $5, $6)`,
      [thinEntry, EVENT, thinProfile, PRODUCT_CREW, RULE_V_ROW, thinRoster],
    );
    await pool.query(
      `INSERT INTO core.roster_member (roster_id, display_name, date_of_birth, role, position)
       VALUES ($1, 'Only one', '1990-01-15', 'rower', 1)`,
      [thinRoster],
    );

    const evalId = await pool.query<{ evaluate_registration_policy: string }>(
      `SELECT core.evaluate_registration_policy($1, $2)`,
      [thinEntry, POLICY_V1],
    );
    const first = await pool.query<{ result: string; policy_version_id: string; message_key: string }>(
      `SELECT result, policy_version_id, message_key FROM core.registration_policy_evaluation WHERE id = $1`,
      [evalId.rows[0]!.evaluate_registration_policy],
    );
    expect(first.rows[0]!.result).toBe('fail');
    expect(first.rows[0]!.policy_version_id).toBe(POLICY_V1);
    expect(first.rows[0]!.message_key).toBe('registration.roster.rower_cardinality');

    await expect(
      pool.query(
        `UPDATE core.registration_policy_roster_rule SET min_count = 1 WHERE policy_version_id = $1 AND role = 'rower'`,
        [POLICY_V1],
      ),
    ).rejects.toThrow(/frozen/);

    await pool.query(
      `UPDATE core.registration_policy_version
          SET status = 'superseded', effective = tstzrange(lower(effective), now())
        WHERE id = $1`,
      [POLICY_V1],
    );
    await pool.query(
      `INSERT INTO core.registration_policy_version
         (id, policy_set_id, version_no, status, effective, max_live_entries)
       VALUES ($1, $2, 2, 'draft', tstzrange(now(), NULL), 3)`,
      [POLICY_V2, POLICY_SET],
    );
    await pool.query(
      `INSERT INTO core.registration_policy_roster_rule
         (policy_version_id, role, min_count, max_count, message_key)
       VALUES ($1, 'rower', 1, 4, 'registration.roster.rower_cardinality')`,
      [POLICY_V2],
    );
    await pool.query(
      `UPDATE core.registration_policy_version SET status = 'active', published_at = now() WHERE id = $1`,
      [POLICY_V2],
    );

    const still = await pool.query<{ result: string; policy_version_id: string }>(
      `SELECT result, policy_version_id FROM core.registration_policy_evaluation WHERE id = $1`,
      [evalId.rows[0]!.evaluate_registration_policy],
    );
    expect(still.rows[0]!.result).toBe('fail');
    expect(still.rows[0]!.policy_version_id).toBe(POLICY_V1);

    const pinned = await pool.query<{ policy_version_id: string }>(
      `SELECT policy_version_id FROM core.registration_entry WHERE id = $1`,
      [thinEntry],
    );
    expect(pinned.rows[0]!.policy_version_id).toBe(POLICY_V1);

    await expect(asApp('UPDATE core.registration_policy_evaluation SET result = $1', ['pass'])).rejects.toMatchObject(
      { code: '42501' },
    );
  });

  it('the app role still cannot read restricted.*', async () => {
    await expect(asApp('SELECT 1 FROM restricted.evidence_document')).rejects.toMatchObject({ code: '42501' });
    await expect(asApp('SELECT 1 FROM restricted.evidence_outstanding')).rejects.toMatchObject({
      code: '42501',
    });
    await expect(asApp('SELECT 1 FROM restricted.identity_document')).rejects.toMatchObject({ code: '42501' });
  });
});
