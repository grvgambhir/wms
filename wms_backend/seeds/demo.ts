/**
 * Como Lake 2027 demo seed. Not a migration — load with `npm run seed`.
 *
 * Mapping notes (fields with no home are not invented as columns):
 * - sport-rules.json strategy/bands/excludeRoles/rounding → core.rule_dimension
 *   (age, aggregation per strategy). Versions insert as draft, then
 *   core.publish_rule_version binds content_hash + impact analysis.
 * - waitlists.json points Harper's tennis entry at the basketball 35–39 pool;
 *   that pairing is not loaded. Luca is waitlisted on the full narrow pool.
 * - documents.json is Harper's passport → restricted.identity_document.
 *   evidence.json[0] is the ordinary identity obligation/upload/review path.
 */
import { hash as argon2Hash } from 'argon2';
import { Client, type Pool, type PoolClient } from 'pg';
import { ARGON2_OPTIONS } from '../src/auth/identity/argon2-options';
import { env } from '../src/config/env';
import * as fx from './fixtures';
import {
  BASKETBALL_35_39,
  BASKETBALL_FEE_35_39,
  BASKETBALL_FULL_POOL,
  BASKETBALL_INTENT,
  BASKETBALL_ORDER,
  BASKETBALL_PRODUCT,
  BASKETBALL_RULE_VERSION,
  BASKETBALL_SPORT,
  BASKETBALL_TEAM,
  BASKETBALL_VERSION,
  ELENA_CONSENT,
  ELENA_ENTRY,
  ELENA_ID,
  ELENA_PROFILE,
  ELENA_REVIEW,
  ELENA_UPLOAD,
  entryIdFor,
  EVENT_ID,
  EVENT_SLUG,
  GIULIA_ID,
  HARPER_BASKETBALL_ENTRY,
  HARPER_BILLING,
  HARPER_EMERGENCY,
  HARPER_ID,
  HARPER_IDENTITY_REVIEW,
  HARPER_IDENTITY_UPLOAD,
  HARPER_PASSPORT,
  HARPER_PROFILE,
  HARPER_ROWING_ENTRY,
  HELEN_ID,
  IDENTITY_REQ_SET,
  IDENTITY_REQ_VER,
  LUCA_BASKETBALL_ENTRY,
  LUCA_ID,
  LUCA_PROFILE,
  LUCA_WAITLIST,
  MARCO_TENNIS_ID,
  MARCO_TENNIS_PROFILE,
  NOTICE_SENSITIVE,
  orderLineId,
  PARA_DOC,
  PARA_FACT,
  PARA_PRODUCT,
  PARA_REF,
  MEDICAL_REQ_SET,
  MEDICAL_REQ_VER,
  JUDO_LICENCE_REQ_SET,
  JUDO_LICENCE_REQ_VER,
  JUDO_BELT_REQ_SET,
  JUDO_BELT_REQ_VER,
  JUDO_WEIGHT_REQ_SET,
  JUDO_WEIGHT_REQ_VER,
  JUDO_PRODUCT,
  JUDO_SPORT,
  PARA_REQ_SET,
  PARA_REQ_VER,
  PARA_RULE_VERSION,
  PARA_SPORT,
  PRE_REG_BATCH,
  profileId,
  REFERENCE_DATE,
  ROWING_CAT_C,
  ROWING_PRODUCT,
  ROWING_RULE_VERSION,
  ROWING_SPORT,
  ROWING_TEAM,
  ROWING_VERSION,
  ruleSetId,
  sportPoolId,
  stableId,
  TAX_N1,
  TENNIS_35_39,
  TENNIS_ENTRY,
  TENNIS_FEE,
  TENNIS_INTENT,
  TENNIS_LINE,
  TENNIS_ORDER,
  TENNIS_PRODUCT,
  TENNIS_RULE_VERSION,
  TENNIS_SPORT,
} from './ids';

const SELLER = {
  legalName: 'World Masters Sport S.r.l.',
  vatId: 'IT00000000000',
  address: 'Como, Italy',
};

function sportCode(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_');
}

function splitName(name: string): { given: string; family: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { given: 'Unknown', family: 'Unknown' };
  if (parts.length === 1) return { given: parts[0]!, family: 'Unknown' };
  return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1]! };
}

function mapChannel(channel: string): 'email' | 'sms' | 'inapp' {
  if (channel === 'in-app' || channel === 'inapp') return 'inapp';
  return 'email';
}

function mapImpact(impact: string): 'low' | 'medium' | 'high' {
  if (impact === 'high' || impact === 'low') return impact;
  return 'medium';
}

function aggregationFor(strategy: string): 'self' | 'min' | 'mean' | 'sum' {
  if (strategy === 'youngest-member') return 'min';
  if (strategy === 'crew-average') return 'mean';
  if (strategy === 'relay-aggregate') return 'sum';
  return 'self';
}

function templateCode(id: string): string {
  return id.replace(/^tpl-/, '').replace(/-/g, '_');
}

type SqlClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }>;
};

async function ins(client: SqlClient, sql: string, params: unknown[] = []): Promise<boolean> {
  const result = await client.query(sql, params);
  return (result.rowCount ?? 0) > 0;
}

async function adoptEmail(client: PoolClient, personId: string, email: string): Promise<void> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM core.person WHERE email = $1`,
    [email],
  );
  const other = existing.rows[0]?.id;
  if (other && other !== personId) {
    await client.query(`DELETE FROM core.refresh_token WHERE person_id = $1`, [other]);
    await client.query(`DELETE FROM core.user_credential WHERE person_id = $1`, [other]);
    await client.query(`DELETE FROM core.person_role WHERE person_id = $1`, [other]);
    await client.query(`DELETE FROM core.person WHERE id = $1`, [other]);
  }
}

async function ensurePerson(
  client: PoolClient,
  id: string,
  given: string,
  family: string,
  dob: string,
  opts: {
    email?: string | null;
    nationality?: string;
    gender?: string;
    phone?: string;
    imageKey?: string;
  } = {},
): Promise<void> {
  const email = opts.email === undefined ? `seed.${id.replace(/-/g, '')}@demo.invalid` : opts.email;
  if (email) await adoptEmail(client, id, email);
  await ins(
    client,
    `INSERT INTO core.person
       (id, email, given_name, family_name, date_of_birth, nationality, gender, phone, profile_image_key, locale, idp_subject)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'en', NULL)
     ON CONFLICT (id) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, core.person.email),
       phone = COALESCE(EXCLUDED.phone, core.person.phone),
       profile_image_key = COALESCE(EXCLUDED.profile_image_key, core.person.profile_image_key)`,
    [
      id,
      email,
      given,
      family,
      dob,
      opts.nationality ?? null,
      opts.gender ?? null,
      opts.phone ?? null,
      opts.imageKey ?? null,
    ],
  );
}

async function ensureProfile(
  client: PoolClient,
  personId: string,
  id = profileId(personId),
): Promise<string> {
  await ins(
    client,
    `INSERT INTO core.athlete_profile (id, person_id, event_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [id, personId, EVENT_ID],
  );
  return id;
}

async function ensureRole(
  client: PoolClient,
  personId: string,
  role: string,
  eventId: string | null,
): Promise<void> {
  await ins(
    client,
    `INSERT INTO core.person_role (person_id, role_code, event_id, granted_by)
     VALUES ($1, $2, $3, CASE WHEN $2 = 'participant' THEN $1 ELSE COALESCE((SELECT pr.person_id FROM core.person_role pr WHERE pr.role_code = 'oc_admin' LIMIT 1), $1) END)
     ON CONFLICT (person_id, role_code, event_id) DO NOTHING`,
    [personId, role, eventId],
  );
}

async function ensureCredential(
  client: PoolClient,
  personId: string,
  email: string,
  password: string,
): Promise<void> {
  // Seeded people keep idp_subject NULL. Local passwords are only useful when
  // AUTH_PROVIDER=local; Cognito users are created in the pool, not here.
  if (env.AUTH_PROVIDER !== 'local') return;
  const exists = await client.query(`SELECT 1 FROM core.user_credential WHERE person_id = $1`, [
    personId,
  ]);
  if (exists.rowCount) return;
  const passwordHash = await argon2Hash(password, ARGON2_OPTIONS);
  await ins(
    client,
    `INSERT INTO core.user_credential (person_id, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (person_id) DO NOTHING`,
    [personId, email, passwordHash],
  );
}

async function seedCatalogue(client: PoolClient): Promise<void> {
  const event = fx.events[0];
  if (!event) throw new Error('events.json is empty');

  await ins(
    client,
    `INSERT INTO core.event (id, slug, name, starts_on, ends_on, timezone, age_reference_date, status)
     VALUES ($1, $2, $3, $4, $5, 'Europe/Rome', $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [
      EVENT_ID,
      EVENT_SLUG,
      event.name,
      event.startDate.slice(0, 10),
      event.endDate.slice(0, 10),
      REFERENCE_DATE,
      event.status,
    ],
  );

  for (const sport of fx.sports) {
    await ins(
      client,
      `INSERT INTO core.sport (id, event_id, code, name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [sport.id, sport.eventId, sportCode(sport.name), sport.name],
    );
  }

  for (const rule of fx.rules) {
    const setId = ruleSetId(rule.id);
    const sport = fx.sports.find((s) => s.name === rule.sport);
    await ins(
      client,
      `INSERT INTO core.rule_set (id, event_id, sport_code, event_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [setId, EVENT_ID, sport ? sportCode(sport.name) : sportCode(rule.sport), rule.event],
    );
    await ins(
      client,
      `INSERT INTO core.rule_version
         (id, rule_set_id, version_no, reference_date, effective, status, reason)
       VALUES ($1, $2, 1, $3, tstzrange($4::timestamptz, NULL), 'draft', $5)
       ON CONFLICT (id) DO NOTHING`,
      [rule.id, setId, rule.referenceDate, rule.effectiveDate, rule.version],
    );
    const status = await client.query<{ status: string }>(
      `SELECT status FROM core.rule_version WHERE id = $1`,
      [rule.id],
    );
    if (status.rows[0]?.status === 'draft') {
      const dimensions = rule.dimensions ?? [{
        attribute: 'age', aggregation: aggregationFor(rule.strategy), rounding: rule.rounding ?? 'floor',
        valueScale: 0, bandKind: 'range' as const,
        bands: (rule.bands ?? []).map((b) => ({ id: b.id, name: b.name, min: b.minAge, max: b.maxAge })),
      }];
      for (const [index, dimension] of dimensions.entries()) {
        await ins(
          client,
          `INSERT INTO core.rule_dimension
             (id, rule_version_id, ordinal, attribute, aggregation, exclude_roles,
              rounding, value_scale, band_kind, bands)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
           ON CONFLICT (id) DO NOTHING`,
          [stableId(`rule_dimension:${rule.id}:${dimension.attribute}`), rule.id, index + 1,
            dimension.attribute, dimension.aggregation, rule.excludeRoles ?? [], dimension.rounding,
            dimension.valueScale, dimension.bandKind, JSON.stringify(dimension.bands)],
        );
      }
      for (const [index, eligibility] of (rule.eligibility ?? []).entries()) {
        await ins(
          client,
          `INSERT INTO core.rule_eligibility
             (id, rule_version_id, ordinal, predicate, params, severity, message_key)
           VALUES ($1, $2, $3, $4, $5::jsonb, 'blocks', $6)
           ON CONFLICT (id) DO NOTHING`,
          [stableId(`rule_eligibility:${rule.id}:${eligibility.predicate}`), rule.id, index + 1,
            eligibility.predicate, JSON.stringify(eligibility.params), eligibility.messageKey],
        );
      }
    }
  }

  for (const product of fx.products) {
    await ins(
      client,
      `INSERT INTO core.sport_entry_product
         (id, event_id, sport_id, name, participant_type, rule_set_id,
          allowed_grades, partner_required, requires_evidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        product.id,
        product.eventId,
        product.sportId,
        product.name,
        product.participantType,
        ruleSetId(product.ruleId),
        product.allowedGrades,
        product.partnerRequired,
        product.requiresEvidence,
      ],
    );
  }

  await ins(
    client,
    `INSERT INTO core.tax_rule (id, event_id, name, rate_bp, tax_code, rounding, basis, effective, status)
     VALUES ($1, $2, 'VAT exempt (N1)', 0, 'N1', 'half_up', 'exclusive',
             tstzrange('2026-01-01', NULL), 'active')
     ON CONFLICT (id) DO NOTHING`,
    [TAX_N1, EVENT_ID],
  );

  for (const fee of fx.fees) {
    await ins(
      client,
      `INSERT INTO core.fee
         (id, event_id, sport_entry_product_id, category_id, grade, currency,
          base_amount_minor, service_amount_minor, effective)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, tstzrange($9::timestamptz, NULL))
       ON CONFLICT (id) DO NOTHING`,
      [
        fee.id,
        fee.eventId,
        fee.sportEntryProductId,
        fee.categoryId ?? null,
        fee.grade,
        fee.currency,
        fee.baseAmountMinor,
        fee.serviceAmountMinor,
        fee.effectiveFrom,
      ],
    );
  }
}

async function seedQuotaPools(client: PoolClient): Promise<void> {
  const sportTotals = new Map<string, { confirmed: number; capacity: number }>();
  for (const quota of fx.quotas) {
    const product = fx.products.find((p) => p.id === quota.sportEntryProductId);
    if (!product) continue;
    const current = sportTotals.get(product.sportId) ?? { confirmed: 0, capacity: 0 };
    current.confirmed += quota.confirmed;
    current.capacity += quota.capacity;
    sportTotals.set(product.sportId, current);
  }

  for (const sport of fx.sports) {
    const totals = sportTotals.get(sport.id) ?? { confirmed: 0, capacity: 0 };
    const cap = Math.max(totals.capacity + 40, totals.confirmed + 40);
    await ins(
      client,
      `INSERT INTO core.quota_pool
         (id, event_id, name, scope_kind, scope_ref, unit, capacity, confirmed, reserved)
       VALUES ($1, $2, $3, 'sport', $4, 'entry', $5, $6, 0)
       ON CONFLICT (id) DO NOTHING`,
      [sportPoolId(sport.id), EVENT_ID, `${sport.name} sport cap`, sport.id, cap, totals.confirmed],
    );
  }

  for (const quota of fx.quotas) {
    const product = fx.products.find((p) => p.id === quota.sportEntryProductId);
    if (!product) continue;
    const isTeam = product.participantType === 'team' || product.participantType === 'crew';
    const scopeKind = quota.categoryId ? 'category' : 'product';
    const scopeRef = quota.categoryId ?? product.id;
    const name = quota.categoryId
      ? (fx.rules.flatMap((r) => r.bands ?? []).find((b) => b.id === quota.categoryId)?.name ??
        product.name)
      : product.name;
    await ins(
      client,
      `INSERT INTO core.quota_pool
         (id, event_id, name, scope_kind, scope_ref, parent_pool_id, unit,
          capacity, confirmed, reserved)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [
        quota.id,
        quota.eventId,
        name,
        scopeKind,
        scopeRef,
        sportPoolId(product.sportId),
        isTeam ? 'team' : 'entry',
        quota.capacity,
        quota.confirmed,
        quota.reserved,
      ],
    );
  }
}

async function seedOcAdmin(client: PoolClient): Promise<void> {
  const ocEmail = process.env.AUTH_SEED_OC_ADMIN_EMAIL;
  const ocPassword = process.env.AUTH_SEED_OC_ADMIN_PASSWORD;
  if (!ocEmail || !ocPassword) return;
  const ocId = (
    await client.query<{ id: string }>(`SELECT id FROM core.person WHERE email = $1`, [ocEmail])
  ).rows[0]?.id;
  const adminId = ocId ?? stableId(`person:oc-admin:${ocEmail}`);
  await ensurePerson(client, adminId, 'Dev', 'Admin', '1980-01-01', {
    email: ocEmail,
    nationality: 'IT',
  });
  await ensureRole(client, adminId, 'oc_admin', null);
  await ensureCredential(client, adminId, ocEmail, ocPassword);
}

async function seedPeople(client: PoolClient, names: Map<string, string>): Promise<void> {
  const participantEmail = process.env.AUTH_SEED_PARTICIPANT_EMAIL ?? 'daniel.harper@example.com';
  // oc_staff cannot be inserted until an oc_admin exists to be named as granted_by.
  await seedOcAdmin(client);

  for (const athlete of fx.athletes) {
    const email = athlete.id === HARPER_ID ? participantEmail : athlete.email;
    await ensurePerson(
      client,
      athlete.id,
      athlete.firstName,
      athlete.lastName,
      athlete.dateOfBirth,
      {
        email,
        nationality: athlete.nationalityCountryCode,
        gender: athlete.gender,
        phone: athlete.phone,
        imageKey: athlete.profileImageKey,
      },
    );
    names.set(`${athlete.firstName} ${athlete.lastName}`.toLowerCase(), athlete.id);
    const profile =
      athlete.id === HARPER_ID
        ? HARPER_PROFILE
        : athlete.id === LUCA_ID
          ? LUCA_PROFILE
          : profileId(athlete.id);
    await ensureProfile(client, athlete.id, profile);
    await ensureRole(client, athlete.id, 'participant', EVENT_ID);
    const contact = athlete.emergencyContact;
    if (contact) {
      await ins(
        client,
        `INSERT INTO core.emergency_contact (id, person_id, name, relationship, phone, ordinal)
         VALUES ($1, $2, $3, $4, $5, 1)
         ON CONFLICT (id) DO NOTHING`,
        [
          athlete.id === HARPER_ID ? HARPER_EMERGENCY : stableId(`emergency_contact:${athlete.id}`),
          athlete.id,
          contact.name,
          contact.relationship,
          contact.phone,
        ],
      );
    }
  }

  await ensureProfile(client, MARCO_TENNIS_ID, MARCO_TENNIS_PROFILE);

  for (const roster of fx.rosters) {
    for (const member of roster.members) {
      if (await personExists(client, member.athleteId)) {
        names.set(member.name.toLowerCase(), member.athleteId);
        await ensureProfile(client, member.athleteId);
        continue;
      }
      const { given, family } = splitName(member.name);
      await ensurePerson(client, member.athleteId, given, family, member.dob, {
        nationality: 'IT',
        gender: 'male',
      });
      names.set(member.name.toLowerCase(), member.athleteId);
      await ensureProfile(client, member.athleteId);
      await ensureRole(client, member.athleteId, 'participant', EVENT_ID);
    }
  }

  await ensurePerson(client, HELEN_ID, 'Helen', 'Ward', '1978-04-12', {
    email: 'helen.ward@example.com',
    nationality: 'GB',
  });
  await ensureRole(client, HELEN_ID, 'oc_staff', EVENT_ID);

  await ensurePerson(client, ELENA_ID, 'Elena', 'Rossi', '1984-05-18', {
    email: 'elena.rossi.para@demo.invalid',
    nationality: 'IT',
    gender: 'female',
  });
  names.set('elena rossi', ELENA_ID);
  await ensureProfile(client, ELENA_ID, ELENA_PROFILE);
  await ensureRole(client, ELENA_ID, 'participant', EVENT_ID);

  await ensurePerson(client, GIULIA_ID, 'Giulia', 'Moretti', '1990-01-11', {
    email: 'giulia.moretti@example.com',
    nationality: 'IT',
    gender: 'female',
  });
  names.set('giulia moretti', GIULIA_ID);

  await ins(
    client,
    `INSERT INTO core.consent (id, person_id, event_id, kind, granted, version, source)
     VALUES ($1, $2, $3, 'eligibility_medical_evidence', true, 'Sensitive v1', 'participant')
     ON CONFLICT (id) DO NOTHING`,
    [ELENA_CONSENT, ELENA_ID, EVENT_ID],
  );

  const harperConsent = fx.athletes[0];
  if (harperConsent) {
    await ins(
      client,
      `INSERT INTO core.consent (id, person_id, event_id, kind, granted, version, source, occurred_at)
       VALUES ($1, $2, $3, 'assisted_registration', true, 'CONSENT-COMO27-0101', 'oc_staff', '2026-09-03T08:30:00Z')
       ON CONFLICT (id) DO NOTHING`,
      ['71da6415-09d5-4d23-b247-723a69cafaa4', HARPER_ID, EVENT_ID],
    );
  }

  await ins(
    client,
    `INSERT INTO core.privacy_notice (id, event_id, code, version_no, status, message_key, approved_by, approved_at)
     VALUES ($1, $2, 'sensitive_processing', 1, 'draft', 'privacy.notice.sensitive', $3, now())
     ON CONFLICT (id) DO NOTHING`,
    [NOTICE_SENSITIVE, EVENT_ID, HELEN_ID],
  );
  await client.query(
    `UPDATE core.privacy_notice SET status = 'approved', approved_at = now()
      WHERE id = $1 AND status = 'draft'`,
    [NOTICE_SENSITIVE],
  );
}

async function personExists(client: PoolClient, id: string): Promise<boolean> {
  const r = await client.query(`SELECT 1 FROM core.person WHERE id = $1`, [id]);
  return (r.rowCount ?? 0) > 0;
}

/** Deterministic A4 fixtures: Daniel passes; Marco fails belt; Luca's licence has expired. */
async function seedJudoFacts(client: PoolClient): Promise<void> {
  const facts = [
    [HARPER_ID, 'weight_kg', 80.4, null, null],
    [HARPER_ID, 'belt_rank', null, '2dan', null],
    [HARPER_ID, 'federation_licence', null, 'active', '2028-01-01'],
    [MARCO_TENNIS_ID, 'weight_kg', 79.7, null, null],
    [MARCO_TENNIS_ID, 'belt_rank', null, '2kyu', null],
    [MARCO_TENNIS_ID, 'federation_licence', null, 'active', '2028-01-01'],
    [LUCA_ID, 'weight_kg', 80.1, null, null],
    [LUCA_ID, 'belt_rank', null, '2dan', null],
    [LUCA_ID, 'federation_licence', null, 'active', '2027-12-30'],
  ] as const;
  for (const [personId, attribute, numericValue, textValue, validUntil] of facts) {
    await ins(client,
      `INSERT INTO core.entrant_attribute
         (id, event_id, person_id, attribute, sport_code, issuer, version_no, numeric_value,
          text_value, status, verified_by, verified_at, valid_from, valid_until)
       VALUES ($1, $2, $3, $4, 'judo', $5, 1, $6, $7, 'verified', $8, now(), '2026-01-01', $9)
       ON CONFLICT (id) DO NOTHING`,
      [stableId(`judo_fact:${personId}:${attribute}`), EVENT_ID, personId, attribute,
        attribute === 'federation_licence' ? 'Judo federation' : null, numericValue, textValue,
        HELEN_ID, validUntil]);
  }
}

async function seedTeams(client: PoolClient): Promise<void> {
  for (const roster of fx.rosters) {
    const versionId = roster.id === BASKETBALL_TEAM ? BASKETBALL_VERSION : ROWING_VERSION;
    await ins(
      client,
      `INSERT INTO core.team_roster
         (id, event_id, captain_profile_id, name, sport_entry_product_id, visibility, matching_authority)
       VALUES ($1, $2, $3, $4, $5, 'members', 'captain')
       ON CONFLICT (id) DO NOTHING`,
      [roster.id, roster.eventId, HARPER_PROFILE, roster.name, roster.sportEntryProductId],
    );

    for (const [i, member] of roster.members.entries()) {
      await ins(
        client,
        `INSERT INTO core.roster_member
           (id, roster_id, person_id, display_name, date_of_birth, role, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [member.id, roster.id, member.athleteId, member.name, member.dob, member.role, i + 1],
      );
    }

    const inserted = await ins(
      client,
      `INSERT INTO core.roster_version (id, team_id, version_no, status)
       VALUES ($1, $2, 1, 'draft')
       ON CONFLICT (id) DO NOTHING`,
      [versionId, roster.id],
    );
    if (inserted) {
      const selected = roster.members.filter((m) => roster.originalMemberIds.includes(m.id));
      for (const [i, member] of selected.entries()) {
        await client.query(
          `INSERT INTO core.roster_selection
             (roster_version_id, person_id, membership_id, display_name, date_of_birth,
              role, position, competes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
          [versionId, member.athleteId, member.id, member.name, member.dob, member.role, i + 1],
        );
      }
      await client.query(
        `UPDATE core.roster_version
            SET status = 'approved', approved_by = $2, approved_at = now(),
                published_by = $2, published_at = now()
          WHERE id = $1`,
        [versionId, HARPER_ID],
      );
    }
  }
}

async function seedEntries(client: PoolClient): Promise<void> {
  await ins(
    client,
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, partner_profile_id,
        grade, rule_version_id, original_category_id, original_category_name,
        current_category_id, current_category_name, evidence_status, status)
     VALUES ($1, $2, $3, $4, $5, 'competitive', $6, $7, 'Men''s Doubles 35–39',
             $7, 'Men''s Doubles 35–39', 'not_required', 'confirmed')
     ON CONFLICT (id) DO NOTHING`,
    [
      TENNIS_ENTRY,
      EVENT_ID,
      HARPER_PROFILE,
      TENNIS_PRODUCT,
      MARCO_TENNIS_PROFILE,
      TENNIS_RULE_VERSION,
      TENNIS_35_39,
    ],
  );

  const basketballRoster = fx.rosters.find((r) => r.id === BASKETBALL_TEAM);
  if (basketballRoster) {
    const competing = basketballRoster.members.filter((m) =>
      basketballRoster.originalMemberIds.includes(m.id),
    );
    for (const member of competing) {
      const pid = member.athleteId;
      const eid = pid === HARPER_ID ? HARPER_BASKETBALL_ENTRY : entryIdFor(pid, BASKETBALL_PRODUCT);
      const prof = pid === HARPER_ID ? HARPER_PROFILE : profileId(pid);
      await ins(
        client,
        `INSERT INTO core.registration_entry
           (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id,
            original_category_id, original_category_name, current_category_id, current_category_name,
            team_roster_id, original_roster_version_id, current_roster_version_id,
            evidence_status, status)
         VALUES ($1, $2, $3, $4, 'competitive', $5, $6, $7, $6, $7, $8, $9, $9,
                 'not_required', 'confirmed')
         ON CONFLICT (id) DO NOTHING`,
        [
          eid,
          EVENT_ID,
          prof,
          BASKETBALL_PRODUCT,
          BASKETBALL_RULE_VERSION,
          BASKETBALL_35_39,
          basketballRoster.originalCategoryName,
          BASKETBALL_TEAM,
          BASKETBALL_VERSION,
        ],
      );
    }
  }

  await ins(
    client,
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id,
        original_category_id, original_category_name, current_category_id, current_category_name,
        team_roster_id, original_roster_version_id, current_roster_version_id,
        evidence_status, status)
     VALUES ($1, $2, $3, $4, 'competitive', $5, $6, 'Category C (43–49)', $6, 'Category C (43–49)',
             $7, $8, $8, 'not_required', 'confirmed')
     ON CONFLICT (id) DO NOTHING`,
    [
      HARPER_ROWING_ENTRY,
      EVENT_ID,
      HARPER_PROFILE,
      ROWING_PRODUCT,
      ROWING_RULE_VERSION,
      ROWING_CAT_C,
      ROWING_TEAM,
      ROWING_VERSION,
    ],
  );

  await ins(
    client,
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id,
        evidence_status, status)
     VALUES ($1, $2, $3, $4, 'competitive', $5, 'not_required', 'waitlisted')
     ON CONFLICT (id) DO NOTHING`,
    [LUCA_BASKETBALL_ENTRY, EVENT_ID, LUCA_PROFILE, BASKETBALL_PRODUCT, BASKETBALL_RULE_VERSION],
  );

  await ins(
    client,
    `INSERT INTO core.waitlist_entry (id, quota_pool_id, entry_id, status, position, joined_at)
     VALUES ($1, $2, $3, 'waiting', 1, '2026-09-03T08:00:00Z')
     ON CONFLICT (id) DO NOTHING`,
    [LUCA_WAITLIST, BASKETBALL_FULL_POOL, LUCA_BASKETBALL_ENTRY],
  );

  await ins(
    client,
    `INSERT INTO core.registration_entry
       (id, event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id,
        evidence_status, status)
     VALUES ($1, $2, $3, $4, 'competitive', $5, 'pending', 'draft')
     ON CONFLICT (id) DO NOTHING`,
    [ELENA_ENTRY, EVENT_ID, ELENA_PROFILE, PARA_PRODUCT, PARA_RULE_VERSION],
  );
}

async function seedMoney(client: PoolClient): Promise<void> {
  await ins(
    client,
    `INSERT INTO core.billing_profile (id, event_id, person_id, kind, legal_name, country)
     VALUES ($1, $2, $3, 'person', 'Daniel Harper', 'GB')
     ON CONFLICT (id) DO NOTHING`,
    [HARPER_BILLING, EVENT_ID, HARPER_ID],
  );

  await ins(
    client,
    `INSERT INTO core.registration_order
       (id, event_id, payer_person_id, kind, status, currency)
     VALUES ($1, $2, $3, 'individual', 'open', 'EUR')
     ON CONFLICT (id) DO NOTHING`,
    [TENNIS_ORDER, EVENT_ID, HARPER_ID],
  );
  const fee = fx.fees.find((f) => f.id === TENNIS_FEE);
  const tennisGross = fee?.baseAmountMinor ?? 9000;
  await ins(
    client,
    `INSERT INTO core.order_line
       (id, order_id, entry_id, kind, description, unit_net_minor, net_minor,
        tax_rate_bp, tax_minor, tax_code, tax_rule_id, gross_minor)
     VALUES ($1, $2, $3, 'entry_fee', 'Tennis Men''s Doubles — competitive', $4, $4, 0, 0, 'N1', $5, $4)
     ON CONFLICT (id) DO NOTHING`,
    [TENNIS_LINE, TENNIS_ORDER, TENNIS_ENTRY, tennisGross, TAX_N1],
  );

  await ins(
    client,
    `INSERT INTO core.payment_intent
       (id, order_id, payer_person_id, psp, status, amount_minor, currency)
     VALUES ($1, $2, $3, 'stripe', 'pending', $4, 'EUR')
     ON CONFLICT (id) DO NOTHING`,
    [TENNIS_INTENT, TENNIS_ORDER, HARPER_ID, tennisGross],
  );
  const tennisIntent = await client.query<{ allocated_minor: string; status: string }>(
    `SELECT allocated_minor::text, status FROM core.payment_intent WHERE id = $1`,
    [TENNIS_INTENT],
  );
  if (tennisIntent.rows[0] && tennisIntent.rows[0].status !== 'settled') {
    await client.query(`SELECT core.allocate_payment_fifo($1)`, [TENNIS_INTENT]);
    await client.query(`UPDATE core.payment_intent SET status = 'settled' WHERE id = $1`, [
      TENNIS_INTENT,
    ]);
  }
  const tennisInvoice = await client.query(
    `SELECT 1 FROM core.invoice WHERE order_id = $1 AND type = 'invoice'`,
    [TENNIS_ORDER],
  );
  if (!tennisInvoice.rowCount) {
    await client.query(`SELECT core.issue_invoice($1, $2, $3, $4, $5, $6, $7, $8)`, [
      TENNIS_ORDER,
      'COMO27',
      SELLER.legalName,
      SELLER.vatId,
      SELLER.address,
      'Daniel Harper',
      null,
      'United Kingdom',
    ]);
  }

  const basketballRoster = fx.rosters.find((r) => r.id === BASKETBALL_TEAM);
  if (!basketballRoster) return;
  const competing = basketballRoster.members.filter((m) =>
    basketballRoster.originalMemberIds.includes(m.id),
  );
  const lineGross = fx.fees.find((f) => f.id === BASKETBALL_FEE_35_39)?.baseAmountMinor ?? 12000;

  await ins(
    client,
    `INSERT INTO core.registration_order
       (id, event_id, payer_person_id, kind, on_behalf_of, status, currency)
     VALUES ($1, $2, $3, 'team', $4, 'open', 'EUR')
     ON CONFLICT (id) DO NOTHING`,
    [BASKETBALL_ORDER, EVENT_ID, HARPER_ID, BASKETBALL_TEAM],
  );

  for (const member of competing) {
    const eid =
      member.athleteId === HARPER_ID
        ? HARPER_BASKETBALL_ENTRY
        : entryIdFor(member.athleteId, BASKETBALL_PRODUCT);
    await ins(
      client,
      `INSERT INTO core.order_line
         (id, order_id, entry_id, kind, description, unit_net_minor, net_minor,
          tax_rate_bp, tax_minor, tax_code, tax_rule_id, gross_minor)
       VALUES ($1, $2, $3, 'entry_fee', 'Basketball Men''s Team 35–39', $4, $4, 0, 0, 'N1', $5, $4)
       ON CONFLICT (id) DO NOTHING`,
      [orderLineId(BASKETBALL_ORDER, member.athleteId), BASKETBALL_ORDER, eid, lineGross, TAX_N1],
    );
  }

  const partPaid = lineGross * 2;
  await ins(
    client,
    `INSERT INTO core.payment_intent
       (id, order_id, payer_person_id, psp, status, amount_minor, currency)
     VALUES ($1, $2, $3, 'stripe', 'pending', $4, 'EUR')
     ON CONFLICT (id) DO NOTHING`,
    [BASKETBALL_INTENT, BASKETBALL_ORDER, HARPER_ID, partPaid],
  );
  const bbIntent = await client.query<{ status: string }>(
    `SELECT status FROM core.payment_intent WHERE id = $1`,
    [BASKETBALL_INTENT],
  );
  if (bbIntent.rows[0]?.status !== 'settled') {
    await client.query(`SELECT core.allocate_payment_fifo($1)`, [BASKETBALL_INTENT]);
    await client.query(`UPDATE core.payment_intent SET status = 'settled' WHERE id = $1`, [
      BASKETBALL_INTENT,
    ]);
  }
}

async function seedEvidence(client: PoolClient): Promise<void> {
  const identityInserted = await ins(
    client,
    `INSERT INTO core.evidence_requirement_set
       (id, event_id, code, document_kind, classification)
     VALUES ($1, $2, 'identity_document', 'identity_document', 'ordinary')
     ON CONFLICT (id) DO NOTHING`,
    [IDENTITY_REQ_SET, EVENT_ID],
  );
  const identityVer = await ins(
    client,
    `INSERT INTO core.evidence_requirement_version
       (id, requirement_set_id, version_no, status, effective, requiredness, valid_through,
        accepted_mime_types, message_key)
     VALUES ($1, $2, 1, 'draft', tstzrange('2026-01-01', NULL), 'required', 'games_day',
             '{application/pdf}', 'evidence.identity.required')
     ON CONFLICT (id) DO NOTHING`,
    [IDENTITY_REQ_VER, IDENTITY_REQ_SET],
  );
  if (identityVer) {
    await client.query(
      `INSERT INTO core.evidence_requirement_applicability (requirement_version_id, sport_id)
       VALUES ($1, $2), ($1, $3)`,
      [IDENTITY_REQ_VER, fx.sports.find((s) => s.name === 'Swimming')?.id, PARA_SPORT],
    );
    await client.query(
      `UPDATE core.evidence_requirement_version SET status = 'active', published_at = now() WHERE id = $1`,
      [IDENTITY_REQ_VER],
    );
  }
  void identityInserted;

  // Swimming's medical certificate (scenario 1). Restricted, like the para classification.
  await ins(
    client,
    `INSERT INTO core.evidence_requirement_set
       (id, event_id, code, document_kind, classification)
     VALUES ($1, $2, 'medical_certificate', 'medical_certificate', 'restricted')
     ON CONFLICT (id) DO NOTHING`,
    [MEDICAL_REQ_SET, EVENT_ID],
  );
  const medicalVer = await ins(
    client,
    `INSERT INTO core.evidence_requirement_version
       (id, requirement_set_id, version_no, status, effective, requiredness, valid_through, message_key)
     VALUES ($1, $2, 1, 'draft', tstzrange('2026-01-01', NULL), 'required', 'stated_expiry',
             'evidence.medical.required')
     ON CONFLICT (id) DO NOTHING`,
    [MEDICAL_REQ_VER, MEDICAL_REQ_SET],
  );
  if (medicalVer) {
    await client.query(
      `INSERT INTO core.evidence_requirement_applicability (requirement_version_id, sport_id)
       VALUES ($1, $2)`,
      [MEDICAL_REQ_VER, fx.sports.find((s) => s.name === 'Swimming')?.id],
    );
    await client.query(
      `UPDATE core.evidence_requirement_version SET status = 'active', published_at = now() WHERE id = $1`,
      [MEDICAL_REQ_VER],
    );
  }

  // Judo's weight/belt/licence claims are normal evidence records.  On an OC approval the
  // evidence service writes the verified entrant fact; expiry stays on the licence fact.
  const judoRequirements = [
    [JUDO_LICENCE_REQ_SET, JUDO_LICENCE_REQ_VER, 'judo_federation_licence', 'federation_licence', 'evidence.judo.licence.required'],
    [JUDO_BELT_REQ_SET, JUDO_BELT_REQ_VER, 'judo_belt_certificate', 'belt_certificate', 'evidence.judo.belt.required'],
    [JUDO_WEIGHT_REQ_SET, JUDO_WEIGHT_REQ_VER, 'judo_weigh_in', 'weigh_in', 'evidence.judo.weight.required'],
  ] as const;
  for (const [setId, versionId, code, documentKind, messageKey] of judoRequirements) {
    await ins(client,
      `INSERT INTO core.evidence_requirement_set (id, event_id, code, document_kind, classification)
       VALUES ($1, $2, $3, $4, 'ordinary') ON CONFLICT (id) DO NOTHING`,
      [setId, EVENT_ID, code, documentKind]);
    const inserted = await ins(client,
      `INSERT INTO core.evidence_requirement_version
         (id, requirement_set_id, version_no, status, effective, requiredness, valid_through, message_key)
       VALUES ($1, $2, 1, 'draft', tstzrange('2026-01-01', NULL), 'required', 'stated_expiry', $3)
       ON CONFLICT (id) DO NOTHING`, [versionId, setId, messageKey]);
    if (inserted) {
      await client.query(
        `INSERT INTO core.evidence_requirement_applicability (requirement_version_id, sport_entry_product_id)
         VALUES ($1, $2)`, [versionId, JUDO_PRODUCT]);
      await client.query(
        `UPDATE core.evidence_requirement_version SET status = 'active', published_at = now() WHERE id = $1`, [versionId]);
    }
  }

  await ins(
    client,
    `INSERT INTO core.evidence_requirement_set
       (id, event_id, code, document_kind, classification)
     VALUES ($1, $2, 'para_class', 'para_classification', 'restricted')
     ON CONFLICT (id) DO NOTHING`,
    [PARA_REQ_SET, EVENT_ID],
  );
  const paraVer = await ins(
    client,
    `INSERT INTO core.evidence_requirement_version
       (id, requirement_set_id, version_no, status, effective, requiredness, valid_through, message_key)
     VALUES ($1, $2, 1, 'draft', tstzrange('2026-01-01', NULL), 'required', 'stated_expiry',
             'evidence.para_class.required')
     ON CONFLICT (id) DO NOTHING`,
    [PARA_REQ_VER, PARA_REQ_SET],
  );
  if (paraVer) {
    await client.query(
      `INSERT INTO core.evidence_requirement_applicability (requirement_version_id, sport_id)
       VALUES ($1, $2)`,
      [PARA_REQ_VER, PARA_SPORT],
    );
    await client.query(
      `UPDATE core.evidence_requirement_version SET status = 'active', published_at = now() WHERE id = $1`,
      [PARA_REQ_VER],
    );
  }

  const first = fx.evidence[0];
  if (first) {
    const obligationId = first.id;
    await ins(
      client,
      `INSERT INTO core.evidence_obligation (id, event_id, person_id, requirement_set_id, classification)
       VALUES ($1, $2, $3, $4, 'ordinary')
       ON CONFLICT (id) DO NOTHING`,
      [obligationId, EVENT_ID, HARPER_ID, IDENTITY_REQ_SET],
    );
    await ins(
      client,
      `INSERT INTO core.evidence_obligation_application (obligation_id, entry_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [obligationId, TENNIS_ENTRY],
    );
    await ins(
      client,
      `INSERT INTO core.evidence_upload
         (id, obligation_id, version_no, s3_key, mime_type, size_bytes, scan_status,
          original_file_name, uploaded_at)
       VALUES ($1, $2, 1, $3, $4, $5, 'clean', $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        HARPER_IDENTITY_UPLOAD,
        obligationId,
        first.mockUri,
        first.mimeType,
        first.fileSizeBytes,
        first.fileName,
        first.uploadedAt,
      ],
    );
    await ins(
      client,
      `INSERT INTO core.evidence_review (id, upload_id, decision, reviewer_id, occurred_at)
       VALUES ($1, $2, 'approved', $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [
        HARPER_IDENTITY_REVIEW,
        HARPER_IDENTITY_UPLOAD,
        HELEN_ID,
        first.reviewedAt ?? first.uploadedAt,
      ],
    );
  }
}

async function insertRestrictedRows(restricted: SqlClient): Promise<void> {
  await ins(
    restricted,
    `INSERT INTO restricted.identity_document
       (id, person_id, kind, document_number, lawful_basis, retain_until)
     VALUES ($1, $2, 'passport', 'GB-DEMO-000001', 'contract', '2028-12-31')
     ON CONFLICT (id) DO NOTHING`,
    [HARPER_PASSPORT, HARPER_ID],
  );
  await ins(
    restricted,
    `INSERT INTO restricted.evidence_document
       (id, event_id, person_id, kind, requirement_set_id, classification,
        lawful_basis, retain_until, consent_id, notice_id)
     VALUES ($1, $2, $3, 'para_classification', $4, 'restricted',
             'explicit_consent', '2028-12-31', $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [PARA_DOC, EVENT_ID, ELENA_ID, PARA_REQ_SET, ELENA_CONSENT, NOTICE_SENSITIVE],
  );
  await ins(
    restricted,
    `INSERT INTO restricted.evidence_upload
       (id, document_id, version_no, s3_key, mime_type, scan_status, original_file_name)
     VALUES ($1, $2, 1, 's3://restricted/elena-rossi-s9.pdf', 'application/pdf', 'clean',
             'Elena_Rossi_S9.pdf')
     ON CONFLICT (id) DO NOTHING`,
    [ELENA_UPLOAD, PARA_DOC],
  );
  await ins(
    restricted,
    `INSERT INTO restricted.evidence_review (id, upload_id, decision, reviewer_id)
     VALUES ($1, $2, 'approved', $3)
     ON CONFLICT (id) DO NOTHING`,
    [ELENA_REVIEW, ELENA_UPLOAD, HELEN_ID],
  );
  await ins(
    restricted,
    `INSERT INTO restricted.classification_fact
       (id, event_id, person_id, sport_code, class_code, verification_status,
        supporting_document_id, protected_evidence_id, consent_id, notice_id,
        lawful_basis, retain_until)
     VALUES ($1, $2, $3, 'para_swimming', 'S9', 'verified', $4, $5, $6, $7,
             'explicit_consent', '2028-12-31')
     ON CONFLICT (id) DO NOTHING`,
    [PARA_FACT, EVENT_ID, ELENA_ID, PARA_DOC, PARA_REF, ELENA_CONSENT, NOTICE_SENSITIVE],
  );
}

/**
 * Restricted rows authenticate as restricted_rw. Never GRANT that role to the
 * ordinary connection, and never SET ROLE on a pooled session — RESET ROLE is
 * session-scoped, and a swallowed failure hands the next caller a restricted_rw
 * connection. Owner `npm run seed` (no RESTRICTED_DATABASE_URL) writes directly.
 */
async function seedRestricted(pool: Pool): Promise<void> {
  const restrictedUrl = env.RESTRICTED_DATABASE_URL;
  if (restrictedUrl) {
    const restricted = new Client({ connectionString: restrictedUrl });
    await restricted.connect();
    try {
      await restricted.query('BEGIN');
      try {
        await insertRestrictedRows(restricted);
        await restricted.query('COMMIT');
      } catch (err) {
        await restricted.query('ROLLBACK');
        throw err;
      }
    } finally {
      await restricted.end();
    }
  } else {
    await insertRestrictedRows(pool);
  }

  await ins(
    pool,
    `INSERT INTO core.protected_evidence_ref
       (id, person_id, event_id, kind, restricted_record_id)
     VALUES ($1, $2, $3, 'para_classification', $4)
     ON CONFLICT (id) DO NOTHING`,
    [PARA_REF, ELENA_ID, EVENT_ID, PARA_DOC],
  );
}

async function seedAccreditations(client: PoolClient, names: Map<string, string>): Promise<void> {
  for (const acc of fx.accreditations) {
    let personId = acc.athleteId ?? names.get(acc.participantName.toLowerCase());
    if (!personId) {
      personId =
        acc.participantName.toLowerCase() === 'giulia moretti'
          ? GIULIA_ID
          : stableId(`person:${acc.participantName}:${acc.nationalityCountryCode}`);
      const { given, family } = splitName(acc.participantName);
      const dob = personId === GIULIA_ID ? '1990-01-11' : '1985-01-01';
      await ensurePerson(client, personId, given, family, dob, {
        email: personId === GIULIA_ID ? 'giulia.moretti@example.com' : undefined,
        nationality: acc.nationalityCountryCode,
      });
      names.set(acc.participantName.toLowerCase(), personId);
    }
    const entryId =
      acc.athleteId === HARPER_ID && acc.sportName === 'Tennis'
        ? TENNIS_ENTRY
        : acc.athleteId === HARPER_ID && acc.sportName === 'Basketball'
          ? HARPER_BASKETBALL_ENTRY
          : null;
    await ins(
      client,
      `INSERT INTO core.accreditation
         (id, event_id, person_id, registration_entry_id, badge_number, role, sport_name,
          zones, photo_status, eligibility_status, status, valid_from, valid_until, issued_at,
          revoked_at, revoked_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (id) DO NOTHING`,
      [
        stableId(acc.id),
        EVENT_ID,
        personId,
        entryId,
        acc.badgeNumber ?? null,
        acc.role,
        acc.sportName,
        acc.accessZones,
        acc.photoStatus,
        acc.eligibilityStatus,
        acc.status,
        acc.validFrom,
        acc.validUntil,
        acc.issuedAt ?? null,
        acc.status === 'revoked' ? (acc.updatedAt ?? acc.issuedAt ?? null) : null,
        acc.revokedReason ?? null,
      ],
    );
  }
}

async function seedComms(client: PoolClient): Promise<void> {
  for (const tpl of fx.templates) {
    const id = stableId(tpl.id);
    const versionId = stableId(`comms_template_version:${tpl.id}:1`);
    const channel = mapChannel(tpl.channel);
    await ins(
      client,
      `INSERT INTO core.comms_template (id, event_id, code, channel, classification, name_key)
       VALUES ($1, $2, $3, $4, 'transactional', $5)
       ON CONFLICT (id) DO NOTHING`,
      [id, EVENT_ID, templateCode(tpl.id), channel, `comms.template.${templateCode(tpl.id)}`],
    );
    const inserted = await ins(
      client,
      `INSERT INTO core.comms_template_version (id, template_id, version_no, status)
       VALUES ($1, $2, 1, 'draft')
       ON CONFLICT (id) DO NOTHING`,
      [versionId, id],
    );
    if (inserted) {
      await client.query(
        `INSERT INTO core.comms_template_copy (template_version_id, locale, subject, body)
         VALUES ($1, 'en', $2, $3), ($1, 'it', $4, $5)`,
        [versionId, tpl.subjectEn, tpl.bodyEn, tpl.subjectIt, tpl.bodyIt],
      );
      await client.query(
        `UPDATE core.comms_template_version
            SET status = 'approved', approved_by = $2, approved_at = now()
          WHERE id = $1`,
        [versionId, HELEN_ID],
      );
    }
  }

  const audiences: Array<{ code: string; nameKey: string; filter: Record<string, unknown> }> = [
    { code: 'all-participants', nameKey: 'comms.audience.all_participants', filter: { all: true } },
    {
      code: 'pending-payment',
      nameKey: 'comms.audience.pending_payment',
      filter: { entryStatus: 'pending_payment' },
    },
    {
      code: 'incomplete-documents',
      nameKey: 'comms.audience.incomplete_documents',
      filter: { evidenceIncomplete: true },
    },
    {
      code: 'confirmed',
      nameKey: 'comms.audience.confirmed',
      filter: { entryStatus: 'confirmed' },
    },
    { code: 'tennis', nameKey: 'comms.audience.tennis', filter: { sport: 'tennis' } },
    { code: 'rowing', nameKey: 'comms.audience.rowing', filter: { sport: 'rowing' } },
  ];
  for (const audience of audiences) {
    await ins(
      client,
      `INSERT INTO core.comms_audience (event_id, code, name_key, filter)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (event_id, code) DO NOTHING`,
      [EVENT_ID, audience.code, audience.nameKey, JSON.stringify(audience.filter)],
    );
  }

  for (const b of fx.broadcasts) {
    const templateId = b.templateId ? stableId(b.templateId) : null;
    const versionId = b.templateId ? stableId(`comms_template_version:${b.templateId}:1`) : null;
    const channel = mapChannel(b.channel);
    const body = fx.templates.find((t) => t.id === b.templateId)?.bodyEn ?? b.subject;
    await ins(
      client,
      `INSERT INTO core.broadcast
         (id, event_id, template_id, template_version_id, channel, classification,
          audience, locale, subject_snapshot, body_snapshot, bindings, status, sent_by, sent_at)
       VALUES ($1, $2, $3, $4, $5, 'transactional', $6::jsonb, 'en', $7, $8, '{}'::jsonb,
               'sent', $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [
        stableId(b.id),
        EVENT_ID,
        templateId,
        versionId,
        channel,
        JSON.stringify({ segment: b.audienceId, recipientCount: b.recipientCount }),
        b.subject,
        body,
        HELEN_ID,
        b.sentAt,
      ],
    );
  }
}

async function activeVersionForSport(
  client: PoolClient,
  sportName: string,
): Promise<string | null> {
  const row = await client.query<{ id: string }>(
    `SELECT rv.id
       FROM core.rule_version rv
       JOIN core.rule_set rs ON rs.id = rv.rule_set_id
       LEFT JOIN core.sport s ON s.event_id = rs.event_id AND s.code = rs.sport_code
      WHERE rv.status = 'active'
        AND (lower(s.name) = lower($1) OR lower(rs.sport_code) = lower($1))
      LIMIT 1`,
    [sportName],
  );
  return row.rows[0]?.id ?? null;
}

async function seedExceptions(client: PoolClient): Promise<void> {
  for (const item of fx.exceptions) {
    const ruleVersionId = await activeVersionForSport(client, item.sport);
    await ins(
      client,
      `INSERT INTO ops.exception_case
         (id, event_id, kind, impact, summary, status, rule_version_id)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        stableId(item.id),
        EVENT_ID,
        item.sport,
        mapImpact(item.impact),
        `${item.participant} — ${item.event}: ${item.reason}`,
        ruleVersionId,
      ],
    );
  }
}

async function seedHarperLogin(client: PoolClient): Promise<void> {
  const email = process.env.AUTH_SEED_PARTICIPANT_EMAIL ?? 'daniel.harper@example.com';
  const password = process.env.AUTH_SEED_PARTICIPANT_PASSWORD ?? 'dev-athlete-password';
  await client.query(`UPDATE core.person SET email = $1 WHERE id = $2`, [email, HARPER_ID]);
  await ensureCredential(client, HARPER_ID, email, password);
}

async function publishRules(client: PoolClient): Promise<void> {
  for (const rule of fx.rules) {
    const row = await client.query<{ status: string }>(
      `SELECT status FROM core.rule_version WHERE id = $1`,
      [rule.id],
    );
    if (row.rows[0]?.status !== 'draft') continue;
    await client.query(`SELECT core.publish_rule_version($1, $2)`, [rule.id, HELEN_ID]);
  }
}

async function seedQuotaConsumption(client: PoolClient): Promise<void> {
  const consume = async (entryId: string, poolId: string): Promise<void> => {
    await ins(
      client,
      `INSERT INTO core.entry_quota_consumption (entry_id, quota_pool_id, units, state)
       VALUES ($1, $2, 1, 'confirmed')
       ON CONFLICT DO NOTHING`,
      [entryId, poolId],
    );
  };
  const tennisPool = fx.quotas.find(
    (q) => q.sportEntryProductId === TENNIS_PRODUCT && !q.categoryId,
  );
  if (tennisPool) {
    await consume(TENNIS_ENTRY, tennisPool.id);
    await consume(TENNIS_ENTRY, sportPoolId(TENNIS_SPORT));
  }
  await consume(HARPER_BASKETBALL_ENTRY, BASKETBALL_FULL_POOL);
  await consume(HARPER_BASKETBALL_ENTRY, sportPoolId(BASKETBALL_SPORT));
  const rowingPool = fx.quotas.find((q) => q.categoryId === ROWING_CAT_C);
  if (rowingPool) {
    await consume(HARPER_ROWING_ENTRY, rowingPool.id);
    await consume(HARPER_ROWING_ENTRY, sportPoolId(ROWING_SPORT));
  }
}

async function seedPreRegistrations(client: PoolClient): Promise<void> {
  for (const item of fx.preRegistrations) {
    let claimedBy: string | null = null;
    if (item.status === 'claimed') {
      const found = await client.query<{ id: string }>(
        `SELECT id FROM core.person WHERE email = $1`,
        [item.email],
      );
      claimedBy = found.rows[0]?.id ?? GIULIA_ID;
    }
    await ins(
      client,
      `INSERT INTO core.pre_registration
         (id, event_id, reference, first_name, last_name, email, date_of_birth,
          nationality, intended_sports, source_list, status, claimed_by, claimed_at,
          migrated_at, migration_batch)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO NOTHING`,
      [
        stableId(item.id),
        EVENT_ID,
        item.reference,
        item.firstName,
        item.lastName,
        item.email,
        item.dateOfBirth,
        item.nationalityCountryCode,
        item.intendedSports,
        item.sourceList,
        item.status,
        claimedBy,
        item.claimedAt ?? null,
        item.migratedAt,
        PRE_REG_BATCH,
      ],
    );
  }
}

function mapProxyMethod(method: string): 'phone' | 'email' | 'in_person' {
  if (method === 'phone' || method === 'email' || method === 'in_person') return method;
  return 'email';
}

function mapAssistedStatus(status: string): 'not_started' | 'draft' | 'submitted' {
  if (status === 'draft' || status === 'submitted' || status === 'not_started') return status;
  return 'not_started';
}

async function seedAssisted(client: PoolClient, names: Map<string, string>): Promise<void> {
  for (const session of fx.assistedSessions) {
    let personId = session.participantId;
    if (!(await personExists(client, personId))) {
      if (!session.consent) continue;
      const known = names.get(session.consent.participantName.toLowerCase());
      if (known) {
        personId = known;
      } else {
        const { given, family } = splitName(session.consent.participantName);
        await ensurePerson(client, session.participantId, given, family, '1985-01-01', {
          nationality: 'IT',
        });
        names.set(session.consent.participantName.toLowerCase(), session.participantId);
        personId = session.participantId;
      }
    }
    const status = mapAssistedStatus(session.registrationStatus);
    let consentId: string | null = null;
    if (session.consent) {
      consentId = session.consent.id;
      await ins(
        client,
        `INSERT INTO core.proxy_consent
           (id, event_id, reference, participant_id, method, captured_by, captured_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          consentId,
          EVENT_ID,
          session.consent.reference,
          personId,
          mapProxyMethod(session.consent.method),
          HELEN_ID,
          session.consent.capturedAt,
        ],
      );
    }
    if (status !== 'not_started' && !consentId) continue;
    await ins(
      client,
      `INSERT INTO core.assisted_session
         (id, event_id, participant_id, operator_id, consent_id, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [session.id, EVENT_ID, personId, HELEN_ID, consentId, status, session.updatedAt],
    );
  }
}

const SEEDED_TRUNCATE = `
TRUNCATE TABLE
  core.event,
  core.person,
  core.invoice_series,
  core.idempotency_key,
  restricted.identity_document,
  restricted.evidence_document,
  restricted.classification_fact,
  restricted.accommodation_need,
  restricted.access_log,
  audit.activity_log
RESTART IDENTITY CASCADE`;

export async function resetDemo(pool: Pool): Promise<void> {
  await pool.query(SEEDED_TRUNCATE);
}

export async function seedDemo(pool: Pool): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed when NODE_ENV=production');
  }
  const client = await pool.connect();
  const names = new Map<string, string>();
  try {
    await client.query('BEGIN');
    await seedCatalogue(client);
    await seedQuotaPools(client);
    await seedPeople(client, names);
    await seedJudoFacts(client);
    await publishRules(client);
    await seedTeams(client);
    await seedEntries(client);
    await seedQuotaConsumption(client);
    await seedMoney(client);
    await seedEvidence(client);
    await seedAccreditations(client, names);
    await seedPreRegistrations(client);
    await seedAssisted(client, names);
    await seedComms(client);
    await seedExceptions(client);
    await seedHarperLogin(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  // After COMMIT so a restricted_rw connection can see requirement-set rows.
  // Same-session SET ROLE is not a boundary and poisons the ordinary pool.
  await seedRestricted(pool);
}
