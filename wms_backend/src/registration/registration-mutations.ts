import type { Pool, PoolClient } from 'pg';
import {
  lockOrder,
  type EntryDecision,
  type EntryQuota,
  type JourneyEntryStatus,
  type JourneyPayment,
  type PayOrderRequest,
  type PayOrderResponse,
  type RegistrationEntry,
  type RegistrationOrder,
  type SaveEntryRequest,
  type TransitionEntryStatusRequest,
  type UpdateEntryEvidenceRequest,
  type WaitlistActionRequest,
  type WaitlistActionResponse,
  type WaitlistEntry,
} from '@wms/domain';
import {
  IdempotencyService,
  type Queryable,
  type RunInTransaction,
} from '../common/idempotency/idempotency.service';
import { RepositoryError } from '../common/errors/repositoryError';
import { CONSENT_CATALOGUE } from '../people/consent.service';
import { deriveEntryCategory } from '../rules/entry-category';
import type { PaymentCharge, PaymentProvider } from './payment-provider';
import { StubPaymentProvider } from './payment-provider';

export type MutationContext = {
  /** Authenticated person id. Also scopes the idempotency key. */
  actorId: string;
  scope: string;
};

type SaveEntryInput = SaveEntryRequest & MutationContext;
type EvidenceInput = UpdateEntryEvidenceRequest & MutationContext;
type WaitlistInput = WaitlistActionRequest & MutationContext & { requireOwner: boolean };
type TransitionInput = TransitionEntryStatusRequest & MutationContext & { requireOwner: boolean };
type PaymentInput = PayOrderRequest & MutationContext;

interface EntryRow {
  id: string;
  event_id: string;
  athlete_profile_id: string;
  sport_id: string;
  sport_entry_product_id: string;
  partner_profile_id: string | null;
  grade: string;
  rule_version_id: string;
  original_category_id: string | null;
  original_category_name: string | null;
  current_category_id: string | null;
  current_category_name: string | null;
  category_change_reason: string | null;
  team_roster_id: string | null;
  evidence_status: string;
  status: string;
  order_id: string | null;
  waitlist_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ProductRow {
  id: string;
  event_id: string;
  sport_id: string;
  participant_type: string;
  rule_set_id: string;
  allowed_grades: string[];
  partner_required: boolean;
  requires_evidence: boolean;
}

interface PoolRow {
  id: string;
  event_id: string;
  name: string;
  scope_kind: string;
  scope_ref: string | null;
  allocation: string;
  parent_pool_id: string | null;
  unit: string;
  capacity: number;
  confirmed: number;
  reserved: number;
  release_from: Date | null;
  release_until: Date | null;
  updated_at: Date;
}

interface WaitlistRow {
  id: string;
  quota_pool_id: string;
  entry_id: string;
  status: string;
  position: number | null;
  offer_expires_at: Date | null;
  joined_at: Date | null;
  updated_at: Date;
}

interface OrderRow {
  id: string;
  event_id: string;
  payer_person_id: string;
  status: string;
  currency: string;
  net_minor: string;
  tax_minor: string;
  gross_minor: string;
  subtotal_minor: string;
  service_minor: string;
  entry_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface PaymentRow {
  id: string;
  order_id: string;
  entry_id: string | null;
  amount_minor: string;
  currency: string;
  payment_method: string;
  status: string;
  psp_intent_id: string | null;
  idempotency_key: string | null;
  attempt_count: number;
  charge_count: number;
  created_at: Date;
  updated_at: Date;
}

interface CategoryResult {
  id?: string;
  name?: string;
  memberAges: Array<{ id: string; name: string; age: number; excluded: boolean }>;
}

const ENTRY_SELECT = `
  SELECT e.*,
         p.sport_id,
         (SELECT ol.order_id FROM core.order_line ol
           WHERE ol.entry_id = e.id ORDER BY ol.id LIMIT 1) AS order_id,
         (SELECT w.id FROM core.waitlist_entry w
           WHERE w.entry_id = e.id ORDER BY w.updated_at DESC, w.id LIMIT 1) AS waitlist_id
    FROM core.registration_entry e
    JOIN core.sport_entry_product p ON p.id = e.sport_entry_product_id`;

/**
 * `quotaPoolId` present means capacity is genuinely exhausted — the caller uses it to make the
 * entry eligible to join the waitlist, once `tx` has rolled back and released this pool's lock.
 * Absent means a release-window timing gate, which a waitlist join does not solve.
 */
const QUOTA_FULL = (quotaPoolId?: string) =>
  new RepositoryError({
    code: 'QUOTA_FULL',
    message: 'This category is full. Join the waitlist to be offered a place if one is released.',
    ...(quotaPoolId ? { fields: { quotaPoolId } } : {}),
  });

const notFound = (code: string, message: string) => new RepositoryError({ code, message });

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function iso(value: Date | string | null): string | undefined {
  return value === null ? undefined : toDate(value).toISOString();
}

function minor(value: string | number | bigint): number {
  const amount = typeof value === 'bigint' ? value : BigInt(value);
  const asNumber = Number(amount);
  if (!Number.isSafeInteger(asNumber)) {
    throw new Error('Money value is outside the JSON safe-integer range.');
  }
  return asNumber;
}

function projectPool(pool: PoolRow, productId = ''): EntryQuota {
  const remaining = pool.capacity - pool.confirmed - pool.reserved;
  return {
    id: pool.id,
    eventId: pool.event_id,
    sportEntryProductId: pool.scope_kind === 'product' ? (pool.scope_ref ?? productId) : productId,
    categoryId: pool.scope_kind === 'category' ? (pool.scope_ref ?? undefined) : undefined,
    capacity: pool.capacity,
    confirmed: pool.confirmed,
    reserved: pool.reserved,
    status: remaining > 0 ? 'available' : 'full',
    updatedAt: toDate(pool.updated_at).toISOString(),
  };
}

/** A transaction runner bound to the pool supplied to the repository (including tests). */
export function transactionRunner(pool: Pool): RunInTransaction {
  return async <T>(work: (tx: Queryable) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };
}

/**
 * Registration writes. `PostgresRegistrationJourneyRepository` delegates to this class so
 * reads and writes still implement one domain repository while the transaction-heavy code
 * remains reviewable on its own.
 */
export class RegistrationMutations {
  private readonly runInTransaction: RunInTransaction;

  constructor(
    private readonly pool: Pool,
    private readonly idempotency = new IdempotencyService(transactionRunner(pool), pool),
    private readonly payments: PaymentProvider = new StubPaymentProvider(),
  ) {
    this.runInTransaction = transactionRunner(pool);
  }

  /**
   * Starts a NEW registration for the signed-in participant — a draft entry.
   *
   * Until this existed, nothing outside the seed ever inserted a `registration_entry`: every
   * journey call edited an entry that was already there, so a real sign-up could not register
   * for anything and the app edited one demo athlete's entry for everybody.
   *
   * It deliberately stops at DRAFT. Quota, fee, order and the submit transition stay in
   * `saveEntry`, which the app calls next with the id returned here — one path to submission,
   * not two that drift apart.
   *
   * What it checks, and where:
   * - one live entry per athlete per product — `uq_entry_live`, in the database; the pre-check
   *   only adds the existing entry id to the same 409 `DUPLICATE_ENTRY`
   * - a placeholder profile cannot register — `registration_entry_needs_real_profile`, also in
   *   the database; checked first so the refusal names what to do
   * - policy entry limits and incompatible products — the existing AFTER INSERT triggers
   * - required consents (PRV-02) — the same catalogue the profile screen renders
   * - the category is derived now for an individual entry, with the SAME `deriveCategory`
   *   `saveEntry` pins with. A doubles/team/crew category depends on the partner or roster and
   *   is derived when those are chosen.
   */
  async createEntry(input: {
    sportEntryProductId: string;
    grade: string;
    idempotencyKey: string;
    actorId: string;
    scope: string;
  }): Promise<RegistrationEntry> {
    const result = await this.idempotency.execute(
      {
        scope: input.scope,
        key: input.idempotencyKey,
        endpoint: 'POST /v1/me/entries',
        body: { sportEntryProductId: input.sportEntryProductId, grade: input.grade },
        mode: 'local',
      },
      async (tx) => ({ status: 201, body: await this.createEntryTx(tx, input) }),
    );
    return result.body as RegistrationEntry;
  }

  private async createEntryTx(
    tx: Queryable,
    input: { sportEntryProductId: string; grade: string; actorId: string },
  ): Promise<RegistrationEntry> {
    const productRow = await tx.query<ProductRow & { event_status: string }>(
      `SELECT sp.id, sp.event_id, sp.sport_id, sp.participant_type, sp.rule_set_id,
              sp.allowed_grades, sp.partner_required, sp.requires_evidence,
              ev.status AS event_status
         FROM core.sport_entry_product sp
         JOIN core.event ev ON ev.id = sp.event_id
        WHERE sp.id = $1`,
      [input.sportEntryProductId],
    );
    const product = productRow.rows[0];
    if (!product)
      throw notFound('SPORT_ENTRY_PRODUCT_NOT_FOUND', 'Sport entry product was not found.');
    if (product.event_status !== 'registration_open') {
      throw new RepositoryError({
        code: 'EVENT_UNAVAILABLE',
        message: 'registration.event.not_open',
      });
    }
    if (!product.allowed_grades.includes(input.grade)) {
      throw new RepositoryError({
        code: 'VALIDATION_ERROR',
        message: 'This grade is not available for the selected product.',
        fields: { grade: 'Select an available competition grade.' },
      });
    }

    const person = await tx.query<{ profile_status: string }>(
      `SELECT profile_status FROM core.person WHERE id = $1`,
      [input.actorId],
    );
    if (person.rows[0]?.profile_status !== 'complete') {
      throw new RepositoryError({
        code: 'PROFILE_INCOMPLETE',
        message: 'registration.profile.incomplete',
      });
    }

    const required = CONSENT_CATALOGUE.filter((entry) => entry.required).map((entry) => entry.kind);
    const granted = await tx.query<{ kind: string; granted: boolean }>(
      `SELECT DISTINCT ON (kind) kind, granted
         FROM core.consent
        WHERE person_id = $1 AND kind = ANY($2::text[])
        ORDER BY kind, occurred_at DESC`,
      [input.actorId, required],
    );
    const missing = required.filter(
      (kind) => !granted.rows.some((row) => row.kind === kind && row.granted),
    );
    if (missing.length > 0) {
      throw new RepositoryError({
        code: 'CONSENT_REQUIRED',
        message: 'registration.consent.required',
        fields: { consents: missing.join(',') },
      });
    }

    const profile = await tx.query<{ id: string }>(
      `INSERT INTO core.athlete_profile (person_id, event_id)
       VALUES ($1, $2)
       ON CONFLICT (person_id, event_id) DO UPDATE SET person_id = EXCLUDED.person_id
       RETURNING id`,
      [input.actorId, product.event_id],
    );
    const athleteProfileId = profile.rows[0]!.id;

    const existing = await tx.query<{ id: string }>(
      `SELECT id FROM core.registration_entry
        WHERE athlete_profile_id = $1 AND sport_entry_product_id = $2
          AND status NOT IN ('cancelled','withdrawn','substituted')`,
      [athleteProfileId, product.id],
    );
    if (existing.rows[0]) {
      throw new RepositoryError({
        // Same code `uq_entry_live` maps to, so a racing second tab and the ordinary case
        // look identical to the app — this one also says which entry to open instead.
        code: 'DUPLICATE_ENTRY',
        message: 'registration.entry.already_exists',
        fields: { entryId: existing.rows[0].id },
      });
    }

    const ruleVersionId = await this.ruleVersion(tx, product.rule_set_id);
    const individual = product.participant_type === 'individual' && !product.partner_required;
    let category: CategoryResult = { id: undefined, name: undefined, memberAges: [] };
    if (individual) {
      try {
        category = await this.deriveCategory(
          tx,
          {
            athlete_profile_id: athleteProfileId,
            event_id: product.event_id,
            sport_entry_product_id: product.id,
            current_category_id: null,
            current_category_name: null,
          } as EntryRow,
          product,
          ruleVersionId,
          {
            registrationEntryId: '',
            sportEntryProductId: product.id,
            grade: input.grade,
          } as SaveEntryInput,
        );
      } catch (caught) {
        // Evidence-backed attributes (Judo weigh-in, belt and licence) do not exist until the
        // participant uploads them and an OC verifies them.  Preserve a DRAFT so that real
        // evidence flow can happen; the existing submit path still derives and refuses it.
        if (
          !(caught instanceof RepositoryError) ||
          caught.code !== 'CATEGORY_NOT_ELIGIBLE' ||
          !product.requires_evidence
        ) {
          throw caught;
        }
      }
    }

    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO core.registration_entry
         (event_id, athlete_profile_id, sport_entry_product_id, grade, rule_version_id,
          original_category_id, original_category_name, current_category_id, current_category_name,
          evidence_status, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $6, $7, $8, 'draft')
       RETURNING id`,
      [
        product.event_id,
        athleteProfileId,
        product.id,
        input.grade,
        ruleVersionId,
        category.id ?? null,
        category.name ?? null,
        (await this.evidenceIsRequired(tx, product, product.sport_id))
          ? 'required'
          : 'not_required',
      ],
    );
    const entryId = inserted.rows[0]!.id;

    // The first audit event is creation, not a transition — `entry_status_policy_guard` allows
    // exactly one event with no from-status, matching the row it describes.
    await tx.query(
      `INSERT INTO core.entry_status_event (entry_id, from_status, to_status, actor_kind, actor_id, reason)
       VALUES ($1, NULL, 'draft', 'participant', $2, 'registration.created')`,
      [entryId, input.actorId],
    );

    return this.hydratedEntry(tx, entryId);
  }

  async saveEntry(input: SaveEntryInput): Promise<EntryDecision> {
    const result = await this.idempotency
      .execute(
        {
          scope: input.scope,
          key: input.idempotencyKey,
          endpoint: `PUT /v1/registration-entries/${input.registrationEntryId}`,
          body: {
            sportEntryProductId: input.sportEntryProductId,
            partnerAthleteId: input.partnerAthleteId,
            grade: input.grade,
            teamRosterId: input.teamRosterId,
            rosterMemberIds: input.rosterMemberIds,
          },
          mode: 'local',
        },
        async (tx) => ({ status: 200, body: await this.saveEntryTx(tx, input) }),
      )
      .catch((err) => this.becomeWaitlistEligible(input.registrationEntryId, err));
    return result.body as EntryDecision;
  }

  /**
   * REG-09: `claimQuotaForEntry` throwing QUOTA_FULL is not the end of the story for a real
   * registration attempt — the entry should now be eligible to join the waitlist. That write
   * cannot happen inside the failing attempt's own transaction (it still holds this pool's row
   * FOR UPDATE; a second connection writing a row that references it would wait on that lock
   * while this transaction waits on the second connection — a real, reproduced deadlock). So it
   * happens here, once `idempotency.execute` has already rolled back and returned the connection.
   * `ON CONFLICT DO NOTHING` covers a caller (like `releaseWaitlistOffer`) that already has a row.
   */
  private async becomeWaitlistEligible(entryId: string, err: unknown): Promise<never> {
    const quotaPoolId =
      err instanceof RepositoryError && err.code === 'QUOTA_FULL'
        ? err.fields?.quotaPoolId
        : undefined;
    if (quotaPoolId) {
      await this.pool.query(
        `INSERT INTO core.waitlist_entry (quota_pool_id, entry_id, status)
         VALUES ($1, $2, 'eligible')
         ON CONFLICT (quota_pool_id, entry_id) DO NOTHING`,
        [quotaPoolId, entryId],
      );
    }
    throw err;
  }

  async updateEvidenceStatus(input: EvidenceInput): Promise<RegistrationEntry> {
    return this.runInTransaction(async (tx) => {
      const entry = await this.ownedEntry(tx, input.registrationEntryId, input.actorId, true);
      const product = await this.product(tx, entry.sport_entry_product_id, entry.event_id);
      if (!product.requires_evidence) {
        throw new RepositoryError({
          code: 'EVIDENCE_NOT_REQUIRED',
          message: 'This entry does not require evidence.',
        });
      }
      if (!['required', 'pending_review', 'approved', 'rejected'].includes(input.evidenceStatus)) {
        throw new RepositoryError({
          code: 'VALIDATION_ERROR',
          message: 'Invalid evidence status.',
        });
      }

      await tx.query(
        `UPDATE core.registration_entry
            SET evidence_status = $2, updated_at = now()
          WHERE id = $1`,
        [entry.id, input.evidenceStatus],
      );
      const toStatus = input.evidenceStatus === 'approved' ? 'pending_payment' : 'pending_evidence';
      await this.writeStatus(
        tx,
        entry.id,
        toStatus,
        'system',
        null,
        input.evidenceStatus === 'approved' ? 'evidence_approved' : 'evidence_rejected',
      );
      await tx.query(
        `UPDATE core.registration_order o
            SET status = $2
           FROM core.order_line ol
          WHERE ol.order_id = o.id AND ol.entry_id = $1 AND o.status <> 'paid'`,
        [entry.id, input.evidenceStatus === 'approved' ? 'pending_payment' : 'draft'],
      );
      return this.hydratedEntry(tx, entry.id);
    });
  }

  async joinWaitlist(input: WaitlistInput): Promise<WaitlistActionResponse> {
    return this.localWaitlist(input, 'join', async (tx, waitlist, entry) => {
      const pool = await this.lockOnePool(tx, waitlist.quota_pool_id);
      if (pool.capacity - pool.confirmed - pool.reserved > 0) {
        throw new RepositoryError({
          code: 'QUOTA_AVAILABLE',
          message: 'A place is available; continue to checkout.',
        });
      }
      if (waitlist.status !== 'eligible' && waitlist.status !== 'expired') {
        throw new RepositoryError({
          code: 'NOT_WAITLISTED',
          message: 'This entry is already in the waitlist workflow.',
        });
      }
      const position = await tx.query<{ next_position: number }>(
        `SELECT COALESCE(max(position), 0) + 1 AS next_position
           FROM core.waitlist_entry WHERE quota_pool_id = $1`,
        [waitlist.quota_pool_id],
      );
      await tx.query(
        `UPDATE core.waitlist_entry
            SET status = 'waiting', position = $2, joined_at = now(),
                offer_expires_at = NULL, updated_at = now()
          WHERE id = $1`,
        [waitlist.id, position.rows[0]?.next_position ?? 1],
      );
      await this.writeStatus(tx, entry.id, 'waitlisted', 'system', null, 'waitlist');
    });
  }

  async releaseWaitlistOffer(input: WaitlistInput): Promise<WaitlistActionResponse> {
    return this.localWaitlist(input, 'release-offer', async (tx, waitlist, entry) => {
      if (waitlist.status === 'offered') return;
      if (waitlist.status !== 'waiting' && waitlist.status !== 'expired') {
        throw new RepositoryError({
          code: 'NOT_WAITLISTED',
          message: 'Join the waitlist before an offer is released.',
        });
      }

      // Issuing an offer owns a real reservation. Every applicable pool is claimed through
      // the same ordered path as a normal entry; there is no counter-only waitlist shortcut.
      await this.claimQuotaForEntry(tx, entry.id);
      await tx.query(
        `UPDATE core.waitlist_entry
            SET status = 'offered', offer_expires_at = now() + interval '20 seconds',
                updated_at = now()
          WHERE id = $1`,
        [waitlist.id],
      );
    });
  }

  async expireWaitlistOffer(input: WaitlistInput): Promise<WaitlistActionResponse> {
    return this.localWaitlist(input, 'expire-offer', async (tx, waitlist, entry) => {
      if (waitlist.status !== 'offered') {
        throw new RepositoryError({
          code: 'OFFER_NOT_ACTIVE',
          message: 'This waitlist offer is not active.',
        });
      }
      await this.releaseQuota(tx, entry.id);
      await tx.query(
        `UPDATE core.waitlist_entry
            SET status = 'expired', offer_expires_at = NULL, updated_at = now()
          WHERE id = $1`,
        [waitlist.id],
      );
    });
  }

  async claimWaitlistOffer(input: WaitlistInput): Promise<WaitlistActionResponse> {
    return this.localWaitlist(input, 'claim-offer', async (tx, waitlist, entry) => {
      if (waitlist.status === 'claimed') return;
      if (waitlist.status !== 'offered') {
        throw new RepositoryError({
          code: 'OFFER_NOT_ACTIVE',
          message: 'This waitlist offer is not active.',
        });
      }
      if (!waitlist.offer_expires_at || toDate(waitlist.offer_expires_at).getTime() <= Date.now()) {
        throw new RepositoryError({ code: 'OFFER_EXPIRED', message: 'This offer has expired.' });
      }

      // Re-enters the common claim path. It preserves the reservation made for this offer,
      // and claims any newly applicable parent pool before the entry can proceed.
      await this.claimQuotaForEntry(tx, entry.id);
      await tx.query(
        `UPDATE core.waitlist_entry
            SET status = 'claimed', offer_expires_at = NULL, updated_at = now()
          WHERE id = $1`,
        [waitlist.id],
      );

      // An entry that reached the waitlist on its very first save never got past QUOTA_FULL —
      // `saveEntryTx` throws before it ever reaches its own `upsertOrder` call, so there is no
      // order row for the blind UPDATE this used to do to find. Checkout needs a real order
      // regardless of which path got the entry here, so this claims one the same way a normal
      // save does rather than assuming one already exists.
      //
      // Deliberately NOT re-deriving the category here if it is still unset. That rollback also
      // undoes `saveEntryTx`'s category/roster-version write, and `deriveCategory` needs the
      // roster-version resolution that write owns — persisting it correctly means keeping
      // `current_roster_version_id` and `current_category_id` in lock-step, which duplicating
      // half the logic here risks getting wrong in a way that would not show up until an audit
      // trail disagreed with a screen. `this.fee` below already refuses cleanly
      // (FEE_NOT_CONFIGURED) when a category-specific price is needed and none is on the entry;
      // a category-agnostic product's flat fee still resolves as normal. The category/roster
      // persistence unification belongs in its own reviewed change, not improvised here.
      //
      // Evidence-gated products stay out of scope here too — the only legal transition out of
      // `waitlisted` is to `pending_payment` (`core.entry_status_transition`); routing a claim
      // to `pending_evidence` would need a new transition row, a deliberate product decision
      // this fix should not make unilaterally.
      const product = await this.product(tx, entry.sport_entry_product_id, entry.event_id);
      const evidenceRequired = await this.evidenceIsRequired(tx, product, entry.sport_id);
      if (evidenceRequired) {
        throw new RepositoryError({
          code: 'EVIDENCE_NOT_REQUIRED',
          message:
            'This product needs evidence review, which the waitlist claim path does not support yet.',
        });
      }
      const fee = await this.fee(tx, product.id, entry.grade, entry.current_category_id ?? undefined);
      await this.upsertOrder(tx, entry.id, entry.event_id, input.actorId, fee, false);

      await this.writeStatus(tx, entry.id, 'pending_payment', 'system', null, 'offer_claimed');
    });
  }

  async transitionEntryStatus(input: TransitionInput): Promise<RegistrationEntry> {
    const result = await this.idempotency
      .execute(
        {
          scope: input.scope,
          key: input.idempotencyKey,
          endpoint: `POST /v1/registration-entries/${input.registrationEntryId}/status`,
          body: { toStatus: input.toStatus, actor: input.actor, reason: input.reason },
          mode: 'local',
        },
        async (tx) => {
          const entry = await this.ownedEntry(
            tx,
            input.registrationEntryId,
            input.actorId,
            input.requireOwner,
          );

          if (input.toStatus === 'confirmed' && entry.status !== 'confirmed') {
            await this.claimQuotaForEntry(tx, entry.id);
          }
          await this.writeStatus(
            tx,
            entry.id,
            input.toStatus,
            input.actor,
            input.actor === 'system' ? null : input.actorId,
            input.reason,
          );

          if (['cancelled', 'withdrawn', 'substituted', 'disqualified'].includes(input.toStatus)) {
            await this.releaseQuota(tx, entry.id);
          }
          if (input.toStatus === 'cancelled' || input.toStatus === 'withdrawn') {
            // A team or corporate order carries several entries. Cancelling one athlete must not
            // cancel the order the rest of the team is still paying on; only the last live entry does.
            await tx.query(
              `UPDATE core.registration_order o SET status = 'cancelled'
              FROM core.order_line ol
             WHERE ol.order_id = o.id AND ol.entry_id = $1 AND o.status <> 'paid'
               AND NOT EXISTS (
                 SELECT 1
                   FROM core.order_line other
                   JOIN core.registration_entry live ON live.id = other.entry_id
                  WHERE other.order_id = o.id
                    AND other.entry_id <> $1
                    AND live.status NOT IN ('cancelled','withdrawn','substituted','disqualified')
               )`,
              [entry.id],
            );
          }
          return { status: 200, body: await this.hydratedEntry(tx, entry.id) };
        },
      )
      .catch((err) => this.becomeWaitlistEligible(input.registrationEntryId, err));
    return result.body as RegistrationEntry;
  }

  async payOrder(input: PaymentInput): Promise<PayOrderResponse> {
    const endpoint = `POST /v1/orders/${input.orderId}/payments`;
    const hashBody = {
      method: input.method,
      simulateFirstAttemptTimeout: input.simulateFirstAttemptTimeout,
    };

    // Validation before an EXTERNAL key is claimed avoids permanently in-progress keys for
    // ordinary 4xx requests. A replay skips this state check and reads the committed result.
    const existingKey = await this.pool.query(
      `SELECT 1 FROM core.idempotency_key WHERE scope = $1 AND key = $2`,
      [input.scope, input.idempotencyKey],
    );
    if (!existingKey.rows[0]) await this.preflightPayment(input);

    const executed = await this.idempotency.execute(
      {
        scope: input.scope,
        key: input.idempotencyKey,
        endpoint,
        body: hashBody,
        mode: 'external',
      },
      async () => {
        const prepared = await this.runInTransaction((tx) => this.preparePayment(tx, input));
        const charge = await this.payments.charge({
          orderId: input.orderId,
          amountMinor: prepared.amountMinor,
          currency: prepared.currency,
          method: input.method,
          // Provider keys are account-global; include the authenticated scope so two people
          // using the same client-generated key cannot collide at the PSP.
          idempotencyKey: `${input.scope}:${input.idempotencyKey}`,
          simulateFirstAttemptTimeout: input.simulateFirstAttemptTimeout,
        });
        const body = await this.runInTransaction((tx) =>
          this.finishPayment(tx, input, prepared.intentId, charge),
        );
        return { status: 200, body };
      },
    );

    // An idempotent replay is the same HTTP operation, so return the stored body verbatim.
    // Adding replay-only fields here makes retries observably different and defeats clients
    // that compare a recovered response with the response whose connection was lost.
    return executed.body as PayOrderResponse;
  }

  /**
   * Resolve and reserve every pool consumed by an entry. Exported as a public method so the
   * lock-order integration test can observe the real transaction rather than a reimplementation.
   */
  async claimQuotaForEntry(tx: Queryable, entryId: string): Promise<PoolRow[]> {
    const discovered = await tx.query<{ id: string }>(
      `WITH RECURSIVE direct_pool AS (
         SELECT q.id, q.parent_pool_id
           FROM core.registration_entry e
           JOIN core.sport_entry_product p ON p.id = e.sport_entry_product_id
           JOIN core.sport s ON s.id = p.sport_id
           JOIN core.quota_pool q ON q.event_id = e.event_id
          WHERE e.id = $1
            AND q.allocation = 'general'
            AND (
              (q.scope_kind = 'event' AND (q.scope_ref IS NULL OR q.scope_ref = e.event_id::text))
              OR (q.scope_kind = 'sport' AND q.scope_ref IN (p.sport_id::text, s.code))
              OR (q.scope_kind = 'discipline' AND q.scope_ref = p.discipline)
              OR (q.scope_kind = 'product' AND q.scope_ref = p.id::text)
              OR (q.scope_kind = 'category' AND q.scope_ref = e.current_category_id)
            )
       ), applicable AS (
         SELECT id, parent_pool_id FROM direct_pool
         UNION
         SELECT parent.id, parent.parent_pool_id
           FROM core.quota_pool parent
           JOIN applicable child ON child.parent_pool_id = parent.id
       )
       SELECT id FROM applicable`,
      [entryId],
    );
    const ids = lockOrder(discovered.rows.map((row) => row.id));
    if (ids.length === 0) {
      throw notFound('QUOTA_NOT_FOUND', 'No quota is configured for this entry.');
    }

    // ORDER BY id is the deadlock-avoidance rule. `lockOrder` fixes the input as well, so
    // tests and alternate query adapters cannot accidentally reintroduce discovery order.
    const locked = await tx.query<PoolRow>(
      `SELECT id, event_id, name, scope_kind, scope_ref, allocation, parent_pool_id,
              unit, capacity, confirmed, reserved, release_from, release_until, updated_at
         FROM core.quota_pool
        WHERE id = ANY($1::uuid[])
        ORDER BY id
        FOR UPDATE`,
      [ids],
    );
    if (locked.rows.length !== ids.length) {
      throw notFound('QUOTA_NOT_FOUND', 'A quota used by this entry no longer exists.');
    }

    const held = await tx.query<{ quota_pool_id: string; units: number; state: string }>(
      `SELECT quota_pool_id, units, state
         FROM core.entry_quota_consumption
        WHERE entry_id = $1 AND quota_pool_id = ANY($2::uuid[])`,
      [entryId, ids],
    );
    const byPool = new Map(held.rows.map((row) => [row.quota_pool_id, row]));
    const now = Date.now();

    for (const pool of locked.rows) {
      const existing = byPool.get(pool.id);
      if (existing && existing.state !== 'released') continue;
      const units = existing?.units ?? 1;
      if (pool.capacity - pool.confirmed - pool.reserved < units) {
        // REG-09: capacity genuinely exhausted, not just release-timed out — this is the one
        // case the waitlist exists for. The pool id travels on the error (not written here —
        // `tx` still holds this row FOR UPDATE, and a second connection trying to write a row
        // that references the still-locked entry would just wait on `tx` to finish, which is
        // waiting on it: a real deadlock, proven by a hung test before this comment existed).
        // The public entry points below do the actual write once `tx` has rolled back.
        throw QUOTA_FULL(pool.id);
      }
      if (
        (pool.release_from && toDate(pool.release_from).getTime() > now) ||
        (pool.release_until && toDate(pool.release_until).getTime() <= now)
      ) {
        throw QUOTA_FULL();
      }

      // The check above is the friendly common path. quota_not_exceeded is still the final
      // word if another writer or a future units calculation is wrong.
      await tx.query(
        `UPDATE core.quota_pool
            SET reserved = reserved + $2, updated_at = now()
          WHERE id = $1`,
        [pool.id, units],
      );
      await tx.query(
        `INSERT INTO core.entry_quota_consumption
           (entry_id, quota_pool_id, units, state, expires_at)
         VALUES ($1, $2, $3, 'reserved', now() + interval '30 minutes')
         ON CONFLICT (entry_id, quota_pool_id) DO UPDATE
           SET units = EXCLUDED.units, state = 'reserved', expires_at = EXCLUDED.expires_at`,
        [entryId, pool.id, units],
      );
    }

    const refreshed = await tx.query<PoolRow>(
      `SELECT id, event_id, name, scope_kind, scope_ref, allocation, parent_pool_id,
              unit, capacity, confirmed, reserved, release_from, release_until, updated_at
         FROM core.quota_pool WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [ids],
    );
    return refreshed.rows;
  }

  private async saveEntryTx(tx: Queryable, input: SaveEntryInput): Promise<EntryDecision> {
    const entry = await this.ownedEntry(tx, input.registrationEntryId, input.actorId, true);
    await this.assertEntryConfigurable(tx, entry.id);
    const product = await this.product(tx, input.sportEntryProductId, entry.event_id);
    if (!product.allowed_grades.includes(input.grade)) {
      throw new RepositoryError({
        code: 'VALIDATION_ERROR',
        message: 'This grade is not available for the selected product.',
        fields: { grade: 'Select an available competition grade.' },
      });
    }

    const isTeam = ['team', 'crew', 'relay'].includes(product.participant_type);
    if (!isTeam && product.partner_required && !input.partnerAthleteId) {
      throw new RepositoryError({
        code: 'PARTNER_REQUIRED',
        message: 'A partner is required for this entry.',
        fields: { partnerAthleteId: 'Choose a partner.' },
      });
    }
    if (isTeam && (!input.teamRosterId || !input.rosterMemberIds?.length)) {
      throw new RepositoryError({
        code: 'ROSTER_REQUIRED',
        message: 'Complete the team roster first.',
      });
    }

    if (entry.status !== 'draft') {
      await this.writeStatus(tx, entry.id, 'draft', 'system', null, 'reconfigure');
    }
    await this.releaseQuota(tx, entry.id);

    const ruleVersionId = await this.ruleVersion(
      tx,
      product.rule_set_id,
      entry.sport_entry_product_id === product.id ? entry.rule_version_id : undefined,
    );
    const category = await this.deriveCategory(tx, entry, product, ruleVersionId, input);
    const partnerId = input.partnerAthleteId
      ? await this.profileId(tx, input.partnerAthleteId, entry.event_id, 'Partner')
      : null;
    if (input.teamRosterId) {
      if (isTeam && entry.team_roster_id !== input.teamRosterId) {
        throw notFound('TEAM_ROSTER_NOT_FOUND', 'Team roster was not found.');
      }
      await this.assertRoster(
        tx,
        input.teamRosterId,
        product.id,
        entry.event_id,
        input.rosterMemberIds ?? [],
      );
    }

    const oldCategory = entry.current_category_id;
    const evidenceRequired = await this.evidenceIsRequired(tx, product, product.sport_id);
    await tx.query(
      `UPDATE core.registration_entry
          SET sport_entry_product_id = $2,
              partner_profile_id = $3,
              grade = $4,
              rule_version_id = $5,
              original_category_id = COALESCE(original_category_id, $6),
              original_category_name = COALESCE(original_category_name, $7),
              current_category_id = $6,
              current_category_name = $7,
              category_change_reason = CASE WHEN current_category_id IS DISTINCT FROM $6
                                            THEN 'registration.reconfigured' ELSE NULL END,
              team_roster_id = $8,
              evidence_status = $9,
              updated_at = now()
        WHERE id = $1`,
      [
        entry.id,
        product.id,
        isTeam ? null : partnerId,
        input.grade,
        ruleVersionId,
        category.id ?? null,
        category.name ?? null,
        isTeam ? input.teamRosterId : null,
        evidenceRequired ? 'required' : 'not_required',
      ],
    );
    if (oldCategory && category.id && oldCategory !== category.id) {
      await tx.query(
        `INSERT INTO core.category_audit
           (entry_id, from_category, to_category, trigger, member_ages, reason)
         VALUES ($1, $2, $3, 'registration_reconfigured', $4::jsonb, 'registration.reconfigured')`,
        [entry.id, oldCategory, category.id, JSON.stringify(category.memberAges)],
      );
    }

    const pools = await this.claimQuotaForEntry(tx, entry.id);
    const fee = await this.fee(tx, product.id, input.grade, category.id);
    const needsEvidence = evidenceRequired;
    const order = await this.upsertOrder(
      tx,
      entry.id,
      entry.event_id,
      input.actorId,
      fee,
      needsEvidence,
    );
    const target: JourneyEntryStatus = needsEvidence ? 'pending_evidence' : 'pending_payment';
    await this.writeStatus(
      tx,
      entry.id,
      target,
      'system',
      null,
      needsEvidence ? 'submit_evidence' : 'submit',
    );

    await tx.query(
      `UPDATE core.waitlist_entry
          SET status = 'eligible', position = NULL, joined_at = NULL,
              offer_expires_at = NULL, updated_at = now()
        WHERE entry_id = $1 AND status <> 'claimed'`,
      [entry.id],
    );

    const binding = [...pools].sort(
      (a, b) => a.capacity - a.confirmed - a.reserved - (b.capacity - b.confirmed - b.reserved),
    )[0];
    if (!binding) throw notFound('QUOTA_NOT_FOUND', 'No quota is configured for this entry.');
    return {
      entry: await this.hydratedEntry(tx, entry.id),
      quota: projectPool(binding, product.id),
      order,
      nextStep: needsEvidence ? 'evidence' : 'checkout',
    };
  }

  private async localWaitlist(
    input: WaitlistInput,
    action: string,
    work: (tx: Queryable, waitlist: WaitlistRow, entry: EntryRow) => Promise<void>,
  ): Promise<WaitlistActionResponse> {
    const result = await this.idempotency.execute(
      {
        scope: input.scope,
        key: input.idempotencyKey,
        endpoint: `POST /v1/waitlists/${input.waitlistId}/${action}`,
        body: {},
        mode: 'local',
      },
      async (tx) => {
        const waitlist = await this.waitlist(tx, input.waitlistId, true);
        const entry = await this.ownedEntry(
          tx,
          waitlist.entry_id,
          input.actorId,
          input.requireOwner,
        );
        await work(tx, waitlist, entry);
        return { status: 200, body: await this.waitlistResponse(tx, waitlist.id) };
      },
    );
    return result.body as WaitlistActionResponse;
  }

  private async releaseQuota(tx: Queryable, entryId: string): Promise<void> {
    const consumptions = await tx.query<{ quota_pool_id: string; units: number; state: string }>(
      `SELECT quota_pool_id, units, state
         FROM core.entry_quota_consumption
        WHERE entry_id = $1 AND state <> 'released'`,
      [entryId],
    );
    const ids = lockOrder(consumptions.rows.map((row) => row.quota_pool_id));
    if (!ids.length) return;
    await tx.query(
      `SELECT id FROM core.quota_pool WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
      [ids],
    );
    for (const id of ids) {
      const consumption = consumptions.rows.find((row) => row.quota_pool_id === id);
      if (!consumption) continue;
      await tx.query(
        `UPDATE core.quota_pool
            SET reserved = reserved - CASE WHEN $2 = 'reserved' THEN $3 ELSE 0 END,
                confirmed = confirmed - CASE WHEN $2 = 'confirmed' THEN $3 ELSE 0 END,
                updated_at = now()
          WHERE id = $1`,
        [id, consumption.state, consumption.units],
      );
    }
    await tx.query(
      `UPDATE core.entry_quota_consumption
          SET state = 'released', expires_at = NULL
        WHERE entry_id = $1 AND state <> 'released'`,
      [entryId],
    );
  }

  private async confirmQuota(tx: Queryable, entryId: string): Promise<void> {
    const reserved = await tx.query<{ quota_pool_id: string; units: number }>(
      `SELECT quota_pool_id, units FROM core.entry_quota_consumption
        WHERE entry_id = $1 AND state = 'reserved'`,
      [entryId],
    );
    const ids = lockOrder(reserved.rows.map((row) => row.quota_pool_id));
    if (!ids.length) return;
    await tx.query(
      `SELECT id FROM core.quota_pool WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
      [ids],
    );
    for (const id of ids) {
      const units = reserved.rows.find((row) => row.quota_pool_id === id)?.units ?? 0;
      await tx.query(
        `UPDATE core.quota_pool
            SET reserved = reserved - $2, confirmed = confirmed + $2, updated_at = now()
          WHERE id = $1`,
        [id, units],
      );
    }
    await tx.query(
      `UPDATE core.entry_quota_consumption
          SET state = 'confirmed', expires_at = NULL
        WHERE entry_id = $1 AND state = 'reserved'`,
      [entryId],
    );
  }

  private async writeStatus(
    tx: Queryable,
    entryId: string,
    toStatus: JourneyEntryStatus,
    actor: 'participant' | 'admin' | 'system',
    actorId: string | null,
    reason?: string | null,
  ): Promise<void> {
    const current = await tx.query<{ status: string }>(
      `SELECT status FROM core.registration_entry WHERE id = $1 FOR UPDATE`,
      [entryId],
    );
    const from = current.rows[0]?.status;
    if (!from)
      throw notFound('REGISTRATION_ENTRY_NOT_FOUND', 'No registration entry for this participant.');
    if (from === toStatus) return;

    // There is one writer: event first (the DB trigger decides legality), row second, same
    // transaction. No TypeScript lifecycle check can accidentally become a second policy.
    await tx.query(
      `INSERT INTO core.entry_status_event
         (entry_id, from_status, to_status, actor_kind, actor_id, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entryId, from, toStatus, actor, actorId, reason ?? null],
    );
    await tx.query(
      `UPDATE core.registration_entry SET status = $2, updated_at = now() WHERE id = $1`,
      [entryId, toStatus],
    );
  }

  private async ownedEntry(
    tx: Queryable,
    entryId: string,
    actorId: string,
    requireOwner: boolean,
  ): Promise<EntryRow> {
    const result = await tx.query<EntryRow>(
      `${ENTRY_SELECT}
        JOIN core.athlete_profile ap ON ap.id = e.athlete_profile_id
       WHERE e.id = $1 AND ($3::boolean = false OR ap.person_id = $2)
       FOR UPDATE OF e`,
      [entryId, actorId, requireOwner],
    );
    const row = result.rows[0];
    if (!row)
      throw notFound('REGISTRATION_ENTRY_NOT_FOUND', 'No registration entry for this participant.');
    return row;
  }

  private async hydratedEntry(tx: Queryable, entryId: string): Promise<RegistrationEntry> {
    const result = await tx.query<EntryRow>(`${ENTRY_SELECT} WHERE e.id = $1`, [entryId]);
    const row = result.rows[0];
    if (!row)
      throw notFound('REGISTRATION_ENTRY_NOT_FOUND', 'No registration entry for this participant.');
    const history = await tx.query<{
      to_status: string;
      actor_kind: string;
      reason: string | null;
      occurred_at: Date;
    }>(
      `SELECT to_status, actor_kind, reason, occurred_at
         FROM core.entry_status_event WHERE entry_id = $1 ORDER BY occurred_at, id`,
      [entryId],
    );
    return {
      id: row.id,
      athleteId: row.athlete_profile_id,
      eventId: row.event_id,
      sportId: row.sport_id,
      sportEntryProductId: row.sport_entry_product_id,
      partnerAthleteId: row.partner_profile_id ?? undefined,
      grade: row.grade as RegistrationEntry['grade'],
      ruleId: row.rule_version_id,
      ruleVersion: row.rule_version_id,
      originalCategoryId: row.original_category_id ?? undefined,
      originalCategoryName: row.original_category_name ?? undefined,
      currentCategoryId: row.current_category_id ?? undefined,
      currentCategoryName: row.current_category_name ?? undefined,
      categoryChangeReason: row.category_change_reason ?? undefined,
      teamRosterId: row.team_roster_id ?? undefined,
      evidenceStatus: row.evidence_status as RegistrationEntry['evidenceStatus'],
      status: row.status as JourneyEntryStatus,
      statusHistory: history.rows.map((item) => ({
        status: item.to_status as JourneyEntryStatus,
        actor: item.actor_kind as 'participant' | 'admin' | 'system',
        reason: item.reason ?? undefined,
        occurredAt: toDate(item.occurred_at).toISOString(),
      })),
      orderId: row.order_id ?? undefined,
      waitlistId: row.waitlist_id ?? undefined,
      createdAt: toDate(row.created_at).toISOString(),
      updatedAt: toDate(row.updated_at).toISOString(),
    };
  }

  private async product(tx: Queryable, productId: string, eventId: string): Promise<ProductRow> {
    const result = await tx.query<ProductRow>(
      `SELECT id, event_id, sport_id, participant_type, rule_set_id, allowed_grades,
              partner_required, requires_evidence
         FROM core.sport_entry_product WHERE id = $1 AND event_id = $2`,
      [productId, eventId],
    );
    const row = result.rows[0];
    if (!row) throw notFound('SPORT_ENTRY_PRODUCT_NOT_FOUND', 'Sport entry product was not found.');
    return row;
  }

  private async profileId(
    tx: Queryable,
    profileOrPersonId: string,
    eventId: string,
    label: string,
  ): Promise<string> {
    const result = await tx.query<{ id: string }>(
      `SELECT ap.id FROM core.athlete_profile ap
        WHERE ap.event_id = $2 AND (ap.id = $1 OR ap.person_id = $1)`,
      [profileOrPersonId, eventId],
    );
    const row = result.rows[0];
    if (!row) throw notFound(`${label.toUpperCase()}_NOT_FOUND`, `${label} was not found.`);
    return row.id;
  }

  private async ruleVersion(tx: Queryable, ruleSetId: string, pinned?: string): Promise<string> {
    const result = await tx.query<{ id: string }>(
      `SELECT id FROM core.rule_version
        WHERE rule_set_id = $1 AND ($2::uuid IS NULL OR id = $2)
        ORDER BY (status = 'active' AND effective @> now()) DESC, version_no DESC
        LIMIT 1`,
      [ruleSetId, pinned ?? null],
    );
    const row = result.rows[0];
    if (!row) throw notFound('SPORT_RULE_NOT_FOUND', 'Sport rule was not found.');
    return row.id;
  }

  private async assertRoster(
    tx: Queryable,
    rosterId: string,
    productId: string,
    eventId: string,
    memberIds: string[],
  ): Promise<void> {
    const roster = await tx.query<{ id: string }>(
      `SELECT id FROM core.team_roster
        WHERE id = $1 AND event_id = $2 AND sport_entry_product_id = $3`,
      [rosterId, eventId, productId],
    );
    if (!roster.rows[0]) throw notFound('TEAM_ROSTER_NOT_FOUND', 'Team roster was not found.');
    const members = await tx.query<{ id: string }>(
      `SELECT id FROM core.roster_member WHERE roster_id = $1 AND id = ANY($2::uuid[])`,
      [rosterId, memberIds],
    );
    if (members.rows.length !== new Set(memberIds).size) {
      throw notFound('ROSTER_MEMBER_NOT_FOUND', 'A selected roster member was not found.');
    }
  }

  /** Start-list snapshots are immutable beyond draft, including participant reconfiguration. */
  private async assertEntryConfigurable(tx: Queryable, entryId: string): Promise<void> {
    const listed = await tx.query<{ id: string }>(
      `SELECT line.id
         FROM core.start_list_entry line
         JOIN core.start_list list ON list.id = line.start_list_id
        WHERE line.registration_entry_id = $1 AND list.status <> 'draft'
        LIMIT 1`,
      [entryId],
    );
    if (listed.rows[0]) {
      throw new RepositoryError({
        code: 'START_LIST_NOT_DRAFT',
        message: 'competition.start_list.not_draft',
      });
    }
  }

  /**
   * The product flag alone is not enough to gate an entry. A product can say "evidence required"
   * while no requirement set applies to its sport — and then the athlete sits in
   * `pending_evidence` with nothing on screen to satisfy, forever. That happened to swimming.
   *
   * So the gate is the flag AND at least one applicable requirement, ordinary or restricted.
   */
  private async evidenceIsRequired(
    tx: Queryable,
    product: ProductRow,
    sportId: string,
  ): Promise<boolean> {
    if (!product.requires_evidence) return false;
    const { rows } = await tx.query<{ count: string }>(
      `SELECT (
                (SELECT count(*) FROM core.evidence_requirements_for($1, $2, $3))
                + (SELECT count(*)
                     FROM core.evidence_requirement_version rv
                     JOIN core.evidence_requirement_set rs ON rs.id = rv.requirement_set_id
                    WHERE rs.event_id = $1
                      AND rs.classification = 'restricted'
                      AND rv.status = 'active'
                      AND (
                        NOT EXISTS (SELECT 1 FROM core.evidence_requirement_applicability a
                                     WHERE a.requirement_version_id = rv.id)
                        OR EXISTS (SELECT 1 FROM core.evidence_requirement_applicability a
                                    WHERE a.requirement_version_id = rv.id
                                      AND (a.sport_id IS NULL OR a.sport_id = $2)
                                      AND (a.sport_entry_product_id IS NULL
                                           OR a.sport_entry_product_id = $3))
                      ))
              )::text AS count`,
      [product.event_id, sportId, product.id],
    );
    return Number(rows[0]?.count ?? '0') > 0;
  }

  private async deriveCategory(
    tx: Queryable,
    entry: EntryRow,
    product: ProductRow,
    ruleVersionId: string,
    input: SaveEntryInput,
  ): Promise<CategoryResult> {
    let members: Array<{
      id: string;
      personId: string;
      name: string;
      dob: string;
      role: string | null;
    }>;
    if (['team', 'crew', 'relay'].includes(product.participant_type)) {
      const rows = await tx.query<{
        membership_id: string | null;
        person_id: string;
        display_name: string;
        date_of_birth: Date | string;
        role: string | null;
      }>(
        `SELECT selection.membership_id, selection.person_id, selection.display_name,
                selection.date_of_birth, selection.role
           FROM core.roster_selection selection
           JOIN core.roster_version version ON version.id = selection.roster_version_id
          WHERE version.id = COALESCE(
            (SELECT current_roster_version_id FROM core.registration_entry WHERE id = $1),
            (SELECT id FROM core.roster_version
              WHERE team_id = $2 AND status = 'draft' ORDER BY version_no DESC LIMIT 1)
          )
            AND selection.competes
          ORDER BY selection.position`,
        [entry.id, input.teamRosterId],
      );
      if (rows.rows.length === 0) {
        throw new RepositoryError({
          code: 'ROSTER_REQUIRED',
          message: 'Complete the team roster first.',
        });
      }
      members = rows.rows.map((row) => ({
        id: row.membership_id ?? row.person_id,
        personId: row.person_id,
        name: row.display_name,
        dob: toDate(row.date_of_birth).toISOString().slice(0, 10),
        role: row.role,
      }));
    } else {
      const profileIds = [entry.athlete_profile_id];
      if (product.partner_required && input.partnerAthleteId) {
        profileIds.push(
          await this.profileId(tx, input.partnerAthleteId, entry.event_id, 'Partner'),
        );
      }
      const rows = await tx.query<{
        id: string;
        person_id: string;
        given_name: string;
        family_name: string;
        date_of_birth: Date | string;
      }>(
        `SELECT ap.id, p.id AS person_id, p.given_name, p.family_name, p.date_of_birth
           FROM core.athlete_profile ap JOIN core.person p ON p.id = ap.person_id
          WHERE ap.id = ANY($1::uuid[])`,
        [profileIds],
      );
      members = rows.rows.map((row) => ({
        id: row.id,
        personId: row.person_id,
        name: `${row.given_name} ${row.family_name}`,
        dob: toDate(row.date_of_birth).toISOString().slice(0, 10),
        role: null,
      }));
    }
    const derived = await deriveEntryCategory(tx, {
      ruleVersionId,
      eventId: entry.event_id,
      members,
    });
    // Older events with no configured dimensions still use their product-level fee.  There is
    // no category math to duplicate in that case; preserve the pre-existing unbanded entry
    // behaviour until the OC publishes a rule dimension.
    if (derived.derivation.dimensions.length === 0) {
      return product.id === entry.sport_entry_product_id
        ? {
            id: entry.current_category_id ?? undefined,
            name: entry.current_category_name ?? undefined,
            memberAges: [],
          }
        : { memberAges: [] };
    }
    if (!derived.id || !derived.name || derived.derivation.blockedBy.length > 0) {
      throw new RepositoryError({
        code: 'CATEGORY_NOT_ELIGIBLE',
        message:
          derived.derivation.blockedBy[0]?.messageKey ?? 'registration.category.not_eligible',
        fields: {
          blockedBy: derived.derivation.blockedBy.map((item) => item.messageKey).join(','),
        },
      });
    }
    return { id: derived.id, name: derived.name, memberAges: derived.memberAges };
  }

  private async fee(
    tx: Queryable,
    productId: string,
    grade: string,
    categoryId?: string,
  ): Promise<{ currency: string; base: bigint; service: bigint; eventId: string }> {
    const result = await tx.query<{
      currency: string;
      base_amount_minor: string;
      service_amount_minor: string;
      event_id: string;
    }>(
      `SELECT currency, base_amount_minor::text, service_amount_minor::text, event_id
         FROM core.fee
        WHERE sport_entry_product_id = $1 AND grade = $2 AND effective @> now()
          AND (category_id = $3 OR category_id IS NULL)
        ORDER BY (category_id = $3) DESC, lower(effective) DESC
        LIMIT 1`,
      [productId, grade, categoryId ?? null],
    );
    const row = result.rows[0];
    if (!row) {
      throw new RepositoryError({
        code: 'FEE_NOT_CONFIGURED',
        message: 'No active fee is configured for this grade and category.',
      });
    }
    return {
      currency: row.currency,
      base: BigInt(row.base_amount_minor),
      service: BigInt(row.service_amount_minor),
      eventId: row.event_id,
    };
  }

  private async upsertOrder(
    tx: Queryable,
    entryId: string,
    eventId: string,
    payerId: string,
    fee: { currency: string; base: bigint; service: bigint },
    evidenceRequired: boolean,
  ): Promise<RegistrationOrder> {
    const existing = await tx.query<{ id: string; status: string }>(
      `SELECT o.id, o.status
         FROM core.registration_order o JOIN core.order_line ol ON ol.order_id = o.id
        WHERE ol.entry_id = $1 ORDER BY o.created_at DESC LIMIT 1 FOR UPDATE OF o`,
      [entryId],
    );
    let orderId = existing.rows[0]?.id;
    if (existing.rows[0]?.status === 'paid') {
      throw new RepositoryError({
        code: 'PAID_ORDER_CONFLICT',
        message: 'A paid order cannot be reconfigured.',
      });
    }
    if (!orderId) {
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO core.registration_order
           (event_id, payer_person_id, kind, status, currency)
         VALUES ($1, $2, 'individual', $3, $4) RETURNING id`,
        [eventId, payerId, evidenceRequired ? 'draft' : 'pending_payment', fee.currency],
      );
      orderId = inserted.rows[0]?.id;
    } else {
      await tx.query(`DELETE FROM core.order_line WHERE order_id = $1 AND entry_id = $2`, [
        orderId,
        entryId,
      ]);
      await tx.query(
        `UPDATE core.registration_order SET status = $2, currency = $3 WHERE id = $1`,
        [orderId, evidenceRequired ? 'draft' : 'pending_payment', fee.currency],
      );
    }
    if (!orderId) throw new Error('Order insert did not return an id.');

    const tax = await tx.query<{ id: string; rate_bp: number; tax_code: string | null }>(
      `SELECT id, rate_bp, tax_code FROM core.tax_rule
        WHERE event_id = $1 AND status = 'active' AND effective @> now()
        ORDER BY rate_bp DESC, id LIMIT 1`,
      [eventId],
    );
    const rule = tax.rows[0];
    await this.insertOrderLine(tx, orderId, entryId, 'entry_fee', fee.base, rule);
    if (fee.service > 0n) {
      await this.insertOrderLine(tx, orderId, entryId, 'add_on', fee.service, rule);
    }
    return this.order(tx, orderId);
  }

  private async insertOrderLine(
    tx: Queryable,
    orderId: string,
    entryId: string,
    kind: 'entry_fee' | 'add_on',
    gross: bigint,
    tax?: { id: string; rate_bp: number; tax_code: string | null },
  ): Promise<void> {
    const rate = tax?.rate_bp ?? 0;
    const code = tax?.tax_code ?? (rate === 0 ? 'N1' : null);
    await tx.query(
      `INSERT INTO core.order_line
         (order_id, entry_id, kind, description, quantity, unit_net_minor,
          net_minor, tax_rate_bp, tax_minor, tax_code, tax_rule_id, gross_minor)
       SELECT $1, $2, $3, $4, 1, split.net_minor,
              split.net_minor, $6, split.tax_minor, $7, $8, $5
         FROM core.split_inclusive($5, $6) AS split`,
      [
        orderId,
        entryId,
        kind,
        kind === 'entry_fee' ? 'Registration entry fee' : 'Registration service fee',
        gross.toString(),
        rate,
        code,
        tax?.id ?? null,
      ],
    );
  }

  private async waitlist(tx: Queryable, waitlistId: string, lock: boolean): Promise<WaitlistRow> {
    const result = await tx.query<WaitlistRow>(
      `SELECT id, quota_pool_id, entry_id, status, position, offer_expires_at, joined_at, updated_at
         FROM core.waitlist_entry WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
      [waitlistId],
    );
    const row = result.rows[0];
    if (!row) throw notFound('WAITLIST_ENTRY_NOT_FOUND', 'Waitlist entry was not found.');
    return row;
  }

  private async lockOnePool(tx: Queryable, poolId: string): Promise<PoolRow> {
    const result = await tx.query<PoolRow>(
      `SELECT id, event_id, name, scope_kind, scope_ref, allocation, parent_pool_id,
              unit, capacity, confirmed, reserved, release_from, release_until, updated_at
         FROM core.quota_pool WHERE id = $1 FOR UPDATE`,
      [poolId],
    );
    const row = result.rows[0];
    if (!row) throw notFound('QUOTA_NOT_FOUND', 'Quota was not found.');
    return row;
  }

  private async waitlistResponse(
    tx: Queryable,
    waitlistId: string,
  ): Promise<WaitlistActionResponse> {
    const waitlist = await this.waitlist(tx, waitlistId, false);
    const entry = await this.hydratedEntry(tx, waitlist.entry_id);
    const pool = await this.lockOnePool(tx, waitlist.quota_pool_id);
    const order = entry.orderId ? await this.order(tx, entry.orderId) : null;
    return {
      waitlist: this.toWaitlist(waitlist, entry),
      entry,
      quota: projectPool(pool, entry.sportEntryProductId),
      order,
    };
  }

  private toWaitlist(row: WaitlistRow, entry: RegistrationEntry): WaitlistEntry {
    return {
      id: row.id,
      registrationEntryId: row.entry_id,
      quotaId: row.quota_pool_id,
      athleteId: entry.athleteId,
      status: row.status as WaitlistEntry['status'],
      position: row.position ?? undefined,
      offerExpiresAt: iso(row.offer_expires_at),
      joinedAt: iso(row.joined_at),
      updatedAt: toDate(row.updated_at).toISOString(),
    };
  }

  private async order(tx: Queryable, orderId: string): Promise<RegistrationOrder> {
    const result = await tx.query<OrderRow>(
      `SELECT o.id, o.event_id, o.payer_person_id, o.status, o.currency,
              o.net_minor::text, o.tax_minor::text, o.gross_minor::text,
              lines.subtotal_minor, lines.service_minor, lines.entry_id,
              o.created_at, COALESCE(payment.updated_at, o.created_at) AS updated_at
         FROM core.registration_order o
         LEFT JOIN LATERAL (
           SELECT COALESCE(sum(ol.gross_minor) FILTER (WHERE ol.kind = 'entry_fee'), 0)::text AS subtotal_minor,
                  COALESCE(sum(ol.gross_minor) FILTER (WHERE ol.kind = 'add_on'), 0)::text AS service_minor,
                  min(ol.entry_id::text)::uuid AS entry_id
             FROM core.order_line ol WHERE ol.order_id = o.id
         ) lines ON true
         LEFT JOIN LATERAL (
           SELECT pi.updated_at FROM core.payment_intent pi
            WHERE pi.order_id = o.id ORDER BY pi.updated_at DESC LIMIT 1
         ) payment ON true
        WHERE o.id = $1`,
      [orderId],
    );
    const row = result.rows[0];
    if (!row) throw notFound('ORDER_NOT_FOUND', 'Order was not found.');
    const payment = await tx.query<{ id: string }>(
      `SELECT id FROM core.payment_intent WHERE order_id = $1 AND status = 'settled'
        ORDER BY created_at DESC LIMIT 1`,
      [orderId],
    );
    return {
      id: row.id,
      registrationEntryId: row.entry_id ?? '',
      currency: row.currency as 'EUR',
      subtotalAmountMinor: minor(row.subtotal_minor),
      serviceAmountMinor: minor(row.service_minor),
      totalAmountMinor: minor(row.gross_minor),
      status:
        row.status === 'paid'
          ? 'paid'
          : row.status === 'cancelled'
            ? 'cancelled'
            : row.status === 'draft'
              ? 'draft'
              : 'pending_payment',
      paymentId: payment.rows[0]?.id,
      createdAt: toDate(row.created_at).toISOString(),
      updatedAt: toDate(row.updated_at).toISOString(),
    };
  }

  private async preflightPayment(input: PaymentInput): Promise<void> {
    await this.runInTransaction(async (tx) => {
      const order = await this.paymentOrder(tx, input.orderId, input.actorId, true);
      if (order.status === 'paid') {
        throw new RepositoryError({
          code: 'PAYMENT_ALREADY_CAPTURED_CONFLICT',
          message: 'This order is already paid.',
        });
      }
      if (order.status === 'cancelled' || BigInt(order.due_minor) <= 0n) {
        throw new RepositoryError({
          code: 'ORDER_NOT_PAYABLE',
          message: 'This order cannot be paid.',
        });
      }
      const statuses = await tx.query<{ status: string }>(
        `SELECT DISTINCT e.status FROM core.registration_entry e
          JOIN core.order_line ol ON ol.entry_id = e.id
         WHERE ol.order_id = $1`,
        [input.orderId],
      );
      if (statuses.rows.some((row) => row.status !== 'pending_payment')) {
        throw new RepositoryError({
          code: 'ORDER_NOT_PAYABLE',
          message: 'The entry is not ready for payment.',
        });
      }
    });
  }

  private async preparePayment(
    tx: Queryable,
    input: PaymentInput,
  ): Promise<{ intentId: string; amountMinor: bigint; currency: string }> {
    const order = await this.paymentOrder(tx, input.orderId, input.actorId, true);
    const existing = await tx.query<{ id: string; amount_minor: string; currency: string }>(
      `SELECT id, amount_minor::text, currency FROM core.payment_intent
        WHERE idempotency_scope = $1 AND idempotency_key = $2 FOR UPDATE`,
      [input.scope, input.idempotencyKey],
    );
    if (existing.rows[0]) {
      return {
        intentId: existing.rows[0].id,
        amountMinor: BigInt(existing.rows[0].amount_minor),
        currency: existing.rows[0].currency,
      };
    }
    const due = BigInt(order.due_minor);
    if (due <= 0n)
      throw new RepositoryError({
        code: 'ORDER_NOT_PAYABLE',
        message: 'This order cannot be paid.',
      });
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO core.payment_intent
         (order_id, payer_person_id, psp, status, amount_minor, currency, payment_method,
          idempotency_scope, idempotency_key, attempt_count, charge_count)
       VALUES ($1, $2, 'stub', 'pending', $3, $4, $5, $6, $7, $8, 0)
       RETURNING id`,
      [
        order.id,
        input.actorId,
        due.toString(),
        order.currency,
        input.method,
        input.scope,
        input.idempotencyKey,
        input.simulateFirstAttemptTimeout ? 2 : 1,
      ],
    );
    const intentId = inserted.rows[0]?.id;
    if (!intentId) throw new Error('Payment-intent insert did not return an id.');
    return { intentId, amountMinor: due, currency: order.currency };
  }

  private async finishPayment(
    tx: Queryable,
    input: PaymentInput,
    intentId: string,
    charge: PaymentCharge,
  ): Promise<PayOrderResponse> {
    const order = await this.paymentOrder(tx, input.orderId, input.actorId, true);
    const intent = await tx.query<{ status: string }>(
      `SELECT status FROM core.payment_intent WHERE id = $1 FOR UPDATE`,
      [intentId],
    );
    if (intent.rows[0]?.status !== 'settled') {
      await tx.query(
        `UPDATE core.payment_intent
            SET psp_intent_id = $2, charge_count = $3, updated_at = now()
          WHERE id = $1`,
        [intentId, charge.providerReference, charge.chargeCount],
      );
      // FIFO calls proportional_tax_split for every allocation; neither net nor tax is
      // recomputed in TypeScript.
      await tx.query(`SELECT core.allocate_payment_fifo($1)`, [intentId]);
      await tx.query(
        `UPDATE core.payment_intent SET status = 'settled', updated_at = now() WHERE id = $1`,
        [intentId],
      );
      await tx.query(`UPDATE core.registration_order SET status = 'paid' WHERE id = $1`, [
        order.id,
      ]);

      const entries = await tx.query<{ id: string }>(
        `SELECT e.id FROM core.registration_entry e
          WHERE EXISTS (
            SELECT 1 FROM core.order_line ol WHERE ol.entry_id = e.id AND ol.order_id = $1
          )
         ORDER BY e.id FOR UPDATE OF e`,
        [order.id],
      );
      for (const entry of entries.rows) {
        await this.confirmQuota(tx, entry.id);
        await this.writeStatus(tx, entry.id, 'confirmed', 'system', null, 'paid');
      }
    }

    const payment = await this.payment(tx, intentId);
    const entry = await this.hydratedEntry(tx, payment.registrationEntryId);
    return {
      payment,
      order: await this.order(tx, order.id),
      entry,
      duplicateChargePrevented: charge.duplicateChargePrevented,
    };
  }

  private async paymentOrder(
    tx: Queryable,
    orderId: string,
    actorId: string,
    lock: boolean,
  ): Promise<{
    id: string;
    payer_person_id: string;
    status: string;
    currency: string;
    due_minor: string;
  }> {
    if (lock) {
      const locked = await tx.query(
        `SELECT id FROM core.registration_order
          WHERE id = $1 AND payer_person_id = $2 FOR UPDATE`,
        [orderId, actorId],
      );
      if (!locked.rows[0]) throw notFound('ORDER_NOT_FOUND', 'Order was not found.');
    }
    const result = await tx.query<{
      id: string;
      payer_person_id: string;
      status: string;
      currency: string;
      due_minor: string;
    }>(
      `SELECT o.id, o.payer_person_id, o.status, o.currency,
              COALESCE(sum(GREATEST(ol.gross_minor - ol.paid_minor, 0)), 0)::text AS due_minor
         FROM core.registration_order o
         LEFT JOIN core.order_line ol ON ol.order_id = o.id
        WHERE o.id = $1 AND o.payer_person_id = $2
        GROUP BY o.id`,
      [orderId, actorId],
    );
    const row = result.rows[0];
    if (!row) throw notFound('ORDER_NOT_FOUND', 'Order was not found.');
    return row;
  }

  private async payment(tx: Queryable, intentId: string): Promise<JourneyPayment> {
    const result = await tx.query<PaymentRow>(
      `SELECT pi.id, pi.order_id, min(ol.entry_id::text)::uuid AS entry_id,
              pi.amount_minor::text, pi.currency, pi.payment_method, pi.status,
              pi.psp_intent_id, pi.idempotency_key, pi.attempt_count, pi.charge_count,
              pi.created_at, pi.updated_at
         FROM core.payment_intent pi
         LEFT JOIN core.order_line ol ON ol.order_id = pi.order_id
        WHERE pi.id = $1
        GROUP BY pi.id`,
      [intentId],
    );
    const row = result.rows[0];
    if (!row || !row.entry_id) throw notFound('PAYMENT_NOT_FOUND', 'Payment was not found.');
    return {
      id: row.id,
      orderId: row.order_id,
      registrationEntryId: row.entry_id,
      amountMinor: minor(row.amount_minor),
      currency: row.currency as 'EUR',
      method: row.payment_method as 'card',
      status:
        row.status === 'settled' ? 'captured' : row.status === 'failed' ? 'failed' : 'pending',
      providerReference: row.psp_intent_id ?? undefined,
      idempotencyKey: row.idempotency_key ?? '',
      attemptCount: row.attempt_count,
      chargeCount: row.charge_count,
      createdAt: toDate(row.created_at).toISOString(),
      updatedAt: toDate(row.updated_at).toISOString(),
    };
  }
}

// Used by focused tests and useful to reconciliation jobs without exposing pg internals.
export type RegistrationMutationQueryable = Queryable;
export type RegistrationMutationClient = PoolClient;
