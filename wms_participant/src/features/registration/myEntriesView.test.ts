import { describe, expect, it } from '@jest/globals';

import { copy } from '@/constants/copy';
import { RepositoryError } from '@/data/errors/repositoryError';
import { createEntryOutcome, nextStepFor } from '@/features/registration/myEntriesView';

describe('nextStepFor', () => {
  it('sends each status to the screen that can move it forward', () => {
    expect(nextStepFor('draft').route).toBe('/sport-entry');
    expect(nextStepFor('pending_evidence').route).toBe('/eligibility-evidence');
    expect(nextStepFor('pending_payment').route).toBe('/checkout');
    expect(nextStepFor('waitlisted').route).toBe('/waitlist');
    expect(nextStepFor('confirmed').route).toBe('/registration-status');
    expect(nextStepFor('withdrawn').route).toBe('/registration-status');
  });
});

describe('createEntryOutcome', () => {
  it('opens the existing entry on a duplicate instead of showing an error', () => {
    const error = new RepositoryError({
      code: 'DUPLICATE_ENTRY',
      message: 'registration.entry.already_exists',
      fields: { entryId: 'entry-7' },
    });
    expect(createEntryOutcome(error, copy)).toEqual({ kind: 'open_existing', entryId: 'entry-7' });
  });

  it('routes missing consents and an incomplete profile to the profile', () => {
    expect(
      createEntryOutcome(new RepositoryError({ code: 'CONSENT_REQUIRED', message: 'x', fields: { consents: 'privacy_policy' } }), copy),
    ).toEqual({ kind: 'go_profile', message: copy.registerErrorConsent });
    expect(createEntryOutcome(new RepositoryError({ code: 'PROFILE_INCOMPLETE', message: 'x' }), copy)).toEqual({
      kind: 'go_profile',
      message: copy.registerErrorProfile,
    });
  });

  it('explains an ineligible age and a closed event, and falls back for anything else', () => {
    expect(createEntryOutcome(new RepositoryError({ code: 'CATEGORY_NOT_ELIGIBLE', message: 'x' }), copy).kind).toBe('message');
    expect(createEntryOutcome(new RepositoryError({ code: 'EVENT_UNAVAILABLE', message: 'x' }), copy)).toEqual({
      kind: 'message',
      message: copy.registerErrorClosed,
    });
    expect(createEntryOutcome(new Error('boom'), copy)).toEqual({ kind: 'message', message: copy.registerErrorGeneric });
  });
});
