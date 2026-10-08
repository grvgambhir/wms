import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { AccreditationService } from '../src/accreditation/accreditation.service';
import { pool } from '../src/db/pool';
import { EvidenceService } from '../src/evidence/evidence.service';
import { RestrictedEvidenceService } from '../src/evidence/restricted-evidence.service';
import { createRestrictedPool } from '../src/evidence/restricted-pool';
import { AdminPeopleService } from '../src/people/admin-people.service';
import { ConsentService } from '../src/people/consent.service';
import { PartnerService } from '../src/roster/partner.service';
import { expectFixedQueryCount } from './query-count';
import { testOwnerPool } from './db-url';

const EVENT = randomUUID();
const SPORT = randomUUID();
const RULE_SET = randomUUID();
const RULE_VERSION = randomUUID();
const PRODUCT = randomUUID();
const PERSON = randomUUID();
const REVIEWER = randomUUID();
const PROFILE = randomUUID();
const ENTRY = randomUUID();
const PREFIX = randomUUID().slice(0, 8);

const evidence = new EvidenceService(undefined as never, undefined as never);
const restrictedPool = createRestrictedPool();
const restricted = new RestrictedEvidenceService(
  undefined as never,
  undefined as never,
  evidence,
  restrictedPool,
);
const people = new AdminPeopleService(undefined as never, undefined as never);
const consents = new ConsentService(undefined as never);
const partners = new PartnerService(undefined as never);
const accreditations = new AccreditationService(undefined as never);

async function seedBase(): Promise<void> {
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1, $2, 'Query count', '2027-09-17', '2027-09-26', '2027-12-31')`,
    [EVENT, `query-count-${PREFIX}`],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name)
     VALUES ($1, $2, $3, 'Query Count Sport')`,
    [SPORT, EVENT, `query-count-${PREFIX}`],
  );
  await pool.query(`INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1, $2, $3)`, [
    RULE_SET,
    EVENT,
    `query-count-${PREFIX}`,
  ]);
  await pool.query(
    `INSERT INTO core.rule_version
       (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1, $2, 1, '2027-12-31', tstzrange(now(), NULL), 'draft')`,
    [RULE_VERSION, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product
       (id, event_id, sport_id, name, participant_type, rule_set_id, requires_evidence)
     VALUES ($1, $2, $3, 'Query Count Product', 'individual', $4, true)`,
    [PRODUCT, EVENT, SPORT, RULE_SET],
  );
  await pool.query(
    `INSERT INTO core.person
       (id, email, given_name, family_name, date_of_birth)
     VALUES ($1, $2, 'Query', 'Owner', '1985-01-01'),
            ($3, $4, 'Query', 'Reviewer', '1970-01-01')`,
    [PERSON, `query.owner.${PREFIX}@example.com`, REVIEWER, `query.reviewer.${PREFIX}@example.com`],
  );
  await pool.query(
    `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1, $2, $3)`,
    [PROFILE, PERSON, EVENT],
  );
  await pool.query(
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id)
     VALUES ($1, $2, $3, $4, 'competitive', $5)`,
    [ENTRY, EVENT, PROFILE, PRODUCT, RULE_VERSION],
  );

  await pool.query(
    `INSERT INTO core.person (email, given_name, family_name, date_of_birth)
     SELECT $1 || candidate || '@example.com',
            'Candidate' || lpad(candidate::text, 3, '0'), 'Query', '1985-01-01'
       FROM generate_series(1, 210) AS candidate`,
    [`query.${PREFIX}.`],
  );
  await pool.query(
    `INSERT INTO core.athlete_profile (person_id, event_id)
     SELECT id, $1 FROM core.person WHERE email::text LIKE $2`,
    [EVENT, `query.${PREFIX}.%@example.com`],
  );
}

async function seedEvidence(from: number, to: number): Promise<void> {
  await pool.query(
    `INSERT INTO core.evidence_requirement_set
       (event_id, code, document_kind, classification)
     SELECT $1, $2 || '-ordinary-' || n, 'identity_document', 'ordinary'
       FROM generate_series($3::int, $4::int) AS n`,
    [EVENT, PREFIX, from, to],
  );
  await pool.query(
    `INSERT INTO core.evidence_requirement_set
       (event_id, code, document_kind, classification)
     SELECT $1, $2 || '-restricted-' || n, 'medical_certificate', 'restricted'
       FROM generate_series($3::int, $4::int) AS n`,
    [EVENT, PREFIX, from, to],
  );
  await pool.query(
    `INSERT INTO core.evidence_requirement_version
       (requirement_set_id, version_no, status, effective, requiredness,
        valid_through, accepted_mime_types, message_key)
     SELECT id, 1, 'active', tstzrange(now(), NULL), 'required', 'none',
            '{application/pdf}', 'evidence.query.required'
       FROM core.evidence_requirement_set
      WHERE event_id = $1
        AND split_part(code, '-', 3)::int BETWEEN $2 AND $3`,
    [EVENT, from, to],
  );
  await pool.query(
    `INSERT INTO core.evidence_obligation
       (event_id, person_id, requirement_set_id, classification)
     SELECT $1, $2, id, 'ordinary'
       FROM core.evidence_requirement_set
      WHERE event_id = $1 AND classification = 'ordinary'
        AND split_part(code, '-', 3)::int BETWEEN $3 AND $4`,
    [EVENT, PERSON, from, to],
  );
  await pool.query(
    `INSERT INTO core.evidence_obligation_application (obligation_id, entry_id)
     SELECT id, $2 FROM core.evidence_obligation
      WHERE event_id = $1 AND person_id = $3
        AND requirement_set_id IN (
          SELECT id FROM core.evidence_requirement_set
           WHERE event_id = $1 AND split_part(code, '-', 3)::int BETWEEN $4 AND $5
        )`,
    [EVENT, ENTRY, PERSON, from, to],
  );
  await pool.query(
    `INSERT INTO core.evidence_upload
       (obligation_id, version_no, s3_key, mime_type, scan_status, original_file_name)
     SELECT o.id, 1, 's3://query/' || o.id, 'application/pdf', 'clean', 'query.pdf'
       FROM core.evidence_obligation o
       JOIN core.evidence_requirement_set rs ON rs.id = o.requirement_set_id
      WHERE o.event_id = $1 AND o.person_id = $2
        AND split_part(rs.code, '-', 3)::int BETWEEN $3 AND $4`,
    [EVENT, PERSON, from, to],
  );
  await pool.query(
    `INSERT INTO core.evidence_review (upload_id, decision, reviewer_id)
     SELECT u.id, 'under_review', $2
       FROM core.evidence_upload u
       JOIN core.evidence_obligation o ON o.id = u.obligation_id
       JOIN core.evidence_requirement_set rs ON rs.id = o.requirement_set_id
      WHERE o.event_id = $1
        AND split_part(rs.code, '-', 3)::int BETWEEN $3 AND $4`,
    [EVENT, REVIEWER, from, to],
  );

  await restrictedPool.query(
    `INSERT INTO restricted.evidence_document
       (event_id, person_id, entry_id, kind, requirement_set_id, classification,
        lawful_basis, retain_until)
     SELECT $1, $2, $3, 'medical_certificate', id, 'restricted', 'contract', '2028-12-31'
       FROM core.evidence_requirement_set
      WHERE event_id = $1 AND classification = 'restricted'
        AND split_part(code, '-', 3)::int BETWEEN $4 AND $5`,
    [EVENT, PERSON, ENTRY, from, to],
  );
  await restrictedPool.query(
    `INSERT INTO restricted.evidence_document_application (document_id, entry_id)
     SELECT d.id, $2
       FROM restricted.evidence_document d
       JOIN core.evidence_requirement_set rs ON rs.id = d.requirement_set_id
      WHERE d.event_id = $1
        AND split_part(rs.code, '-', 3)::int BETWEEN $3 AND $4`,
    [EVENT, ENTRY, from, to],
  );
  await restrictedPool.query(
    `INSERT INTO restricted.evidence_upload
       (document_id, version_no, s3_key, mime_type, scan_status, original_file_name)
     SELECT d.id, 1, 's3://restricted/query/' || d.id, 'application/pdf', 'clean', 'query.pdf'
       FROM restricted.evidence_document d
       JOIN core.evidence_requirement_set rs ON rs.id = d.requirement_set_id
      WHERE d.event_id = $1
        AND split_part(rs.code, '-', 3)::int BETWEEN $2 AND $3`,
    [EVENT, from, to],
  );
  await restrictedPool.query(
    `INSERT INTO restricted.evidence_review (upload_id, decision, reviewer_id)
     SELECT u.id, 'under_review', $2
       FROM restricted.evidence_upload u
       JOIN restricted.evidence_document d ON d.id = u.document_id
       JOIN core.evidence_requirement_set rs ON rs.id = d.requirement_set_id
      WHERE d.event_id = $1
        AND split_part(rs.code, '-', 3)::int BETWEEN $3 AND $4`,
    [EVENT, REVIEWER, from, to],
  );
}

beforeAll(async () => {
  await seedBase();
});

afterAll(async () => {
  await restrictedPool.end();
});

describe('BACKEND_DB_PLAN §6 fixed query counts', () => {
  it('GET /v1/admin/people stays fixed for limit 10 and 200', async () => {
    await expectFixedQueryCount({
      label: 'admin people',
      small: async () => (await people.list({ limit: 10 })).items.length,
      large: async () => (await people.list({ limit: 200 })).items.length,
      expectedSmall: 10,
      expectedLarge: 200,
    });
  });

  it('GET /v1/me/consents stays fixed with 10 and 200 history rows', async () => {
    await pool.query(
      `INSERT INTO core.consent (person_id, event_id, kind, granted, version, source)
       SELECT $1, $2, 'privacy_policy', (n % 2 = 0), 'query-v1', 'participant'
         FROM generate_series(1, 10) AS n`,
      [PERSON, EVENT],
    );
    await expectFixedQueryCount({
      label: 'consents',
      small: async () => (await consents.list(PERSON)).items.length,
      beforeLarge: async () => {
        await pool.query(
          `INSERT INTO core.consent (person_id, event_id, kind, granted, version, source)
           SELECT $1, $2, 'privacy_policy', (n % 2 = 0), 'query-v1', 'participant'
             FROM generate_series(11, 200) AS n`,
          [PERSON, EVENT],
        );
      },
      large: async () => (await consents.list(PERSON)).items.length,
      expectedSmall: 5,
      expectedLarge: 5,
    });
  });

  it('ordinary and restricted entry evidence stay fixed for 10 and 200 items', async () => {
    await seedEvidence(1, 10);
    await expectFixedQueryCount({
      label: 'ordinary evidence on entry',
      small: async () =>
        (await evidence.listForEntry({ entryId: ENTRY, personId: PERSON })).items.length,
      beforeLarge: async () => seedEvidence(11, 200),
      large: async () =>
        (await evidence.listForEntry({ entryId: ENTRY, personId: PERSON })).items.length,
      expectedSmall: 10,
      expectedLarge: 200,
    });

    await pool.query(
      `UPDATE core.evidence_requirement_version rv
          SET status = 'superseded'
         FROM core.evidence_requirement_set rs
        WHERE rs.id = rv.requirement_set_id
          AND rs.event_id = $1
          AND rs.classification = 'restricted'
          AND split_part(rs.code, '-', 3)::int > 10`,
      [EVENT],
    );
    await testOwnerPool().query(
      `DELETE FROM restricted.evidence_document_application
        WHERE document_id IN (
          SELECT d.id FROM restricted.evidence_document d
          JOIN core.evidence_requirement_set rs ON rs.id = d.requirement_set_id
          WHERE d.event_id = $1 AND split_part(rs.code, '-', 3)::int > 10
        )`,
      [EVENT],
    );
    await expectFixedQueryCount({
      label: 'restricted evidence on entry',
      small: async () =>
        (await restricted.listForEntry({ entryId: ENTRY, personId: PERSON })).items.length,
      beforeLarge: async () => {
        await pool.query(
          `UPDATE core.evidence_requirement_version rv
              SET status = 'active'
             FROM core.evidence_requirement_set rs
            WHERE rs.id = rv.requirement_set_id
              AND rs.event_id = $1
              AND rs.classification = 'restricted'`,
          [EVENT],
        );
        await restrictedPool.query(
          `INSERT INTO restricted.evidence_document_application (document_id, entry_id)
           SELECT d.id, $2 FROM restricted.evidence_document d
            WHERE d.event_id = $1
           ON CONFLICT DO NOTHING`,
          [EVENT, ENTRY],
        );
      },
      large: async () =>
        (await restricted.listForEntry({ entryId: ENTRY, personId: PERSON })).items.length,
      expectedSmall: 10,
      expectedLarge: 200,
    });
  });

  it('ordinary and restricted review queues do not query once per reviewer', async () => {
    await pool.query(
      `INSERT INTO core.evidence_review (upload_id, decision, reviewer_id, occurred_at)
       SELECT u.id, 'approved', $2, now() + interval '1 second'
         FROM core.evidence_upload u
         JOIN core.evidence_obligation o ON o.id = u.obligation_id
         JOIN core.evidence_requirement_set rs ON rs.id = o.requirement_set_id
        WHERE o.event_id = $1 AND split_part(rs.code, '-', 3)::int > 10`,
      [EVENT, REVIEWER],
    );
    await expectFixedQueryCount({
      label: 'ordinary evidence review queue',
      small: async () => (await evidence.reviewQueue()).items.length,
      beforeLarge: async () => {
        await pool.query(
          `INSERT INTO core.evidence_review (upload_id, decision, reviewer_id, occurred_at)
           SELECT u.id, 'under_review', $2, now() + interval '2 seconds'
             FROM core.evidence_upload u
             JOIN core.evidence_obligation o ON o.id = u.obligation_id
            WHERE o.event_id = $1`,
          [EVENT, REVIEWER],
        );
      },
      large: async () => (await evidence.reviewQueue()).items.length,
      expectedSmall: 10,
      expectedLarge: 200,
    });

    await restrictedPool.query(
      `INSERT INTO restricted.evidence_review (upload_id, decision, reviewer_id, occurred_at)
       SELECT u.id, 'approved', $2, now() + interval '1 second'
         FROM restricted.evidence_upload u
         JOIN restricted.evidence_document d ON d.id = u.document_id
         JOIN core.evidence_requirement_set rs ON rs.id = d.requirement_set_id
        WHERE d.event_id = $1 AND split_part(rs.code, '-', 3)::int > 10`,
      [EVENT, REVIEWER],
    );
    await expectFixedQueryCount({
      label: 'restricted evidence review queue',
      small: async () => (await restricted.reviewQueue()).items.length,
      beforeLarge: async () => {
        await restrictedPool.query(
          `INSERT INTO restricted.evidence_review (upload_id, decision, reviewer_id, occurred_at)
           SELECT u.id, 'under_review', $2, now() + interval '2 seconds'
             FROM restricted.evidence_upload u
             JOIN restricted.evidence_document d ON d.id = u.document_id
            WHERE d.event_id = $1`,
          [EVENT, REVIEWER],
        );
      },
      large: async () => (await restricted.reviewQueue()).items.length,
      expectedSmall: 10,
      expectedLarge: 200,
    });
  });

  it('GET /v1/accreditation-desk stays fixed for 10 and 200 records', async () => {
    const insert = (from: number, to: number) =>
      pool.query(
        `INSERT INTO core.accreditation
           (event_id, person_id, role, sport_name, valid_from, valid_until)
         SELECT $1, p.id, 'athlete', 'Query Sport', '2027-09-17', '2027-09-26'
           FROM core.person p
          WHERE p.email::text LIKE $2
          ORDER BY p.email
          OFFSET $3 LIMIT $4`,
        [EVENT, `query.${PREFIX}.%@example.com`, from - 1, to - from + 1],
      );
    await insert(1, 10);
    await expectFixedQueryCount({
      label: 'accreditation desk',
      small: async () => (await accreditations.getDeskOverview()).records.items.length,
      beforeLarge: async () => {
        await insert(11, 200);
      },
      large: async () => (await accreditations.getDeskOverview()).records.items.length,
    });
  });

  it('GET /v1/partner-requests and /candidates issue a fixed statement count', async () => {
    const insert = (from: number, to: number) =>
      pool.query(
        `INSERT INTO core.partner_request (event_id, category_id, from_id, to_id, status)
         SELECT $1, 'query-category-' || row_number() OVER (ORDER BY ap.id), $2, ap.id, 'pending'
           FROM core.athlete_profile ap
           JOIN core.person p ON p.id = ap.person_id
          WHERE ap.event_id = $1 AND p.email::text LIKE $3
          ORDER BY p.email
          OFFSET $4 LIMIT $5`,
        [EVENT, PROFILE, `query.${PREFIX}.%@example.com`, from - 1, to - from + 1],
      );
    await insert(1, 10);
    await expectFixedQueryCount({
      label: 'partner requests',
      small: async () => (await partners.list(EVENT, PERSON)).length,
      beforeLarge: async () => {
        await insert(11, 200);
      },
      large: async () => (await partners.list(EVENT, PERSON)).length,
      expectedSmall: 10,
      expectedLarge: 200,
    });
    await expectFixedQueryCount({
      label: 'partner candidates',
      small: async () =>
        (await partners.search({ eventId: EVENT, categoryId: 'query', query: 'Candidate01' }))
          .length,
      large: async () => (await partners.search({ eventId: EVENT, categoryId: 'query' })).length,
      expectedSmall: 10,
      // The endpoint caps its page at 50; the backing fixture contains 210 candidates.
      expectedLarge: 50,
    });
  });
});
