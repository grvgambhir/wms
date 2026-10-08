/**
 * F06: a member list is not a selected, versioned team entry.
 *
 * Observable behaviour against real Postgres. Competing-crew age, an
 * unapproved substitution, and hashed invite tokens are database guarantees.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { loadEntryRoster } from '../src/rules/load';

const CONNECTION = process.env.DATABASE_URL as string;

const id = (n: number) => `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

const EVENT = id(0xf0600);
const SPORT = id(0xf0601);
const RULE_SET = id(0xf0602);
const RULE_V = id(0xf0603);
const PRODUCT = id(0xf0604);
const TEAM = id(0xf0610);
const ENTRY = id(0xf0611);
const CAPTAIN = id(0xf0620);
const CAPTAIN_PROFILE = id(0xf0621);
const V1 = id(0xf0630);
const V2 = id(0xf0631);
const SUB = id(0xf0632);
const INVITE = id(0xf0640);
const REFERENCE = '2027-12-31';

/** Lario Masters Coxed Four fixture DOBs — reserve is younger than the crew. */
const CREW: Array<{
  pid: string;
  name: string;
  dob: string;
  role: string;
  competes: boolean;
}> = [
  { pid: id(0xf0651), name: 'Daniel Harper', dob: '1981-03-15', role: 'rower', competes: true },
  { pid: id(0xf0652), name: 'Alessandro Neri', dob: '1982-07-08', role: 'rower', competes: true },
  { pid: id(0xf0653), name: 'Stefano Romano', dob: '1983-02-17', role: 'rower', competes: true },
  { pid: id(0xf0654), name: 'Enzo Marino', dob: '1984-05-26', role: 'rower', competes: true },
  { pid: id(0xf0655), name: 'Fabio Sala', dob: '1997-10-09', role: 'coxswain', competes: true },
  { pid: id(0xf0656), name: 'Gianni Moretti', dob: '1991-04-02', role: 'reserve', competes: false },
];

let pool: Pool;

beforeAll(async () => {
  pool = new Pool({ connectionString: CONNECTION, max: 4 });
  await pool.query('SELECT 1');

  await pool.query(
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, age_reference_date)
     VALUES ($1, 'como-f06', 'Como Lake 2027', '2027-09-17', '2027-09-26', $2)`,
    [EVENT, REFERENCE],
  );
  await pool.query(
    `INSERT INTO core.sport (id, event_id, code, name) VALUES ($1, $2, 'rowing', 'Rowing')`,
    [SPORT, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_set (id, event_id, sport_code) VALUES ($1, $2, 'rowing')`,
    [RULE_SET, EVENT],
  );
  await pool.query(
    `INSERT INTO core.rule_version (id, rule_set_id, version_no, reference_date, effective, status)
     VALUES ($1, $2, 1, $3, tstzrange(now(), NULL), 'draft')`,
    [RULE_V, RULE_SET, REFERENCE],
  );
  await pool.query(
    `INSERT INTO core.sport_entry_product
       (id, event_id, sport_id, name, participant_type, rule_set_id)
     VALUES ($1, $2, $3, 'Coxed four', 'crew', $4)`,
    [PRODUCT, EVENT, SPORT, RULE_SET],
  );

  await pool.query(
    `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
     VALUES ($1, 'f06.captain@example.com', 'Casey', 'Captain', '1980-01-01')`,
    [CAPTAIN],
  );
  await pool.query(
    `INSERT INTO core.athlete_profile (id, person_id, event_id) VALUES ($1, $2, $3)`,
    [CAPTAIN_PROFILE, CAPTAIN, EVENT],
  );

  for (const [i, member] of CREW.entries()) {
    const [given, family] = member.name.split(' ') as [string, string];
    await pool.query(
      `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
       VALUES ($1, $2, $3, $4, $5)`,
      [member.pid, `f06.${i}@example.com`, given, family, member.dob],
    );
  }

  await pool.query(
    `INSERT INTO core.team_roster
       (id, event_id, captain_profile_id, name, sport_entry_product_id, visibility, matching_authority)
     VALUES ($1, $2, $3, 'Lario Masters Coxed Four', $4, 'members', 'captain')`,
    [TEAM, EVENT, CAPTAIN_PROFILE, PRODUCT],
  );

  for (const [i, member] of CREW.entries()) {
    await pool.query(
      `INSERT INTO core.roster_member
         (id, roster_id, person_id, display_name, date_of_birth, role, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id(0xf0660 + i), TEAM, member.pid, member.name, member.dob, member.role, i + 1],
    );
  }

  await pool.query(
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id, team_roster_id)
     VALUES ($1, $2, $3, $4, 'competitive', $5, $6)`,
    [ENTRY, EVENT, CAPTAIN_PROFILE, PRODUCT, RULE_V, TEAM],
  );

  await pool.query(
    `INSERT INTO core.roster_version (id, team_id, version_no, status)
     VALUES ($1, $2, 1, 'draft')`,
    [V1, TEAM],
  );
  for (const [i, member] of CREW.entries()) {
    await pool.query(
      `INSERT INTO core.roster_selection
         (roster_version_id, person_id, membership_id, display_name, date_of_birth,
          role, position, competes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        V1,
        member.pid,
        id(0xf0660 + i),
        member.name,
        member.dob,
        member.role,
        i + 1,
        member.competes,
      ],
    );
  }
  await pool.query(
    `UPDATE core.roster_version
        SET status = 'approved', approved_by = $2, approved_at = now(),
            published_by = $2, published_at = now()
      WHERE id = $1`,
    [V1, CAPTAIN],
  );
  await pool.query(
    `UPDATE core.registration_entry
        SET original_roster_version_id = $2, current_roster_version_id = $2
      WHERE id = $1`,
    [ENTRY, V1],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('F06 — selected roster, not the membership pool', () => {
  it('keeps the team name and product on the durable team', async () => {
    const row = await pool.query<{
      name: string;
      sport_entry_product_id: string;
      visibility: string;
    }>(`SELECT name, sport_entry_product_id, visibility FROM core.team_roster WHERE id = $1`, [
      TEAM,
    ]);
    expect(row.rows[0]).toEqual({
      name: 'Lario Masters Coxed Four',
      sport_entry_product_id: PRODUCT,
      visibility: 'members',
    });
  });

  it('computes crew age from selected competing members only — the reserve does not join the mean', async () => {
    const selected = await pool.query<{ person_id: string; role: string; age_years: number }>(
      `SELECT person_id, role, age_years FROM core.roster_competing_ages($1, $2::date) ORDER BY age_years DESC`,
      [V1, REFERENCE],
    );
    expect(selected.rows).toHaveLength(5);
    expect(selected.rows.some((r) => r.person_id === id(0xf0656))).toBe(false);

    const selectedMean = await pool.query<{ roster_competing_mean_age: string }>(
      `SELECT core.roster_competing_mean_age($1, $2::date)::text`,
      [V1, REFERENCE],
    );
    const poolMean = await pool.query<{ avg: string }>(
      `SELECT avg(EXTRACT(YEAR FROM age($2::date, date_of_birth)))::text
         FROM core.roster_member WHERE roster_id = $1`,
      [TEAM, REFERENCE],
    );
    expect(Number(selectedMean.rows[0]!.roster_competing_mean_age)).toBeCloseTo(41.6, 5);
    expect(Number(poolMean.rows[0]!.avg)).toBeCloseTo(40.666666, 2);
    expect(Number(selectedMean.rows[0]!.roster_competing_mean_age)).not.toBe(
      Number(poolMean.rows[0]!.avg),
    );
  });

  it('an unapproved substitution does not change the live roster; approving it creates a new version and leaves the original readable', async () => {
    await pool.query(
      `INSERT INTO core.roster_version (id, team_id, version_no, status, supersedes)
       VALUES ($1, $2, 2, 'draft', $3)`,
      [V2, TEAM, V1],
    );
    const v2Members = [
      { ...CREW[0]!, membership: id(0xf0660), position: 1 },
      { ...CREW[1]!, membership: id(0xf0661), position: 2 },
      { ...CREW[2]!, membership: id(0xf0662), position: 3 },
      { ...CREW[5]!, role: 'rower', competes: true, membership: id(0xf0665), position: 4 },
      { ...CREW[4]!, membership: id(0xf0664), position: 5 },
      { ...CREW[3]!, role: 'reserve', competes: false, membership: id(0xf0663), position: 6 },
    ];
    for (const member of v2Members) {
      await pool.query(
        `INSERT INTO core.roster_selection
           (roster_version_id, person_id, membership_id, display_name, date_of_birth,
            role, position, competes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          V2,
          member.pid,
          member.membership,
          member.name,
          member.dob,
          member.role,
          member.position,
          member.competes,
        ],
      );
    }
    await pool.query(`UPDATE core.roster_version SET status = 'proposed' WHERE id = $1`, [V2]);

    await pool.query(
      `INSERT INTO core.roster_substitution
         (id, entry_id, from_version_id, proposed_version_id, status,
          fee_impact_minor, refund_impact_minor, from_category_id, to_category_id,
          accreditation_impact_key, proposed_by, message_key)
       VALUES ($1, $2, $3, $4, 'proposed', 0, 0, 'cat-c', 'cat-c',
               'accreditation.unchanged', $5, 'roster.substitution.proposed')`,
      [SUB, ENTRY, V1, V2, CAPTAIN],
    );

    const liveBefore = await pool.query<{
      current_roster_version_id: string;
      original_roster_version_id: string;
    }>(
      `SELECT current_roster_version_id, original_roster_version_id FROM core.registration_entry WHERE id = $1`,
      [ENTRY],
    );
    expect(liveBefore.rows[0]!.current_roster_version_id).toBe(V1);
    expect(liveBefore.rows[0]!.original_roster_version_id).toBe(V1);

    await expect(
      pool.query(
        `UPDATE core.registration_entry SET current_roster_version_id = $2 WHERE id = $1`,
        [ENTRY, V2],
      ),
    ).rejects.toThrow(/roster\.version\.not_approved/);

    await pool.query(`SELECT core.approve_roster_substitution($1, $2)`, [SUB, CAPTAIN]);

    const liveAfter = await pool.query<{
      current_roster_version_id: string;
      original_roster_version_id: string;
    }>(
      `SELECT current_roster_version_id, original_roster_version_id FROM core.registration_entry WHERE id = $1`,
      [ENTRY],
    );
    expect(liveAfter.rows[0]!.current_roster_version_id).toBe(V2);
    expect(liveAfter.rows[0]!.original_roster_version_id).toBe(V1);

    const original = await pool.query<{ person_id: string; role: string }>(
      `SELECT person_id, role FROM core.roster_selection WHERE roster_version_id = $1 ORDER BY position`,
      [V1],
    );
    expect(original.rows).toHaveLength(6);
    expect(original.rows.find((r) => r.role === 'reserve')?.person_id).toBe(id(0xf0656));
    expect(original.rows.find((r) => r.person_id === id(0xf0654))?.role).toBe('rower');

    const current = await pool.query<{ person_id: string; role: string; competes: boolean }>(
      `SELECT person_id, role, competes FROM core.roster_selection WHERE roster_version_id = $1 ORDER BY position`,
      [V2],
    );
    expect(current.rows.find((r) => r.person_id === id(0xf0656))?.competes).toBe(true);
    expect(current.rows.find((r) => r.person_id === id(0xf0654))).toMatchObject({
      role: 'reserve',
      competes: false,
    });

    await expect(
      pool.query(`UPDATE core.roster_selection SET role = 'coach' WHERE roster_version_id = $1`, [
        V1,
      ]),
    ).rejects.toThrow(/frozen/);
  });

  it('stores an invite token as sha256 hex and refuses plaintext', async () => {
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'core' AND table_name = 'team_invitation'
          AND column_name IN ('token','code','invite_code','plaintext')`,
    );
    expect(columns.rows).toEqual([]);

    const tokenHash = createHash('sha256').update('JOIN-LARIO').digest('hex');
    await pool.query(
      `INSERT INTO core.team_invitation
         (id, team_id, sport_entry_product_id, token_hash, expires_at,
          inviter_person_id, invitee_email)
       VALUES ($1, $2, $3, $4, now() + interval '7 days', $5, 'invitee@example.com')`,
      [INVITE, TEAM, PRODUCT, tokenHash, CAPTAIN],
    );
    const stored = await pool.query<{ token_hash: string }>(
      `SELECT token_hash FROM core.team_invitation WHERE id = $1`,
      [INVITE],
    );
    expect(stored.rows[0]!.token_hash).toBe(tokenHash);
    expect(stored.rows[0]!.token_hash).toHaveLength(64);

    await expect(
      pool.query(
        `INSERT INTO core.team_invitation
           (team_id, sport_entry_product_id, token_hash, expires_at, inviter_person_id, invitee_email)
         VALUES ($1, $2, 'JOIN-LARIO', now() + interval '7 days', $3, 'other@example.com')`,
        [TEAM, PRODUCT, CAPTAIN],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it("derives from the entry's approved roster version, not the membership list", async () => {
    // The admin detail showed a category the entry itself disagreed with, because the derivation
    // read core.roster_member: it carries non-competing members and pre-publish dates of birth.
    const LATE_JOINER = id(0xf0657);
    await pool.query(
      `INSERT INTO core.person (id, email, given_name, family_name, date_of_birth)
       VALUES ($1, 'f06.late@example.com', 'Late', 'Joiner', '1999-01-01')`,
      [LATE_JOINER],
    );
    await pool.query(
      `INSERT INTO core.roster_member (id, roster_id, person_id, display_name, date_of_birth, role, position)
       VALUES ($1, $2, $3, 'Late Joiner', '1999-01-01', 'rower', 9)`,
      [id(0xf0670), TEAM, LATE_JOINER],
    );

    const loaded = await loadEntryRoster(pool, ENTRY);

    expect(loaded).not.toBeNull();
    const names = loaded!.roster.map((member) => member.name).sort();
    const selected = await pool.query<{ display_name: string }>(
      `SELECT selection.display_name
         FROM core.roster_selection selection
         JOIN core.registration_entry entry
           ON entry.current_roster_version_id = selection.roster_version_id
        WHERE entry.id = $1 AND selection.competes`,
      [ENTRY],
    );
    // Exactly the competing selections of the entry's own current version — the membership list's
    // late joiner is not one of them.
    expect(names).toEqual(selected.rows.map((row) => row.display_name).sort());
    expect(names).not.toContain('Late Joiner');
  });
});
