/**
 * Restored shipped participant fields (pass validity window, profile contact,
 * restricted passport). Round-trips real rows on the throwaway database
 * globalSetup migrated.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { testRestrictedPool } from './db-url';

const CONNECTION = process.env.DATABASE_URL as string;

const EVENT = '00000000-0000-7000-8000-00000000f120';
const PERSON = '00000000-0000-7000-8000-00000000f130';
const PERSON_EXPIRED = '00000000-0000-7000-8000-00000000f139';
const ACC_CURRENT = '00000000-0000-7000-8000-00000000f121';
const ACC_EXPIRED = '00000000-0000-7000-8000-00000000f122';
const ACC_PENDING = '00000000-0000-7000-8000-00000000f123';
const CONTACT = '00000000-0000-7000-8000-00000000f131';
const PASSPORT = '00000000-0000-7000-8000-00000000f132';
const CONSENT = '00000000-0000-7000-8000-00000000f133';

let pool: Pool;

async function seedPerson(id: string, email: string): Promise<void> {
  await pool.query(
    `INSERT INTO core.person
       (id, email, given_name, family_name, date_of_birth, nationality, gender,
        phone, profile_image_key)
     VALUES ($1, $2, 'Daniel', 'Harper', '1985-03-15', 'GB', 'male',
             '+44 7700 900123', 'danielHarper')`,
    [id, email],
  );
}

beforeAll(async () => {
  pool = new Pool({ connectionString: CONNECTION, max: 4 });
  await pool.query('SELECT 1');
  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1, 'como-f12-f13', 'Como Lake 2027', '2027-09-17', '2027-09-26', '2027-12-31')`,
    [EVENT],
  );
  await seedPerson(PERSON, 'f12.harper@example.com');
  await seedPerson(PERSON_EXPIRED, 'f12.expired@example.com');

  await pool.query(
    `INSERT INTO core.emergency_contact (id, person_id, name, relationship, phone, ordinal)
     VALUES ($1, $2, 'Sarah Harper', 'Wife', '+44 7700 900124', 1)`,
    [CONTACT, PERSON],
  );
  await testRestrictedPool().query(
    `INSERT INTO restricted.identity_document
       (id, person_id, kind, document_number, lawful_basis, retain_until)
     VALUES ($1, $2, 'passport', '123456789', 'contract', '2032-12-31')`,
    [PASSPORT, PERSON],
  );
  await pool.query(
    `INSERT INTO core.accreditation
       (id, event_id, person_id, badge_number, role, sport_name, zones,
        photo_status, eligibility_status, status, qr_value,
        valid_from, valid_until, issued_at)
     VALUES ($1, $2, $3, 'COMO27-000118', 'Athlete', 'Tennis',
             '{field-of-play,athlete-lounge}',
             'approved', 'approved', 'issued', 'COMO27-000118',
             '2027-09-17', '2027-09-26', '2026-09-02T14:03:00Z')`,
    [ACC_CURRENT, EVENT, PERSON],
  );
  await pool.query(
    `INSERT INTO core.accreditation
       (id, event_id, person_id, role, sport_name, status, valid_from, valid_until)
     VALUES ($1, $2, $3, 'Athlete', 'Tennis', 'issued', '2020-01-01', '2020-01-15')`,
    [ACC_EXPIRED, EVENT, PERSON_EXPIRED],
  );
  await pool.query(
    `INSERT INTO core.consent (id, person_id, event_id, kind, granted, version, source)
     VALUES ($1, $2, $3, 'privacy_policy', true, 'Privacy v3.0', 'participant')`,
    [CONSENT, PERSON, EVENT],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('shipped participant fields', () => {
  it('round-trips phone, portrait key, emergency contact and a restricted passport', async () => {
    const person = await pool.query<{
      phone: string;
      profile_image_key: string;
      given_name: string;
      nationality: string;
    }>(
      `SELECT phone, profile_image_key, given_name, nationality
         FROM core.person WHERE id = $1`,
      [PERSON],
    );
    expect(person.rows[0]).toMatchObject({
      phone: '+44 7700 900123',
      profile_image_key: 'danielHarper',
      given_name: 'Daniel',
      nationality: 'GB',
    });

    const contact = await pool.query<{
      name: string;
      relationship: string;
      phone: string;
    }>(`SELECT name, relationship, phone FROM core.emergency_contact WHERE id = $1`, [CONTACT]);
    expect(contact.rows[0]).toEqual({
      name: 'Sarah Harper',
      relationship: 'Wife',
      phone: '+44 7700 900124',
    });

    const passport = await testRestrictedPool().query<{ document_number: string; kind: string }>(
      `SELECT document_number, kind FROM restricted.identity_document WHERE id = $1`,
      [PASSPORT],
    );
    expect(passport.rows[0]).toEqual({ document_number: '123456789', kind: 'passport' });
  });

  it('round-trips an accreditation including the validity window the pass prints', async () => {
    const { rows } = await pool.query<{
      badge_number: string;
      role: string;
      sport_name: string;
      zones: string[];
      photo_status: string;
      eligibility_status: string;
      status: string;
      qr_value: string;
      valid_from: string;
      valid_until: string;
    }>(
      `SELECT badge_number, role, sport_name, zones, photo_status, eligibility_status,
              status, qr_value, valid_from::text, valid_until::text
         FROM core.accreditation WHERE id = $1`,
      [ACC_CURRENT],
    );
    expect(rows[0]).toEqual({
      badge_number: 'COMO27-000118',
      role: 'Athlete',
      sport_name: 'Tennis',
      zones: ['field-of-play', 'athlete-lounge'],
      photo_status: 'approved',
      eligibility_status: 'approved',
      status: 'issued',
      qr_value: 'COMO27-000118',
      valid_from: '2027-09-17',
      valid_until: '2027-09-26',
    });
  });

  it('allows a pending pass with no badge number', async () => {
    await pool.query(
      `INSERT INTO core.accreditation
         (id, event_id, person_id, role, sport_name, status, valid_from, valid_until)
       VALUES ($1, $2, $3, 'Athlete', 'Rowing', 'pending_review', '2027-09-17', '2027-09-26')`,
      [ACC_PENDING, EVENT, PERSON],
    );
    const { rows } = await pool.query<{ badge_number: string | null }>(
      `SELECT badge_number FROM core.accreditation WHERE id = $1`,
      [ACC_PENDING],
    );
    expect(rows[0]?.badge_number).toBeNull();
  });

  it('distinguishes a pass whose valid_until has elapsed from a current one', async () => {
    const { rows } = await pool.query<{ id: string; current: boolean }>(
      `SELECT id, (valid_until >= CURRENT_DATE) AS current
         FROM core.accreditation
        WHERE id IN ($1, $2)
        ORDER BY valid_until`,
      [ACC_CURRENT, ACC_EXPIRED],
    );
    expect(rows).toEqual([
      { id: ACC_EXPIRED, current: false },
      { id: ACC_CURRENT, current: true },
    ]);
  });

  it('round-trips a consent grant the profile screen reads', async () => {
    const { rows } = await pool.query<{ kind: string; granted: boolean; version: string }>(
      `SELECT kind, granted, version FROM core.consent WHERE id = $1`,
      [CONSENT],
    );
    expect(rows[0]).toEqual({
      kind: 'privacy_policy',
      granted: true,
      version: 'Privacy v3.0',
    });
  });

  it('refuses the ordinary app role a SELECT on the passport', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE app_rw');
      await expect(
        client.query('SELECT 1 FROM restricted.identity_document'),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });
});
