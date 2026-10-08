/**
 * F09: templates are not translated strings.
 *
 * A send snapshots content; marketing suppression is a constraint;
 * undeclared variables are refused. No provider is called.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

const CONNECTION = process.env.DATABASE_URL as string;

const id = (n: number) => `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

const EVENT = id(0xf0900);
const SENDER = id(0xf0920);
const RECIPIENT = id(0xf0921);
const TPL_TX = id(0xf0930);
const TPL_MKT = id(0xf0931);
const TV_TX = id(0xf0940);
const TV_TX2 = id(0xf0941);
const TV_MKT = id(0xf0942);
const SEND_TX = id(0xf0950);
const SEND_MKT = id(0xf0951);

let pool: Pool;

beforeAll(async () => {
  pool = new Pool({ connectionString: CONNECTION, max: 4 });
  await pool.query('SELECT 1');

  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1, 'como-f09', 'Como Lake 2027', '2027-09-17', '2027-09-26', '2027-12-31')`,
    [EVENT],
  );
  await pool.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
     VALUES ($1, 'f09.sender@example.com', 'Sam', 'Sender', '1978-04-04'),
            ($2, 'f09.athlete@example.com', 'Alex', 'Athlete', '1991-08-08')`,
    [SENDER, RECIPIENT],
  );

  await pool.query(
    `INSERT INTO core.comms_template (id, event_id, code, channel, classification, name_key)
     VALUES ($1, $2, 'payment_receipt', 'email', 'transactional', 'comms.template.payment_receipt'),
            ($3, $2, 'newsletter', 'email', 'marketing', 'comms.template.newsletter')`,
    [TPL_TX, EVENT, TPL_MKT],
  );
  await pool.query(
    `INSERT INTO core.comms_template_version (id, template_id, version_no, status)
     VALUES ($1, $2, 1, 'draft'),
            ($3, $4, 1, 'draft')`,
    [TV_TX, TPL_TX, TV_MKT, TPL_MKT],
  );
  await pool.query(
    `INSERT INTO core.comms_template_variable (template_version_id, name, required)
     VALUES ($1, 'first_name', true),
            ($2, 'first_name', true)`,
    [TV_TX, TV_MKT],
  );
  await pool.query(
    `INSERT INTO core.comms_template_copy (template_version_id, locale, subject, body)
     VALUES ($1, 'en', 'Your receipt', 'Hello {{first_name}}, payment received.'),
            ($2, 'en', 'News', 'Hello {{first_name}}, here is the newsletter.')`,
    [TV_TX, TV_MKT],
  );
  await pool.query(
    `UPDATE core.comms_template_version
        SET status = 'approved', approved_by = $3, approved_at = now()
      WHERE id IN ($1, $2)`,
    [TV_TX, TV_MKT, SENDER],
  );

  await pool.query(
    `INSERT INTO core.broadcast
       (id, event_id, template_id, template_version_id, channel, classification,
        locale, subject_snapshot, body_snapshot, bindings, status, sent_by, sent_at)
     VALUES ($1, $2, $3, $4, 'email', 'transactional', 'en',
             'Your receipt', 'Hello Alex, payment received.',
             '{"first_name":"Alex"}'::jsonb, 'sent', $5, now())`,
    [SEND_TX, EVENT, TPL_TX, TV_TX, SENDER],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('F09 — approved templates, snapshots, suppression', () => {
  it('snapshots send content so a later template edit does not change what was sent', async () => {
    await expect(
      pool.query(`UPDATE core.comms_template_copy SET body = 'CHANGED' WHERE template_version_id = $1`, [TV_TX]),
    ).rejects.toThrow(/frozen/);

    await pool.query(
      `INSERT INTO core.comms_template_version (id, template_id, version_no, status)
       VALUES ($1, $2, 2, 'draft')`,
      [TV_TX2, TPL_TX],
    );
    await pool.query(
      `INSERT INTO core.comms_template_variable (template_version_id, name, required)
       VALUES ($1, 'first_name', true)`,
      [TV_TX2],
    );
    await pool.query(
      `INSERT INTO core.comms_template_copy (template_version_id, locale, subject, body)
       VALUES ($1, 'en', 'Your receipt', 'UPDATED {{first_name}} — this must not leak into the send.')`,
      [TV_TX2],
    );
    await pool.query(
      `UPDATE core.comms_template_version
          SET status = 'approved', approved_by = $2, approved_at = now()
        WHERE id = $1`,
      [TV_TX2, SENDER],
    );

    const snap = await pool.query<{ body_snapshot: string; template_version_id: string }>(
      `SELECT body_snapshot, template_version_id FROM core.broadcast WHERE id = $1`,
      [SEND_TX],
    );
    expect(snap.rows[0]!.body_snapshot).toBe('Hello Alex, payment received.');
    expect(snap.rows[0]!.template_version_id).toBe(TV_TX);

    await expect(
      pool.query(`UPDATE core.broadcast SET body_snapshot = 'rewritten' WHERE id = $1`, [SEND_TX]),
    ).rejects.toThrow(/snapshot_frozen/);
  });

  it('a transactional message reaches a suppressed recipient and a marketing one does not', async () => {
    await pool.query(
      `INSERT INTO core.comms_suppression (person_id, channel, classification, reason_key)
       VALUES ($1, 'email', 'marketing', 'comms.unsubscribe')`,
      [RECIPIENT],
    );

    const tx = await pool.query(
      `INSERT INTO core.delivery (broadcast_id, person_id, status)
       VALUES ($1, $2, 'queued') RETURNING status`,
      [SEND_TX, RECIPIENT],
    );
    expect(tx.rows[0]!.status).toBe('queued');

    await pool.query(
      `INSERT INTO core.broadcast
         (id, event_id, template_id, template_version_id, channel, classification,
          locale, subject_snapshot, body_snapshot, bindings, status, sent_by)
       VALUES ($1, $2, $3, $4, 'email', 'marketing', 'en',
               'News', 'Hello Alex, here is the newsletter.',
               '{"first_name":"Alex"}'::jsonb, 'queued', $5)`,
      [SEND_MKT, EVENT, TPL_MKT, TV_MKT, SENDER],
    );

    await expect(
      pool.query(`INSERT INTO core.delivery (broadcast_id, person_id) VALUES ($1, $2)`, [SEND_MKT, RECIPIENT]),
    ).rejects.toThrow(/comms\.suppressed/);
  });

  it('refuses a send that references an undeclared variable', async () => {
    await expect(
      pool.query(
        `INSERT INTO core.broadcast
           (event_id, template_id, template_version_id, channel, classification,
            locale, subject_snapshot, body_snapshot, bindings, sent_by)
         VALUES ($1, $2, $3, 'email', 'transactional', 'en',
                 'Your receipt', 'Hello {{nickname}}', '{"nickname":"Alex"}'::jsonb, $4)`,
        [EVENT, TPL_TX, TV_TX, SENDER],
      ),
    ).rejects.toThrow(/comms\.template\.undeclared_variable/);

    await expect(
      pool.query(
        `INSERT INTO core.broadcast
           (event_id, template_id, template_version_id, channel, classification,
            locale, subject_snapshot, body_snapshot, bindings, sent_by)
         VALUES ($1, $2, $3, 'email', 'transactional', 'en',
                 'Your receipt', 'Hello Alex', '{"undeclared":"x"}'::jsonb, $4)`,
        [EVENT, TPL_TX, TV_TX, SENDER],
      ),
    ).rejects.toThrow(/comms\.template\.undeclared_variable/);
  });
});
