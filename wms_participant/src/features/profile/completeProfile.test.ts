import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { resetAccessTokenProvider, setAccessTokenProvider } from '@/auth/accessToken';
import { landingHref } from '@/auth/session';
import { patchMeProfile, type MeProfile } from '@/auth/me';
import { RepositoryError } from '@/data/errors/repositoryError';
import { copy } from '@/constants/copy';
import { en } from '@/i18n/en';
import { it as itCopy } from '@/i18n/it';
import type { CopyDict } from '@/i18n';
import {
  athleteInputToCompleteValues,
  buildProfilePatch,
  copyForProfileRefusal,
  createIdempotencyTracker,
  emptyCompleteProfileValues,
  meToAthleteProfile,
  PROFILE_DOB_REFUSAL_KEYS,
  submitCompleteProfile,
  withContiguousOrdinals,
  type CompleteProfileFormValues,
} from '@/features/profile/completeProfile';

afterEach(() => {
  resetAccessTokenProvider();
  jest.restoreAllMocks();
});

const itDict = { ...en, ...itCopy } as CopyDict;

function validValues(): CompleteProfileFormValues {
  return {
    givenName: 'Ada',
    familyName: 'Lovelace',
    dateOfBirth: '1985-03-15',
    nationality: 'gb',
    gender: 'female',
    phone: '+44 20 7946 0018',
    emergencyContacts: [
      { name: 'William King', phone: '+44 20 7946 0999', relationship: 'Partner' },
      { name: 'Mary', phone: '+44 20 7946 0888', relationship: '' },
    ],
  };
}

function completeMe(): MeProfile {
  return {
    id: 'person-1',
    email: 'ada@example.com',
    givenName: 'Ada',
    familyName: 'Lovelace',
    dateOfBirth: '1985-03-15',
    nationality: 'GB',
    gender: 'female',
    phone: '+44',
    locale: 'en',
    profileStatus: 'complete',
    roles: ['participant'],
    emergencyContacts: [],
  };
}

describe('complete-profile payload', () => {
  it('sends exactly the allowed fields and never personId or email', () => {
    const body = buildProfilePatch(validValues(), 'en');
    expect(body).toEqual({
      givenName: 'Ada',
      familyName: 'Lovelace',
      dateOfBirth: '1985-03-15',
      nationality: 'GB',
      gender: 'female',
      phone: '+44 20 7946 0018',
      locale: 'en',
      emergencyContacts: [
        { ordinal: 0, name: 'William King', phone: '+44 20 7946 0999', relationship: 'Partner' },
        { ordinal: 1, name: 'Mary', phone: '+44 20 7946 0888' },
      ],
    });
    expect(body).not.toHaveProperty('personId');
    expect(body).not.toHaveProperty('email');
    expect(JSON.stringify(body)).not.toContain('personId');
    expect(JSON.stringify(body)).not.toContain('email');
  });

  it('omits empty optional fields', () => {
    const body = buildProfilePatch(emptyCompleteProfileValues(), 'it');
    expect(body).toEqual({
      givenName: '',
      familyName: '',
      dateOfBirth: '',
      locale: 'it',
      emergencyContacts: [],
    });
    expect(body).not.toHaveProperty('nationality');
    expect(body).not.toHaveProperty('gender');
    expect(body).not.toHaveProperty('phone');
  });
});

describe('Idempotency-Key', () => {
  it('reuses the same key when retrying the same submission', () => {
    const tracker = createIdempotencyTracker();
    const payload = buildProfilePatch(validValues(), 'en');
    const first = tracker.keyFor(payload);
    const second = tracker.keyFor(payload);
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(8);
  });

  it('issues a new key when the payload changes', () => {
    const tracker = createIdempotencyTracker();
    const first = tracker.keyFor(buildProfilePatch(validValues(), 'en'));
    const changed = buildProfilePatch({ ...validValues(), givenName: 'Grace' }, 'en');
    expect(tracker.keyFor(changed)).not.toBe(first);
  });
});

describe('server refusal copy EN/IT', () => {
  it.each([...PROFILE_DOB_REFUSAL_KEYS])('renders translated copy for %s in EN and IT', (key) => {
    const english = copyForProfileRefusal(key, copy);
    const italian = copyForProfileRefusal(key, itDict);
    expect(english.length).toBeGreaterThan(0);
    expect(italian.length).toBeGreaterThan(0);
    expect(english).not.toBe(key);
    expect(italian).not.toBe(key);
    expect(english).not.toContain('profile.date_of_birth');
    expect(italian).not.toContain('profile.date_of_birth');
    expect(italian).not.toBe(english);
  });

  it('never falls back to a raw server message', () => {
    expect(copyForProfileRefusal('profile.unknown.thing', copy)).toBe(copy.completeProfileSaveError);
    expect(copyForProfileRefusal('Date of birth is in the future', itDict)).toBe(itDict.completeProfileSaveError);
  });
});

describe('401 mid-submit', () => {
  it('re-authenticates, retries the same body and Idempotency-Key, and does not mutate input', async () => {
    const payload = buildProfilePatch(validValues(), 'en');
    const original = structuredClone(payload);
    const tracker = createIdempotencyTracker();
    const keys: string[] = [];
    const bodies: unknown[] = [];
    let calls = 0;
    let reauthed = false;

    const result = await submitCompleteProfile({
      payload,
      tracker,
      patch: async (body, key) => {
        calls += 1;
        keys.push(key);
        bodies.push(body);
        if (calls === 1) {
          throw new RepositoryError({ code: 'UNAUTHORIZED', message: 'unauthorized' });
        }
        return completeMe();
      },
      reauthenticate: async () => {
        reauthed = true;
      },
    });

    expect(reauthed).toBe(true);
    expect(calls).toBe(2);
    expect(keys[0]).toBe(keys[1]);
    expect(bodies[0]).toEqual(original);
    expect(bodies[1]).toEqual(original);
    expect(payload).toEqual(original);
    expect(JSON.stringify(bodies[0])).not.toContain('personId');
    expect(JSON.stringify(bodies[0])).not.toContain('"email"');
    expect(result.profileStatus).toBe('complete');
  });
});

describe('launch routing', () => {
  const cognitoSession = {
    athleteId: 'cognito-sub',
    identifier: 'ada@example.com',
    verifiedAt: new Date().toISOString(),
  };
  const demoSession = {
    athleteId: 'athlete_daniel_harper',
    identifier: 'daniel.harper@email.com',
    verifiedAt: new Date().toISOString(),
  };

  it('routes a placeholder profile here and a complete one into the journey', () => {
    expect(landingHref(cognitoSession, { profileStatus: 'placeholder' })).toBe('/(auth)/complete-profile');
    expect(landingHref(cognitoSession, { profileStatus: 'complete' })).toBe('/registration-status');
    expect(landingHref(cognitoSession, null)).toBe('/(auth)/complete-profile');
  });

  it('keeps demo login off this screen', () => {
    expect(landingHref(demoSession, { profileStatus: 'placeholder' })).toBe('/registration-status');
  });
});

describe('emergency contact ordinals', () => {
  it('stays contiguous after adding and removing rows', () => {
    let rows = withContiguousOrdinals([]);
    rows = [...rows, { name: 'A', phone: '1', relationship: '' }];
    rows = [...rows, { name: 'B', phone: '2', relationship: '' }];
    rows = [...rows, { name: 'C', phone: '3', relationship: '' }];
    expect(buildProfilePatch({ ...validValues(), emergencyContacts: rows }, 'en').emergencyContacts.map((c) => c.ordinal)).toEqual([
      0, 1, 2,
    ]);

    rows = rows.filter((_, index) => index !== 1);
    const body = buildProfilePatch({ ...validValues(), emergencyContacts: rows }, 'en');
    expect(body.emergencyContacts.map((c) => c.ordinal)).toEqual([0, 1]);
    expect(body.emergencyContacts.map((c) => c.name)).toEqual(['A', 'C']);
  });
});

describe('P06 profile from /v1/me', () => {
  it('maps the signed-in person, never Harper demo fields', () => {
    const me: MeProfile = {
      id: 'person-gaurav',
      email: 'gaurav@example.com',
      givenName: 'Gaurav',
      familyName: 'Gambhir',
      dateOfBirth: '1981-10-14T00:00:00.000Z',
      nationality: 'IN',
      gender: 'male',
      phone: '+91 98765 43210',
      locale: 'en',
      profileStatus: 'complete',
      roles: ['participant'],
      emergencyContacts: [{ ordinal: 0, name: 'Emergency', relationship: 'Spouse', phone: '+91 90000 00000' }],
    };
    const profile = meToAthleteProfile(me);
    expect(profile).toEqual({
      id: 'person-gaurav',
      firstName: 'Gaurav',
      lastName: 'Gambhir',
      dateOfBirth: '1981-10-14',
      nationalityCountryCode: 'IN',
      gender: 'male',
      email: 'gaurav@example.com',
      phone: '+91 98765 43210',
      emergencyContact: { name: 'Emergency', phone: '+91 90000 00000', relationship: 'Spouse' },
    });
    expect(JSON.stringify(profile)).not.toContain('Harper');
    expect(profile.email).not.toBe('daniel.harper@example.com');
  });

  it('keeps extra emergency contacts when saving the P06 single-contact form', () => {
    const values = athleteInputToCompleteValues(
      {
        firstName: 'Gaurav',
        lastName: 'Gambhir',
        dateOfBirth: '1981-10-14',
        nationalityCountryCode: 'IN',
        email: 'gaurav@example.com',
        phone: '+91 98765 43210',
        emergencyContact: { name: 'Updated', phone: '+91 11111 11111', relationship: 'Spouse' },
      },
      {
        emergencyContacts: [
          { ordinal: 0, name: 'Old', relationship: 'Spouse', phone: '+91 00000 00000' },
          { ordinal: 1, name: 'Second', relationship: 'Parent', phone: '+91 22222 22222' },
        ],
      },
    );
    expect(values.emergencyContacts).toEqual([
      { name: 'Updated', phone: '+91 11111 11111', relationship: 'Spouse' },
      { name: 'Second', phone: '+91 22222 22222', relationship: 'Parent' },
    ]);
  });
});

describe('PATCH /v1/me/profile', () => {
  it('posts the patch with an Idempotency-Key and no personId/email in the JSON', async () => {
    process.env.EXPO_PUBLIC_WMS_BACKEND_URL = 'http://localhost:3050';
    setAccessTokenProvider({
      getAccessToken: async () => 'access-token',
      refreshAccessToken: async () => 'access-token',
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(completeMe()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const payload = buildProfilePatch(validValues(), 'en');
    await patchMeProfile(payload, 'key-1');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:3050/v1/me/profile');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('key-1');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access-token');
    const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(sent).toEqual(payload);
    expect(sent).not.toHaveProperty('personId');
    expect(sent).not.toHaveProperty('email');
  });
});
