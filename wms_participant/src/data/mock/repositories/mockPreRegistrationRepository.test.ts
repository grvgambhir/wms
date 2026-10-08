/// <reference types="jest" />
// Lookup (reference/email), privacy-masked preview, outcomes, and idempotent claim (P03 / REG-13).
import { RepositoryError } from '@/data/errors/repositoryError';
import { MockPreRegistrationRepository } from '@/data/mock/repositories/mockPreRegistrationRepository';

const DANIEL_ID = 'prereg-0001';
const DANIEL_REFERENCE = 'COMO27-EOI-0001';
const DANIEL_EMAIL = 'daniel.harper@example.com';
const GIULIA_REFERENCE = 'COMO27-EOI-0003';

describe('MockPreRegistrationRepository', () => {
  let repo: MockPreRegistrationRepository;

  beforeEach(() => {
    repo = new MockPreRegistrationRepository();
  });

  it('looks up by reference or email, case-insensitive', async () => {
    const byRef = await repo.lookup({ query: DANIEL_REFERENCE });
    const byRefLower = await repo.lookup({ query: 'como27-eoi-0001' });
    const byEmail = await repo.lookup({ query: DANIEL_EMAIL });
    const byEmailCased = await repo.lookup({ query: 'Daniel.Harper@Example.COM' });
    const byTrimmed = await repo.lookup({ query: `  ${DANIEL_REFERENCE}  ` });

    expect(byRef.outcome).toBe('found');
    expect(byRefLower.outcome).toBe('found');
    expect(byEmail.outcome).toBe('found');
    expect(byEmailCased.outcome).toBe('found');
    expect(byTrimmed.outcome).toBe('found');

    if (byRef.outcome === 'found' && byEmail.outcome === 'found') {
      expect(byRef.preview.id).toBe(DANIEL_ID);
      expect(byEmail.preview.id).toBe(DANIEL_ID);
      expect(byRef.preview.reference).toBe(DANIEL_REFERENCE);
    }
  });

  it('masks name + email and exposes only birth year (no full DOB)', async () => {
    const result = await repo.lookup({ query: DANIEL_REFERENCE });
    expect(result.outcome).toBe('found');
    if (result.outcome !== 'found') return;

    const { preview } = result;
    expect(preview.maskedName).toBe('D••• H•••');
    expect(preview.maskedEmail).toBe('d••••@example.com');
    expect(preview.birthYear).toBe(1985);
    expect(preview).not.toHaveProperty('dateOfBirth');
    expect(preview).not.toHaveProperty('firstName');
    expect(preview).not.toHaveProperty('lastName');
    expect(preview).not.toHaveProperty('email');
    expect(JSON.stringify(preview)).not.toMatch(/1985-03-14/);
    expect(JSON.stringify(preview)).not.toContain('Daniel Harper');
    expect(JSON.stringify(preview)).not.toContain(DANIEL_EMAIL);
  });

  it("returns outcome 'found' | 'already_claimed' | 'not_found'", async () => {
    const found = await repo.lookup({ query: DANIEL_REFERENCE });
    const claimed = await repo.lookup({ query: GIULIA_REFERENCE });
    const missing = await repo.lookup({ query: 'no-such-record' });
    const blank = await repo.lookup({ query: '   ' });

    expect(found.outcome).toBe('found');
    expect(claimed.outcome).toBe('already_claimed');
    expect(missing.outcome).toBe('not_found');
    expect(blank.outcome).toBe('not_found');
    expect(missing).not.toHaveProperty('preview');

    if (claimed.outcome === 'already_claimed') {
      expect(claimed.preview.maskedName).toBe('G••• M•••');
      expect(claimed.preview.status).toBe('claimed');
    }
  });

  it('claim is idempotent (alreadyClaimed:true) and requires an idempotencyKey', async () => {
    await expect(repo.claim({ recordId: DANIEL_ID, idempotencyKey: '' })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
    await expect(repo.claim({ recordId: DANIEL_ID, idempotencyKey: '' })).rejects.toBeInstanceOf(
      RepositoryError,
    );

    const first = await repo.claim({ recordId: DANIEL_ID, idempotencyKey: 'claim-daniel-1' });
    expect(first.alreadyClaimed).toBe(false);
    expect(first.record.status).toBe('claimed');
    expect(first.record.firstName).toBe('Daniel');
    expect(first.record.email).toBe(DANIEL_EMAIL);
    expect(first.record.claimedAt).toBeTruthy();

    const replay = await repo.claim({ recordId: DANIEL_ID, idempotencyKey: 'claim-daniel-1' });
    expect(replay.alreadyClaimed).toBe(true);
    expect(replay.record.id).toBe(DANIEL_ID);
    expect(replay.record.status).toBe('claimed');
    expect(replay.record.claimedAt).toBe(first.record.claimedAt);

    const seededClaimed = await repo.claim({
      recordId: 'prereg-0003',
      idempotencyKey: 'claim-giulia',
    });
    expect(seededClaimed.alreadyClaimed).toBe(true);

    const afterClaim = await repo.lookup({ query: DANIEL_REFERENCE });
    expect(afterClaim.outcome).toBe('already_claimed');
  });
});
