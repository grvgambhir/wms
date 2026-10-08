/**
 * Deterministic ids for the Como Lake 2027 demo seed.
 * Fixture UUIDs are reused as-is; non-UUID fixture ids are hashed.
 */
import { createHash } from 'node:crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function stableId(raw: string): string {
  if (UUID_RE.test(raw)) return raw.toLowerCase();
  const h = createHash('sha256').update(`wms-demo:${raw}`).digest('hex');
  const variant = (8 + (parseInt(h[16] ?? '0', 16) % 4)).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const REFERENCE_DATE = '2027-12-31';
export const EVENT_SLUG = 'como-lake-2027';

export const EVENT_ID = '3d6f0f8a-64c7-4a40-9d31-202709170001';
export const HARPER_ID = '693edf31-739e-4f28-96c4-202700000001';
export const MARCO_TENNIS_ID = '693edf31-739e-4f28-96c4-202700000002';
export const LUCA_ID = '693edf31-739e-4f28-96c4-202700000003';
export const HELEN_ID = '2c2d4108-bc1d-4f75-9eb8-0d4d485b35c7';

export const TENNIS_SPORT = '9db23735-a6df-4d62-8f0c-202700000001';
export const BASKETBALL_SPORT = '9db23735-a6df-4d62-8f0c-202700000002';
export const ROWING_SPORT = '9db23735-a6df-4d62-8f0c-202700000003';
export const SWIMMING_SPORT = '9db23735-a6df-4d62-8f0c-202700000004';
export const PARA_SPORT = '9db23735-a6df-4d62-8f0c-202700000005';
export const JUDO_SPORT = '9db23735-a6df-4d62-8f0c-202700000006';

export const TENNIS_PRODUCT = '6cf1db22-2605-4d83-bfa4-202700000001';
export const BASKETBALL_PRODUCT = '6cf1db22-2605-4d83-bfa4-202700000002';
export const ROWING_PRODUCT = '6cf1db22-2605-4d83-bfa4-202700000003';
export const SWIMMING_PRODUCT = '6cf1db22-2605-4d83-bfa4-202700000004';
export const PARA_PRODUCT = '6cf1db22-2605-4d83-bfa4-202700000005';
export const JUDO_PRODUCT = '6cf1db22-2605-4d83-bfa4-202700000006';

export const TENNIS_RULE_VERSION = 'eb754330-18ac-4a72-83f1-202700000001';
export const BASKETBALL_RULE_VERSION = 'eb754330-18ac-4a72-83f1-202700000002';
export const ROWING_RULE_VERSION = 'eb754330-18ac-4a72-83f1-202700000003';

export const TENNIS_35_39 = 'eb754330-18ac-4a72-83f1-202700000012';
// Five-year bands, like tennis and like the quota/fee fixtures that have always keyed
// ...021 to the 30–34 pool (48 of 52, €135) and ...022 to the full 35–39 pool (60 of 60, €120).
export const BASKETBALL_30_34 = 'eb754330-18ac-4a72-83f1-202700000021';
export const BASKETBALL_35_39 = 'eb754330-18ac-4a72-83f1-202700000022';
export const ROWING_CAT_C = 'eb754330-18ac-4a72-83f1-202700000033';

export const TENNIS_ENTRY = '74bd5dc5-37cb-49be-8ef6-202700000001';
export const TENNIS_ORDER = '846c3118-8c44-4bb4-a861-202700000001';
export const TENNIS_INTENT = '957ab267-b7f4-4207-94a2-202700000001';
export const TENNIS_FEE = 'c8af61ce-6980-46d0-b391-202700000001';
export const BASKETBALL_FEE_35_39 = 'c8af61ce-6980-46d0-b391-202700000003';

export const BASKETBALL_TEAM = 'f8b8077d-7845-4f04-8f8c-202700000001';
export const ROWING_TEAM = 'f8b8077d-7845-4f04-8f8c-202700000002';
export const BASKETBALL_FULL_POOL = 'b79ee2ea-ad65-43c2-b54c-202700000002';

export const HARPER_PROFILE = stableId(`athlete_profile:${HARPER_ID}:${EVENT_ID}`);
export const MARCO_TENNIS_PROFILE = stableId(`athlete_profile:${MARCO_TENNIS_ID}:${EVENT_ID}`);
export const LUCA_PROFILE = stableId(`athlete_profile:${LUCA_ID}:${EVENT_ID}`);
export const HARPER_BASKETBALL_ENTRY = stableId('registration_entry:harper:basketball');
export const HARPER_ROWING_ENTRY = stableId('registration_entry:harper:rowing');
export const LUCA_BASKETBALL_ENTRY = stableId('registration_entry:luca:basketball');
export const ELENA_ID = stableId('person:Elena Rossi:IT:para');
export const ELENA_PROFILE = stableId(`athlete_profile:${ELENA_ID}:${EVENT_ID}`);
export const ELENA_ENTRY = stableId('registration_entry:elena:para-swimming');
export const GIULIA_ID = stableId('person:Giulia Moretti:IT');
export const BASKETBALL_VERSION = stableId(`roster_version:${BASKETBALL_TEAM}:1`);
export const ROWING_VERSION = stableId(`roster_version:${ROWING_TEAM}:1`);
export const BASKETBALL_ORDER = stableId('registration_order:basketball-lakers');
export const BASKETBALL_INTENT = stableId('payment_intent:basketball-lakers-part');
export const TAX_N1 = stableId('tax_rule:como:n1');
export const NOTICE_SENSITIVE = stableId('privacy_notice:sensitive:1');
export const IDENTITY_REQ_SET = stableId('evidence_requirement_set:identity');
export const IDENTITY_REQ_VER = stableId('evidence_requirement_version:identity:1');
// RFP §9.3 scenario 1 turns on a medical certificate for swimming. Without this requirement the
// swimming product flag said "evidence required" while nothing existed to satisfy, and a new entry
// sat in pending_evidence forever.
export const MEDICAL_REQ_SET = stableId('evidence_requirement_set:medical_certificate');
export const MEDICAL_REQ_VER = stableId('evidence_requirement_version:medical_certificate:1');
export const JUDO_LICENCE_REQ_SET = stableId('evidence_requirement_set:judo_federation_licence');
export const JUDO_LICENCE_REQ_VER = stableId('evidence_requirement_version:judo_federation_licence:1');
export const JUDO_BELT_REQ_SET = stableId('evidence_requirement_set:judo_belt_certificate');
export const JUDO_BELT_REQ_VER = stableId('evidence_requirement_version:judo_belt_certificate:1');
export const JUDO_WEIGHT_REQ_SET = stableId('evidence_requirement_set:judo_weigh_in');
export const JUDO_WEIGHT_REQ_VER = stableId('evidence_requirement_version:judo_weigh_in:1');
export const PARA_REQ_SET = stableId('evidence_requirement_set:para_class');
export const PARA_REQ_VER = stableId('evidence_requirement_version:para_class:1');
export const PARA_DOC = stableId('restricted.evidence_document:elena:para');
export const PARA_REF = stableId('protected_evidence_ref:elena:para');
export const PARA_FACT = stableId('classification_fact:elena:S9');
export const HARPER_PASSPORT = 'd9b25f16-5fc0-4b72-90e8-202700000001';
export const PRE_REG_BATCH = stableId('pre_registration:batch:Legacy EOI 2025');
export const ELENA_CONSENT = stableId('consent:elena:eligibility_medical_evidence');
export const LUCA_WAITLIST = 'a68f21d0-2bc8-41a5-823e-202700000001';

export function ruleSetId(ruleVersionId: string): string {
  return stableId(`rule_set:${ruleVersionId}`);
}

export function sportPoolId(sportId: string): string {
  return stableId(`quota_pool:sport:${sportId}`);
}

export function profileId(personId: string): string {
  return stableId(`athlete_profile:${personId}:${EVENT_ID}`);
}

export function entryIdFor(personId: string, productId: string): string {
  return stableId(`registration_entry:${personId}:${productId}`);
}

export function orderLineId(orderId: string, personId: string): string {
  return stableId(`order_line:${orderId}:${personId}`);
}

export const HARPER_BILLING = stableId(`billing_profile:${HARPER_ID}`);
export const HARPER_EMERGENCY = stableId(`emergency_contact:${HARPER_ID}`);
export const TENNIS_LINE = stableId(`order_line:${TENNIS_ORDER}:${HARPER_ID}`);
export const HARPER_IDENTITY_UPLOAD = stableId('evidence_upload:harper-identity:1');
export const HARPER_IDENTITY_REVIEW = stableId('evidence_review:harper-identity:1');
export const ELENA_UPLOAD = stableId('restricted.evidence_upload:elena:1');
export const ELENA_REVIEW = stableId('restricted.evidence_review:elena:1');
export const PARA_RULE_VERSION = 'eb754330-18ac-4a72-83f1-202700000005';
export const JUDO_RULE_VERSION = 'eb754330-18ac-4a72-83f1-202700000007';
