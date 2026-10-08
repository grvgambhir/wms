# DATA_MODEL.md

<!-- STATE-COMO2027 -->
> ✅ **CURRENT — still valid, but EXTEND for Como Lake 2027.**
> The entities here (athlete, event, sport, registration, document, partner, accreditation, match) remain the base. Como work **adds**: rule/rule-version, team/roster, waitlist/quota, exception, finance/order, communication, pre-registration/claim, and a **restricted** sensitive-evidence type (medical/para). Keep IDs stable, model money as minor units, timestamps ISO-8601 — see [`DELIVERY_PLAN_COMO2027.md`](./DELIVERY_PLAN_COMO2027.md) §4 + §6.6.

## Goal
Define stable POC entities that can later map cleanly to backend/database models.

Use string IDs for all relations.

## Event
```ts
type EventStatus = "draft" | "registration_open" | "registration_closed" | "live" | "completed";

interface Event {
  id: string;
  name: string;
  shortName?: string;
  city: string;
  state?: string;
  country: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  registrationDeadline?: string;
  status: EventStatus;
  featured?: boolean;
  organizer?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  websiteNote?: string;
  mailingZipCode?: string;
  outOfStateParticipantsAllowed?: boolean;
  heroImageKey?: string;
  logoKey?: string;
  sportIds: string[];
}
```

## Sport
```ts
interface Sport {
  id: string;
  name: string;
  iconKey?: string;
  eventId: string;
  disciplineIds: string[];
  availability: "available" | "almost_full" | "full" | "closed";
}
```

## Discipline
```ts
interface Discipline {
  id: string;
  sportId: string;
  name: string;
  participantType: "individual" | "doubles" | "team";
  categoryIds: string[];
}
```

## CompetitionCategory
```ts
interface CompetitionCategory {
  id: string;
  disciplineId: string;
  name: string;
  ageGroup: string;
  division?: string;
  entryType?: "competitive" | "recreational";
  partnerRequired?: boolean;
  quotaStatus?: "available" | "almost_full" | "full" | "waitlist";
}
```

## AthleteProfile
```ts
interface AthleteProfile {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationalityCountryCode: string;
  gender?: string;
  email: string;
  phone?: string;
  passportNumber?: string;
  emergencyContact?: {
    name: string;
    relationship?: string;
    phone: string;
  };
  profileImageUri?: string;
  profileImageKey?: string;
}
```

## ConsentRecord (P06 — PLT-07 / PRV-02)
Granular, individually grantable/withdrawable notices. Required items that are not granted surface an "action needed" state. Sensitive processing (eligibility/medical evidence) is an explicit opt-in. Backend-adaptable: `GET /participants/{id}/consents`, `PUT /athletes/{id}`, `POST /consents/{id}/grant|withdraw`.

```ts
type ConsentKind =
  | "terms_and_conditions"
  | "privacy_policy"
  | "eligibility_medical_evidence"
  | "photo_media_accreditation"
  | "marketing_communications";

type ConsentStatus = "granted" | "withdrawn";

interface ConsentRecord {
  id: string;
  participantId: string;
  kind: ConsentKind;
  required: boolean;
  sensitive: boolean;
  status: ConsentStatus;
  policyVersion: string;
  updatedAt: string;
  grantedAt?: string;
  withdrawnAt?: string;
}
```

## RegistrationDraft
```ts
interface RegistrationDraft {
  id: string;
  athleteId: string;
  eventId: string;
  sportId?: string;
  disciplineId?: string;
  categoryId?: string;
  partnerAthleteId?: string;
  documentIds: string[];
  accreditationPhotoUri?: string;
  termsAccepted: boolean;
  promoCode?: string;
  currentStep: number;
  updatedAt: string;
}
```

## Assisted / proxy registration (PLT-06)

`src/domain/models/assistedRegistration.ts` defines the pure, serialisable helpdesk
contract. An `AssistedRegistrationSession` links one participant to a separately
identified operator, the recorded consent method/reference, and the proxy registration
state. Each consent or registration mutation carries an idempotency key and creates an
immutable `ProxyAuditEntry` with operator ID/name, participant ID/name, consent
reference, and an ISO-8601 UTC timestamp. Proxy actions are rejected until consent is
present. Growable participant, session, and audit lists use `PaginatedResponse<T>`.

## Registration
```ts
type RegistrationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "action_required"
  | "waitlisted"
  | "rejected"
  | "approved"
  | "accreditation_pending"
  | "accreditation_issued";

interface Registration {
  id: string;
  athleteId: string;
  eventId: string;
  sportId: string;
  disciplineId: string;
  categoryId: string;
  partnerAthleteId?: string;
  documentIds: string[];
  paymentId?: string;
  status: RegistrationStatus;
  submittedAt?: string;
  approvedAt?: string;
}
```

## Connected registration journey contract (Como 2027 slice)

The connected P08 → P14/P20 → P16 journey uses the API contract in
`src/domain/models/registrationJourney.ts`. It extends the legacy POC model without
changing the approved data strategy:

- growable resources return `PaginatedResponse<T> = { items, total, cursor? }`;
- entry status uses the REG-11 lifecycle (`draft`, `pending_evidence`,
  `pending_team`, `pending_payment`, `waitlisted`, `confirmed`, `cancelled`,
  `substituted`, `withdrawn`, `disqualified`);
- `RegistrationEntry` retains original and current validated category, active
  rule ID/version, partner/team-member ID, grade, and UTC audit timestamps;
- `Fee`, `RegistrationOrder`, and `JourneyPayment` store EUR values as integer
  minor units; payment records retain the idempotency key, attempt count, and
  charge count;
- `EntryQuota` and `WaitlistEntry` model capacity, reservations, offer expiry,
  claim, and oversell prevention explicitly;
- medical/classification documents add an explicit `restricted` access level.

The deterministic API-shaped fixtures live in
`src/data/mock/fixtures/data-hub/` and are read only by the mock journey
repository. The future REST implementation must return the same DTOs.

### Team roster and category-impact slice (P12)

`src/domain/models/teamRoster.ts` adds the pure, serialisable P12 contracts:

- `TeamRoster` owns UUID member records, their sport roles, the original member
  IDs, available substitute IDs, and the original category on record;
- every member has a UUID athlete relation plus an ISO DOB so the shared rules
  engine can derive youngest-member or crew-average categories without UI data;
- `RegistrationEntry.rosterMemberIds` carries the committed roster through
  checkout/status, while `CategoryAuditRecord` preserves original → current
  category, banding-age impact, reason, rule/version, and UTC timestamp (RUL-04);
- category-specific `Fee` and `EntryQuota` rows make price and capacity impacts
  explicit API data (EUR minor units), rather than screen logic.

Mock roster lists use `{ items, total, cursor? }` in `data-hub/team-rosters.json`.
`TeamRosterRepository.getTeamRoster` maps to a future
`GET /registration-entries/{entryId}/rosters/{productId}` endpoint; committing
the selected member UUIDs remains part of the existing idempotent entry update.

## EligibilityDocument
```ts
type DocumentStatus = "missing" | "uploaded" | "verified" | "rejected";

interface EligibilityDocument {
  id: string;
  athleteId: string;
  registrationDraftId?: string;
  type: "passport_id" | "dob_proof" | "medical_declaration" | "liability_waiver" | "other";
  fileName: string;
  localUri?: string;
  remoteUrl?: string;
  status: DocumentStatus;
  uploadedAt?: string;
  rejectionReason?: string;
}
```

## PartnerRequest
```ts
type PartnerRequestStatus = "pending" | "accepted" | "declined" | "cancelled";

interface PartnerRequest {
  id: string;
  eventId: string;
  categoryId: string;
  fromAthleteId: string;
  toAthleteId: string;
  status: PartnerRequestStatus;
  createdAt: string;
}
```

POC: new requests start as `pending`. Only Marco is auto-accepted after a short delay. `declined` is unused until a second athlete can respond.

## Payment
```ts
type PaymentStatus = "pending" | "processing" | "paid" | "failed" | "refunded";

interface Payment {
  id: string;
  registrationId?: string;
  amount: number;
  currency: string;
  promoCode?: string;
  discountAmount?: number;
  status: PaymentStatus;
  method: string;
  createdAt: string;
}
```

## Accreditation
```ts
interface Accreditation {
  id: string;
  registrationId: string;
  athleteId: string;
  eventId: string;
  badgeNumber: string;
  qrValue: string;
  accessLevel: string;
  validFrom: string;
  validUntil: string;
  status: "pending" | "issued" | "disabled";
}
```

## Venue
```ts
interface Venue {
  id: string;
  eventId: string;
  name: string;
  city: string;
  address?: string;
}
```

## ScheduleItem
```ts
interface ScheduleItem {
  id: string;
  eventId: string;
  athleteId?: string;
  sportId?: string;
  type: "match" | "training" | "ceremony" | "social" | "other";
  title: string;
  startAt: string;
  endAt?: string;
  venueId?: string;
  court?: string;
  matchId?: string;
}
```

## MatchResult
```ts
interface MatchSide {
  id: string;
  displayName: string;
  athleteIds: string[];
  countryCodes?: string[];
}

interface MatchResult {
  id: string;
  eventId: string;
  sportId: string;
  categoryId: string;
  venueId?: string;
  court?: string;
  status: "scheduled" | "live" | "completed";
  sideA: MatchSide;
  sideB: MatchSide;
  scoreSummary: string;
  sets?: Array<{
    label: string;
    a: number | string;
    b: number | string;
  }>;
  round?: string;
  gamePoints?: { a: string; b: string };
  servingSide?: "a" | "b";
  stats?: Array<{ label: string; a: number; b: number }>;
  updatedAt: string;
}
```

## Notification
```ts
interface AppNotification {
  id: string;
  athleteId?: string;
  eventId: string;
  title: string;
  body: string;
  type: "info" | "schedule_change" | "registration" | "result" | "alert";
  createdAt: string;
  read: boolean;
}
```
