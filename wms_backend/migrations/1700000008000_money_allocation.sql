-- Up Migration

-- BACKEND_DB_PLAN.md §4.6 (money), plus F04/F05 from the external tender audit.
--
-- Group orders already belong to a payer with entry links on the line. What the plan
-- does not record is whose debt a capture settles, or what a refund does to tax.
-- TEA-02 unpaid-member tracking and PAY-05/PAY-06 reconciliation both sit on that gap.
--
-- Four decisions, with the reasoning. These are constraints, not service conventions.
--
-- 1. Allocation granularity is the order_line, not a coarser member-balance table.
--    Lines are the debt unit (entry_fee vs add-on vs deposit for the same person), and
--    F05 has to reverse a particular rate/nature. A member-balance layer would mix
--    those and make a partial refund of one fee kind unanswerable. TEA-02's unpaid
--    member is then a single query over line counters: settled < due, grouped by
--    roster_member. FIFO is the default fill order when the payer does not name
--    lines; the rows are still written, because a computed-only policy cannot retain
--    payer intent or reversals (the audit's own refutation of a pure query).
--
-- 2. Refund allocation is independent of which payment_allocation funded the line,
--    and is itself a row against the order_line. Two captures can cover one line;
--    customer-service refunds name the member whose debt reopens, not the PSP
--    capture that happened to pay them. The money still returns via refund.intent_id.
--    paid − refunded must not go negative: that is CHECK line_not_over_refunded on
--    denormalised counters, the same shape as quota_not_exceeded / refund_needs_two_people
--    — a cross-table aggregate is not a CHECK, so the counters live on the line and
--    allocation inserts are the only writer (settlement_guard).
--
-- 3. Fiscal snapshot is invoice_line + invoice_tax_summary amounts, frozen at issue,
--    plus a versioned tax_rule for provenance. Snapshot-on-invoice-header-only loses
--    the per-rate breakdown a credit note and FatturaPA DatiRiepilogo need.
--    Versioned-rule-only is not enough: re-deriving after a rounding-policy change
--    still drifts. So the figures are copied, and tax_rule_id says which rule produced
--    them. Seller/buyer identity is copied onto the document for the same reason.
--    FatturaPA/SDI transmission is NOT implemented — columns exist, nothing is sent
--    (PHASE_B_PLAN.md R5; D4 is unmade). Package entitlement and category-specific
--    fee overlap are F05-adjacent and are not this migration; they live on core.fee.
--
-- 4. Rounding is per-line, remainder distributed on the split of a total across N
--    lines (distribute_minor: first `total % n` lines get +1). Tax is computed on
--    each line (split_inclusive / tax_on_net); DatiRiepilogo is SUM of those lines,
--    never tax(SUM(net)), which is how a settlement file otherwise loses a few cents
--    a day. Money is bigint minor units. Refund tax is proportional to the line's
--    frozen split, not re-derived from the current rule; a full-line refund copies
--    the line's net/tax exactly so 22% of €90.00 is €73.77 + €16.23, not a new round.

-- Provenance for a rate/nature/rounding triple. Content is immutable; a VAT change
-- is a new row. Issued documents do not read this table to re-render — they read
-- invoice_line, which copied the figures.
CREATE TABLE core.tax_rule (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id   uuid NOT NULL REFERENCES core.event(id),
  name       text NOT NULL,
  rate_bp    integer NOT NULL CHECK (rate_bp >= 0),   -- 2200 = 22% IVA
  tax_code   text,                                    -- FatturaPA nature (N1..N7) when exempt
  rounding   text NOT NULL DEFAULT 'half_up'
               CHECK (rounding IN ('half_up')),
  -- exclusive: tax = round(net * rate / 10000). inclusive: net = round(gross * 10000 / (10000+rate)).
  basis      text NOT NULL DEFAULT 'exclusive'
               CHECK (basis IN ('exclusive','inclusive')),
  effective  tstzrange NOT NULL,
  status     text NOT NULL DEFAULT 'active'
               CHECK (status IN ('draft','active','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_rule_exempt_has_nature
    CHECK (rate_bp > 0 OR tax_code IS NOT NULL)
);
CREATE INDEX tax_rule_by_event ON core.tax_rule (event_id, status);

CREATE FUNCTION core.tax_rule_immutable() RETURNS trigger AS $$
BEGIN
  IF (NEW.event_id, NEW.name, NEW.rate_bp, NEW.tax_code, NEW.rounding, NEW.basis)
     IS DISTINCT FROM
     (OLD.event_id, OLD.name, OLD.rate_bp, OLD.tax_code, OLD.rounding, OLD.basis) THEN
    RAISE EXCEPTION 'tax_rule content is immutable; insert a new rule instead';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER tax_rule_no_rewrite BEFORE UPDATE ON core.tax_rule
  FOR EACH ROW EXECUTE FUNCTION core.tax_rule_immutable();

-- Legal billing party. Distinct from payer_person_id: a captain can pay while the
-- invoice names a club/sponsor. Snapshotted onto the invoice at issue; this row may
-- later change. CodiceDestinatario/PEC are stored so SDI can be wired later; unused today.
CREATE TABLE core.billing_profile (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id     uuid NOT NULL REFERENCES core.event(id),
  person_id    uuid REFERENCES core.person(id),
  kind         text NOT NULL CHECK (kind IN ('person','organization')),
  legal_name   text NOT NULL,
  vat_id       text,
  tax_code     text,                                  -- Codice Fiscale
  address_line text,
  city         text,
  postal_code  text,
  country      char(2) NOT NULL DEFAULT 'IT',
  sdi_code     text,                                  -- CodiceDestinatario; unresolved whether SDI applies
  pec          text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_profile_by_person ON core.billing_profile (person_id) WHERE person_id IS NOT NULL;

CREATE TABLE core.registration_order (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id           uuid NOT NULL REFERENCES core.event(id),
  payer_person_id    uuid NOT NULL REFERENCES core.person(id),
  billing_profile_id uuid REFERENCES core.billing_profile(id),
  kind               text NOT NULL DEFAULT 'individual'
                       CHECK (kind IN ('individual','team','corporate','comped')),
  on_behalf_of       uuid REFERENCES core.team_roster(id),
  status             text NOT NULL DEFAULT 'draft',
  currency           char(3) NOT NULL DEFAULT 'EUR',
  -- SUMMED FROM THE LINES by trigger. Never asserted independently.
  net_minor          bigint NOT NULL DEFAULT 0,
  tax_minor          bigint NOT NULL DEFAULT 0,
  gross_minor        bigint NOT NULL DEFAULT 0,
  due_at             timestamptz,                     -- TEA-02 deposit/balance deadlines
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gross_is_net_plus_tax CHECK (gross_minor = net_minor + tax_minor),
  CONSTRAINT roster_order_is_a_team_order
    CHECK (on_behalf_of IS NULL OR kind IN ('team','corporate'))
);
CREATE INDEX registration_order_by_event ON core.registration_order (event_id, status, created_at DESC);
CREATE INDEX registration_order_by_payer ON core.registration_order (payer_person_id, created_at DESC);

CREATE TABLE core.order_line (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  order_id        uuid NOT NULL REFERENCES core.registration_order(id) ON DELETE CASCADE,
  entry_id        uuid REFERENCES core.registration_entry(id),
  kind            text NOT NULL
                    CHECK (kind IN ('entry_fee','add_on','deposit','balance',
                                    'discount','adjustment')),
  description_key text,
  description     text NOT NULL,
  quantity        integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_net_minor  bigint NOT NULL,
  net_minor       bigint NOT NULL,
  tax_rate_bp     integer NOT NULL DEFAULT 0,
  tax_minor       bigint NOT NULL DEFAULT 0,
  tax_code        text,
  tax_rule_id     uuid REFERENCES core.tax_rule(id),
  gross_minor     bigint NOT NULL,
  -- Settlement counters. Allocation triggers are the only legal writer.
  paid_minor      bigint NOT NULL DEFAULT 0,
  refunded_minor  bigint NOT NULL DEFAULT 0,
  CONSTRAINT line_gross_is_net_plus_tax CHECK (gross_minor = net_minor + tax_minor),
  CONSTRAINT exempt_lines_need_a_nature_code
    CHECK (tax_rate_bp > 0 OR tax_code IS NOT NULL),
  -- Discount lines may be negative-gross; settlement bounds apply to debts.
  CONSTRAINT line_not_over_paid
    CHECK (paid_minor >= 0 AND (gross_minor <= 0 OR paid_minor <= gross_minor)),
  CONSTRAINT line_not_over_refunded
    CHECK (refunded_minor >= 0 AND refunded_minor <= paid_minor)
);
CREATE INDEX order_line_by_order ON core.order_line (order_id);
CREATE INDEX order_line_by_entry ON core.order_line (entry_id) WHERE entry_id IS NOT NULL;

CREATE FUNCTION core.roll_up_order_totals() RETURNS trigger AS $$
DECLARE
  v_order_id uuid;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  UPDATE core.registration_order SET
    net_minor   = COALESCE(s.net_minor, 0),
    tax_minor   = COALESCE(s.tax_minor, 0),
    gross_minor = COALESCE(s.gross_minor, 0)
  FROM (
    SELECT SUM(net_minor) AS net_minor,
           SUM(tax_minor) AS tax_minor,
           SUM(gross_minor) AS gross_minor
      FROM core.order_line
     WHERE order_id = v_order_id
  ) s
  WHERE id = v_order_id;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER order_line_roll_up
  AFTER INSERT OR UPDATE OF net_minor, tax_minor, gross_minor, order_id OR DELETE
  ON core.order_line
  FOR EACH ROW EXECUTE FUNCTION core.roll_up_order_totals();

-- Direct UPDATEs of paid/refunded would desync the ledger. Nested trigger depth is 2+
-- when the writer is apply_*_allocation.
CREATE FUNCTION core.order_line_settlement_guard() RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() = 1
     AND (NEW.paid_minor, NEW.refunded_minor)
         IS DISTINCT FROM (OLD.paid_minor, OLD.refunded_minor) THEN
    RAISE EXCEPTION 'order_line paid/refunded counters are maintained by allocations';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER order_line_settlement_guard
  BEFORE UPDATE ON core.order_line
  FOR EACH ROW EXECUTE FUNCTION core.order_line_settlement_guard();

CREATE TABLE core.promotion (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  event_id    uuid NOT NULL REFERENCES core.event(id),
  code        citext NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('percentage','fixed','waiver')),
  value_bp    integer,
  value_minor bigint,
  applies_to  jsonb NOT NULL DEFAULT '{}',
  max_uses    integer,
  used_count  integer NOT NULL DEFAULT 0,
  effective   tstzrange NOT NULL,
  UNIQUE (event_id, code),
  CONSTRAINT promo_not_overused CHECK (max_uses IS NULL OR used_count <= max_uses),
  CONSTRAINT promo_has_exactly_one_value
    CHECK ((value_bp IS NULL) <> (value_minor IS NULL) OR kind = 'waiver')
);

CREATE TABLE core.order_promotion (
  order_id      uuid NOT NULL REFERENCES core.registration_order(id) ON DELETE CASCADE,
  promotion_id  uuid NOT NULL REFERENCES core.promotion(id),
  applied_minor bigint NOT NULL,
  applied_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, promotion_id)
);

-- psp is a label, not an integration. D4 (Stripe vs Adyen) is unmade; nothing is called.
CREATE TABLE core.payment_intent (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  order_id        uuid NOT NULL REFERENCES core.registration_order(id),
  payer_person_id uuid REFERENCES core.person(id),  -- contribution payer; NULL = order payer
  psp             text NOT NULL DEFAULT 'stripe',
  psp_intent_id   text UNIQUE,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','settled','failed','cancelled')),
  amount_minor    bigint NOT NULL CHECK (amount_minor > 0),
  allocated_minor bigint NOT NULL DEFAULT 0 CHECK (allocated_minor >= 0),
  currency        char(3) NOT NULL DEFAULT 'EUR',
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intent_not_over_allocated CHECK (allocated_minor <= amount_minor),
  CONSTRAINT intent_settled_is_fully_allocated
    CHECK (status <> 'settled' OR allocated_minor = amount_minor)
);

CREATE TABLE core.payment_event (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  intent_id    uuid REFERENCES core.payment_intent(id),
  psp_event_id text UNIQUE NOT NULL,
  type         text NOT NULL,
  payload      jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
REVOKE UPDATE, DELETE ON core.payment_event FROM app_rw;

CREATE TABLE core.payment_allocation (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  intent_id     uuid NOT NULL REFERENCES core.payment_intent(id),
  order_line_id uuid NOT NULL REFERENCES core.order_line(id),
  amount_minor  bigint NOT NULL CHECK (amount_minor > 0),
  net_minor     bigint NOT NULL,
  tax_minor     bigint NOT NULL,
  allocated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_alloc_gross_agrees CHECK (amount_minor = net_minor + tax_minor)
);
CREATE INDEX payment_allocation_by_line ON core.payment_allocation (order_line_id);
CREATE INDEX payment_allocation_by_intent ON core.payment_allocation (intent_id);
REVOKE UPDATE, DELETE ON core.payment_allocation FROM app_rw;

CREATE FUNCTION core.apply_payment_allocation() RETURNS trigger AS $$
DECLARE
  v_line_order uuid;
  v_intent_order uuid;
BEGIN
  SELECT order_id INTO STRICT v_line_order FROM core.order_line WHERE id = NEW.order_line_id;
  SELECT order_id INTO STRICT v_intent_order FROM core.payment_intent WHERE id = NEW.intent_id;
  IF v_line_order IS DISTINCT FROM v_intent_order THEN
    RAISE EXCEPTION 'payment allocation must stay on the intent''s order';
  END IF;
  UPDATE core.order_line
     SET paid_minor = paid_minor + NEW.amount_minor
   WHERE id = NEW.order_line_id;
  UPDATE core.payment_intent
     SET allocated_minor = allocated_minor + NEW.amount_minor
   WHERE id = NEW.intent_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER payment_allocation_apply
  AFTER INSERT ON core.payment_allocation
  FOR EACH ROW EXECUTE FUNCTION core.apply_payment_allocation();

CREATE TABLE core.refund (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  intent_id        uuid NOT NULL REFERENCES core.payment_intent(id),
  amount_minor     bigint NOT NULL CHECK (amount_minor > 0),
  net_minor        bigint NOT NULL DEFAULT 0,
  tax_minor        bigint NOT NULL DEFAULT 0,
  allocated_minor  bigint NOT NULL DEFAULT 0 CHECK (allocated_minor >= 0),
  reason           text NOT NULL,
  requested_by     uuid NOT NULL REFERENCES core.person(id),
  approved_by      uuid REFERENCES core.person(id),
  psp_refund_id    text UNIQUE,
  order_id         uuid NOT NULL REFERENCES core.registration_order(id),
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','completed','rejected')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_needs_two_people CHECK (approved_by IS NULL OR approved_by <> requested_by),
  CONSTRAINT refund_not_over_allocated CHECK (allocated_minor <= amount_minor),
  CONSTRAINT refund_alloc_tax_agrees CHECK (net_minor + tax_minor = allocated_minor),
  CONSTRAINT refund_completed_is_fully_allocated
    CHECK (status <> 'completed' OR allocated_minor = amount_minor)
);

CREATE FUNCTION core.refund_on_intent_order() RETURNS trigger AS $$
DECLARE
  v_order uuid;
BEGIN
  SELECT order_id INTO STRICT v_order FROM core.payment_intent WHERE id = NEW.intent_id;
  IF v_order IS DISTINCT FROM NEW.order_id THEN
    RAISE EXCEPTION 'refund order_id must match the intent''s order';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER refund_matches_intent
  BEFORE INSERT OR UPDATE OF intent_id, order_id ON core.refund
  FOR EACH ROW EXECUTE FUNCTION core.refund_on_intent_order();

CREATE TABLE core.refund_allocation (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  refund_id     uuid NOT NULL REFERENCES core.refund(id),
  order_line_id uuid NOT NULL REFERENCES core.order_line(id),
  amount_minor  bigint NOT NULL CHECK (amount_minor > 0),
  net_minor     bigint NOT NULL,
  tax_minor     bigint NOT NULL,
  allocated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_alloc_gross_agrees CHECK (amount_minor = net_minor + tax_minor)
);
CREATE INDEX refund_allocation_by_line ON core.refund_allocation (order_line_id);
CREATE INDEX refund_allocation_by_refund ON core.refund_allocation (refund_id);
REVOKE UPDATE, DELETE ON core.refund_allocation FROM app_rw;

CREATE FUNCTION core.apply_refund_allocation() RETURNS trigger AS $$
DECLARE
  v_line_order uuid;
  v_refund_order uuid;
BEGIN
  SELECT order_id INTO STRICT v_line_order FROM core.order_line WHERE id = NEW.order_line_id;
  SELECT order_id INTO STRICT v_refund_order FROM core.refund WHERE id = NEW.refund_id;
  IF v_line_order IS DISTINCT FROM v_refund_order THEN
    RAISE EXCEPTION 'refund allocation must stay on the refund''s order';
  END IF;
  UPDATE core.order_line
     SET refunded_minor = refunded_minor + NEW.amount_minor
   WHERE id = NEW.order_line_id;
  UPDATE core.refund SET
    allocated_minor = allocated_minor + NEW.amount_minor,
    net_minor       = net_minor + NEW.net_minor,
    tax_minor       = tax_minor + NEW.tax_minor
  WHERE id = NEW.refund_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER refund_allocation_apply
  AFTER INSERT ON core.refund_allocation
  FOR EACH ROW EXECUTE FUNCTION core.apply_refund_allocation();

-- Gapless numbering is a SEQUENCE PROBLEM: a Postgres sequence leaks on rollback
-- and Italian law does not permit gaps. Allocate under the row lock that issues.
CREATE TABLE core.invoice_series (
  series   text PRIMARY KEY,
  year     integer NOT NULL,
  next_seq integer NOT NULL DEFAULT 1
);

CREATE TABLE core.invoice (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  order_id           uuid NOT NULL REFERENCES core.registration_order(id),
  type               text NOT NULL DEFAULT 'invoice'
                       CHECK (type IN ('invoice','credit_note')),
  corrects_id        uuid REFERENCES core.invoice(id),
  refund_id          uuid REFERENCES core.refund(id),
  series             text NOT NULL,
  seq                integer NOT NULL,
  number             text NOT NULL,
  net_minor          bigint NOT NULL,
  tax_minor          bigint NOT NULL,
  gross_minor        bigint NOT NULL,
  -- Frozen at issue. Re-rendering reads these, never live tax_rule or billing_profile.
  seller_legal_name  text NOT NULL,
  seller_vat_id      text,
  seller_tax_code    text,
  seller_address     text,
  buyer_legal_name   text NOT NULL,
  buyer_vat_id       text,
  buyer_tax_code     text,
  buyer_address      text,
  buyer_sdi_code     text,
  -- FatturaPA/SDI: columns only. No transmission, no validator, no preservation claim (R5).
  sdi_status         text,
  sdi_id             text,
  xml_s3_key         text,
  xml_sha256         text,
  fatturapa_version  text,
  issued_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (series, seq),
  UNIQUE (number),
  CONSTRAINT credit_note_corrects_something
    CHECK ((type = 'credit_note') = (corrects_id IS NOT NULL)),
  -- refund_id is nullable on purpose: a nota di credito can correct an invoice
  -- without a PSP refund (a billing adjustment). issue_credit_note still sets it
  -- when the correction is a refund.
  CONSTRAINT invoice_totals_agree CHECK (gross_minor = net_minor + tax_minor)
);
CREATE UNIQUE INDEX invoice_one_live_per_order ON core.invoice (order_id) WHERE type = 'invoice';
REVOKE UPDATE, DELETE ON core.invoice FROM app_rw;

CREATE TABLE core.invoice_line (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  invoice_id    uuid NOT NULL REFERENCES core.invoice(id),
  order_line_id uuid REFERENCES core.order_line(id),
  description   text NOT NULL,
  net_minor     bigint NOT NULL,
  tax_rate_bp   integer NOT NULL,
  tax_code      text,
  tax_minor     bigint NOT NULL,
  gross_minor   bigint NOT NULL,
  tax_rule_id   uuid REFERENCES core.tax_rule(id),
  CONSTRAINT invoice_line_totals CHECK (gross_minor = net_minor + tax_minor)
);
CREATE INDEX invoice_line_by_invoice ON core.invoice_line (invoice_id);
REVOKE UPDATE, DELETE ON core.invoice_line FROM app_rw;

-- FatturaPA DatiRiepilogo: one row per rate/nature on the issued document.
CREATE TABLE core.invoice_tax_summary (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  invoice_id  uuid NOT NULL REFERENCES core.invoice(id),
  tax_rate_bp integer NOT NULL,
  tax_code    text,
  net_minor   bigint NOT NULL,
  tax_minor   bigint NOT NULL,
  UNIQUE NULLS NOT DISTINCT (invoice_id, tax_rate_bp, tax_code)
);
REVOKE UPDATE, DELETE ON core.invoice_tax_summary FROM app_rw;

CREATE FUNCTION core.fiscal_document_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'invoices and credit notes are immutable; issue a credit note to correct';
END $$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_no_rewrite
  BEFORE UPDATE OR DELETE ON core.invoice
  FOR EACH ROW EXECUTE FUNCTION core.fiscal_document_immutable();
CREATE TRIGGER invoice_line_no_rewrite
  BEFORE UPDATE OR DELETE ON core.invoice_line
  FOR EACH ROW EXECUTE FUNCTION core.fiscal_document_immutable();
CREATE TRIGGER invoice_tax_summary_no_rewrite
  BEFORE UPDATE OR DELETE ON core.invoice_tax_summary
  FOR EACH ROW EXECUTE FUNCTION core.fiscal_document_immutable();

-- Per-line tax. round(numeric) is half away from zero — the only rounding this
-- schema will use, so a later "banker's rounding" change cannot silently retouch history.
CREATE FUNCTION core.tax_on_net(p_net bigint, p_rate_bp integer) RETURNS bigint
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE
    WHEN p_rate_bp <= 0 THEN 0
    ELSE round(p_net::numeric * p_rate_bp / 10000)::bigint
  END
$$;

CREATE FUNCTION core.split_inclusive(p_gross bigint, p_rate_bp integer)
RETURNS TABLE(net_minor bigint, tax_minor bigint)
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT
    CASE
      WHEN p_rate_bp <= 0 THEN p_gross
      ELSE round(p_gross::numeric * 10000 / (10000 + p_rate_bp))::bigint
    END AS net_minor,
    p_gross - CASE
      WHEN p_rate_bp <= 0 THEN p_gross
      ELSE round(p_gross::numeric * 10000 / (10000 + p_rate_bp))::bigint
    END AS tax_minor
$$;

-- Largest-remainder: first (total % n) parts get +1 so the parts SUM to total exactly.
CREATE FUNCTION core.distribute_minor(p_total bigint, p_n integer) RETURNS bigint[]
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT ARRAY(
    SELECT (p_total / p_n) + CASE WHEN g <= (p_total % p_n) THEN 1 ELSE 0 END
      FROM generate_series(1, p_n) AS g
  )
$$;

-- A full-line amount copies the frozen split (no second round). A partial amount
-- takes tax = round(amount * line_tax / line_gross) so net + tax = amount always.
CREATE FUNCTION core.proportional_tax_split(
  p_amount bigint,
  p_line_net bigint,
  p_line_tax bigint,
  p_line_gross bigint
) RETURNS TABLE(net_minor bigint, tax_minor bigint)
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    CASE
      WHEN p_line_gross = 0 THEN 0
      WHEN p_amount = p_line_gross THEN p_line_net
      ELSE p_amount - round(p_amount::numeric * p_line_tax / p_line_gross)::bigint
    END,
    CASE
      WHEN p_line_gross = 0 THEN 0
      WHEN p_amount = p_line_gross THEN p_line_tax
      ELSE round(p_amount::numeric * p_line_tax / p_line_gross)::bigint
    END
$$;

CREATE FUNCTION core.allocate_payment(
  p_intent_id uuid,
  p_order_line_id uuid,
  p_amount bigint
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
  v_net bigint;
  v_tax bigint;
  v_line core.order_line%ROWTYPE;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'allocation amount must be positive';
  END IF;
  SELECT * INTO STRICT v_line FROM core.order_line WHERE id = p_order_line_id;
  SELECT s.net_minor, s.tax_minor
    INTO v_net, v_tax
    FROM core.proportional_tax_split(
           p_amount, v_line.net_minor, v_line.tax_minor, v_line.gross_minor
         ) AS s;
  v_id := uuidv7();
  INSERT INTO core.payment_allocation (
    id, intent_id, order_line_id, amount_minor, net_minor, tax_minor
  ) VALUES (
    v_id, p_intent_id, p_order_line_id, p_amount, v_net, v_tax
  );
  RETURN v_id;
END $$;

CREATE FUNCTION core.allocate_refund(
  p_refund_id uuid,
  p_order_line_id uuid,
  p_amount bigint
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
  v_net bigint;
  v_tax bigint;
  v_line core.order_line%ROWTYPE;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'allocation amount must be positive';
  END IF;
  SELECT * INTO STRICT v_line FROM core.order_line WHERE id = p_order_line_id;
  SELECT s.net_minor, s.tax_minor
    INTO v_net, v_tax
    FROM core.proportional_tax_split(
           p_amount, v_line.net_minor, v_line.tax_minor, v_line.gross_minor
         ) AS s;
  v_id := uuidv7();
  INSERT INTO core.refund_allocation (
    id, refund_id, order_line_id, amount_minor, net_minor, tax_minor
  ) VALUES (
    v_id, p_refund_id, p_order_line_id, p_amount, v_net, v_tax
  );
  RETURN v_id;
END $$;

-- Default fill when the payer does not name beneficiaries. Locks the intent and
-- open lines so two concurrent FIFOs cannot double-settle the same member.
CREATE FUNCTION core.allocate_payment_fifo(p_intent_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_intent core.payment_intent%ROWTYPE;
  v_left bigint;
  v_line RECORD;
  v_take bigint;
  v_open bigint;
BEGIN
  SELECT * INTO STRICT v_intent
    FROM core.payment_intent WHERE id = p_intent_id
    FOR UPDATE;
  v_left := v_intent.amount_minor - v_intent.allocated_minor;

  FOR v_line IN
    SELECT ol.id, ol.gross_minor, ol.paid_minor, ol.refunded_minor
      FROM core.order_line ol
     WHERE ol.order_id = v_intent.order_id
       AND ol.kind IN ('entry_fee','add_on','deposit','balance')
       AND ol.gross_minor > ol.paid_minor - ol.refunded_minor
     ORDER BY ol.id
       FOR UPDATE OF ol
  LOOP
    EXIT WHEN v_left <= 0;
    v_open := v_line.gross_minor - (v_line.paid_minor - v_line.refunded_minor);
    v_take := LEAST(v_left, v_open);
    PERFORM core.allocate_payment(p_intent_id, v_line.id, v_take);
    v_left := v_left - v_take;
  END LOOP;

  IF v_left > 0 THEN
    RAISE EXCEPTION 'payment exceeds open order balance by % minor units', v_left;
  END IF;
END $$;

CREATE FUNCTION core.issue_invoice(
  p_order_id uuid,
  p_series text,
  p_seller_legal_name text,
  p_seller_vat_id text,
  p_seller_address text,
  p_buyer_legal_name text,
  p_buyer_vat_id text,
  p_buyer_address text
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
  v_year integer;
  v_seq integer;
  v_number text;
  v_net bigint;
  v_tax bigint;
  v_gross bigint;
BEGIN
  v_year := EXTRACT(YEAR FROM now() AT TIME ZONE 'Europe/Rome')::integer;

  INSERT INTO core.invoice_series (series, year, next_seq)
  VALUES (p_series, v_year, 1)
  ON CONFLICT (series) DO NOTHING;

  UPDATE core.invoice_series
     SET next_seq = next_seq + 1
   WHERE series = p_series
   RETURNING next_seq - 1 INTO v_seq;

  v_number := p_series || '-' || lpad(v_seq::text, 6, '0');

  SELECT net_minor, tax_minor, gross_minor
    INTO STRICT v_net, v_tax, v_gross
    FROM core.registration_order
   WHERE id = p_order_id
     FOR UPDATE;

  v_id := uuidv7();

  INSERT INTO core.invoice (
    id, order_id, type, series, seq, number,
    net_minor, tax_minor, gross_minor,
    seller_legal_name, seller_vat_id, seller_address,
    buyer_legal_name, buyer_vat_id, buyer_address
  ) VALUES (
    v_id, p_order_id, 'invoice', p_series, v_seq, v_number,
    v_net, v_tax, v_gross,
    p_seller_legal_name, p_seller_vat_id, p_seller_address,
    p_buyer_legal_name, p_buyer_vat_id, p_buyer_address
  );

  -- Copy, do not re-derive. A later tax_rule row must not change these figures.
  INSERT INTO core.invoice_line (
    invoice_id, order_line_id, description,
    net_minor, tax_rate_bp, tax_code, tax_minor, gross_minor, tax_rule_id
  )
  SELECT v_id, ol.id, ol.description,
         ol.net_minor, ol.tax_rate_bp, ol.tax_code, ol.tax_minor, ol.gross_minor, ol.tax_rule_id
    FROM core.order_line ol
   WHERE ol.order_id = p_order_id
   ORDER BY ol.id;

  INSERT INTO core.invoice_tax_summary (invoice_id, tax_rate_bp, tax_code, net_minor, tax_minor)
  SELECT v_id, tax_rate_bp, tax_code, SUM(net_minor), SUM(tax_minor)
    FROM core.invoice_line
   WHERE invoice_id = v_id
   GROUP BY tax_rate_bp, tax_code;

  RETURN v_id;
END $$;

CREATE FUNCTION core.issue_credit_note(p_refund_id uuid, p_series text) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_refund core.refund%ROWTYPE;
  v_orig core.invoice%ROWTYPE;
  v_id uuid;
  v_year integer;
  v_seq integer;
  v_number text;
BEGIN
  SELECT * INTO STRICT v_refund FROM core.refund WHERE id = p_refund_id FOR UPDATE;
  IF v_refund.allocated_minor <> v_refund.amount_minor THEN
    RAISE EXCEPTION 'credit note requires the refund to be fully allocated';
  END IF;

  SELECT * INTO STRICT v_orig
    FROM core.invoice
   WHERE order_id = v_refund.order_id AND type = 'invoice';

  v_year := EXTRACT(YEAR FROM now() AT TIME ZONE 'Europe/Rome')::integer;

  INSERT INTO core.invoice_series (series, year, next_seq)
  VALUES (p_series, v_year, 1)
  ON CONFLICT (series) DO NOTHING;

  UPDATE core.invoice_series
     SET next_seq = next_seq + 1
   WHERE series = p_series
   RETURNING next_seq - 1 INTO v_seq;

  v_number := p_series || '-' || lpad(v_seq::text, 6, '0');
  v_id := uuidv7();

  INSERT INTO core.invoice (
    id, order_id, type, corrects_id, refund_id, series, seq, number,
    net_minor, tax_minor, gross_minor,
    seller_legal_name, seller_vat_id, seller_tax_code, seller_address,
    buyer_legal_name, buyer_vat_id, buyer_tax_code, buyer_address, buyer_sdi_code
  ) VALUES (
    v_id, v_refund.order_id, 'credit_note', v_orig.id, p_refund_id,
    p_series, v_seq, v_number,
    v_refund.net_minor, v_refund.tax_minor, v_refund.amount_minor,
    v_orig.seller_legal_name, v_orig.seller_vat_id, v_orig.seller_tax_code, v_orig.seller_address,
    v_orig.buyer_legal_name, v_orig.buyer_vat_id, v_orig.buyer_tax_code, v_orig.buyer_address,
    v_orig.buyer_sdi_code
  );

  INSERT INTO core.invoice_line (
    invoice_id, order_line_id, description,
    net_minor, tax_rate_bp, tax_code, tax_minor, gross_minor, tax_rule_id
  )
  SELECT v_id, ra.order_line_id, ol.description,
         ra.net_minor, ol.tax_rate_bp, ol.tax_code, ra.tax_minor, ra.amount_minor, ol.tax_rule_id
    FROM core.refund_allocation ra
    JOIN core.order_line ol ON ol.id = ra.order_line_id
   WHERE ra.refund_id = p_refund_id
   ORDER BY ra.id;

  INSERT INTO core.invoice_tax_summary (invoice_id, tax_rate_bp, tax_code, net_minor, tax_minor)
  SELECT v_id, tax_rate_bp, tax_code, SUM(net_minor), SUM(tax_minor)
    FROM core.invoice_line
   WHERE invoice_id = v_id
   GROUP BY tax_rate_bp, tax_code;

  RETURN v_id;
END $$;

-- TEA-02: whose debt is open. Single query — group this view by roster and filter
-- settled_minor < due_minor. Counters, not a join to the allocation ledger, so a
-- reporting replica can answer it without reconstructing FIFO.
CREATE VIEW core.entry_balance AS
SELECT
  re.id AS entry_id,
  re.team_roster_id AS roster_id,
  ap.person_id,
  COALESCE(SUM(ol.gross_minor) FILTER (
    WHERE ol.kind IN ('entry_fee','add_on','deposit','balance')), 0) AS due_minor,
  COALESCE(SUM(ol.paid_minor - ol.refunded_minor) FILTER (
    WHERE ol.kind IN ('entry_fee','add_on','deposit','balance')), 0) AS settled_minor
FROM core.registration_entry re
JOIN core.athlete_profile ap ON ap.id = re.athlete_profile_id
LEFT JOIN core.order_line ol ON ol.entry_id = re.id
WHERE re.status NOT IN ('cancelled','withdrawn','substituted')
GROUP BY re.id, re.team_roster_id, ap.person_id;

CREATE VIEW core.roster_member_balance AS
SELECT
  rm.id AS roster_member_id,
  rm.roster_id,
  rm.person_id,
  rm.display_name,
  re.id AS entry_id,
  COALESCE(SUM(ol.gross_minor) FILTER (
    WHERE ol.kind IN ('entry_fee','add_on','deposit','balance')), 0) AS due_minor,
  COALESCE(SUM(ol.paid_minor - ol.refunded_minor) FILTER (
    WHERE ol.kind IN ('entry_fee','add_on','deposit','balance')), 0) AS settled_minor
FROM core.roster_member rm
JOIN core.team_roster tr ON tr.id = rm.roster_id
LEFT JOIN core.athlete_profile ap
  ON ap.person_id = rm.person_id AND ap.event_id = tr.event_id
LEFT JOIN core.registration_entry re
  ON re.athlete_profile_id = ap.id
 AND re.team_roster_id = rm.roster_id
 AND re.status NOT IN ('cancelled','withdrawn','substituted')
LEFT JOIN core.order_line ol ON ol.entry_id = re.id
GROUP BY rm.id, rm.roster_id, rm.person_id, rm.display_name, re.id;

COMMENT ON VIEW core.roster_member_balance IS
  'TEA-02 unpaid-member tracking. A member is unpaid iff settled_minor < due_minor.';

-- Down Migration

DROP VIEW IF EXISTS core.roster_member_balance;
DROP VIEW IF EXISTS core.entry_balance;

DROP FUNCTION IF EXISTS core.issue_credit_note(uuid, text);
DROP FUNCTION IF EXISTS core.issue_invoice(uuid, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS core.allocate_payment_fifo(uuid);
DROP FUNCTION IF EXISTS core.allocate_refund(uuid, uuid, bigint);
DROP FUNCTION IF EXISTS core.allocate_payment(uuid, uuid, bigint);
DROP FUNCTION IF EXISTS core.proportional_tax_split(bigint, bigint, bigint, bigint);
DROP FUNCTION IF EXISTS core.distribute_minor(bigint, integer);
DROP FUNCTION IF EXISTS core.split_inclusive(bigint, integer);
DROP FUNCTION IF EXISTS core.tax_on_net(bigint, integer);

DROP TABLE IF EXISTS core.invoice_tax_summary;
DROP TABLE IF EXISTS core.invoice_line;
DROP TABLE IF EXISTS core.invoice;
DROP TABLE IF EXISTS core.invoice_series;
DROP TABLE IF EXISTS core.refund_allocation;
DROP TABLE IF EXISTS core.refund;
DROP TABLE IF EXISTS core.payment_allocation;
DROP TABLE IF EXISTS core.payment_event;
DROP TABLE IF EXISTS core.payment_intent;
DROP TABLE IF EXISTS core.order_promotion;
DROP TABLE IF EXISTS core.promotion;
DROP TABLE IF EXISTS core.order_line;
DROP TABLE IF EXISTS core.registration_order;
DROP TABLE IF EXISTS core.billing_profile;
DROP TABLE IF EXISTS core.tax_rule;

DROP FUNCTION IF EXISTS core.fiscal_document_immutable();
DROP FUNCTION IF EXISTS core.apply_refund_allocation();
DROP FUNCTION IF EXISTS core.refund_on_intent_order();
DROP FUNCTION IF EXISTS core.apply_payment_allocation();
DROP FUNCTION IF EXISTS core.order_line_settlement_guard();
DROP FUNCTION IF EXISTS core.roll_up_order_totals();
DROP FUNCTION IF EXISTS core.tax_rule_immutable();
