import { describe, expect, it } from 'vitest';

import { audienceIncludesParticipant, type AudienceSubject } from '../domain/models/communications';

const tennis: AudienceSubject = {
  sportName: 'Tennis',
  entryStatus: 'confirmed',
  evidenceStatus: 'approved',
};
const rowingPending: AudienceSubject = {
  sportName: 'Rowing',
  entryStatus: 'pending_payment',
  evidenceStatus: 'submitted',
};

describe('audienceIncludesParticipant', () => {
  it('REV-038: a Rowing broadcast does not reach a Tennis entrant', () => {
    expect(audienceIncludesParticipant('rowing', tennis)).toBe(false);
    expect(audienceIncludesParticipant('rowing', rowingPending)).toBe(true);
    expect(audienceIncludesParticipant({ sport: 'tennis' }, tennis)).toBe(true);
    expect(audienceIncludesParticipant({ sport: 'tennis' }, rowingPending)).toBe(false);
  });

  it('payment and document filters use the stored fields, not sport', () => {
    expect(audienceIncludesParticipant('pending-payment', rowingPending)).toBe(true);
    expect(audienceIncludesParticipant('pending-payment', tennis)).toBe(false);
    expect(audienceIncludesParticipant({ evidenceIncomplete: true }, rowingPending)).toBe(true);
    expect(audienceIncludesParticipant({ evidenceIncomplete: true }, tennis)).toBe(false);
    expect(audienceIncludesParticipant({ all: true }, tennis)).toBe(true);
  });
});
