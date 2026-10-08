/**
 * AUTH_PROVIDER conditional env — fail at parse with a sentence, not at first login.
 */
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env';

const base = {
  DATABASE_URL: 'postgres://wms:wms@localhost:5433/wms_dev',
  PORT: '3050',
  NODE_ENV: 'test',
  LOG_LEVEL: 'error',
  JWT_SECRET: 'local-dev-only-change-me-32chars-min',
};

const cognito = {
  COGNITO_REGION: 'eu-south-1',
  COGNITO_USER_POOL_ID: 'eu-south-1_LocalTest0',
  COGNITO_CLIENT_ID_PARTICIPANT: 'localtestparticipantcli001',
  COGNITO_CLIENT_ID_ADMIN: 'localtestadminclientid002',
};

describe('parseEnv auth', () => {
  it('accepts AUTH_PROVIDER=local without RESTRICTED_DATABASE_URL', () => {
    const parsed = parseEnv({ ...base, AUTH_PROVIDER: 'local' });
    expect(parsed.RESTRICTED_DATABASE_URL).toBeUndefined();
  });

  it('rejects a malformed RESTRICTED_DATABASE_URL', () => {
    expect(() =>
      parseEnv({
        ...base,
        AUTH_PROVIDER: 'local',
        RESTRICTED_DATABASE_URL: 'not-a-postgres-url',
      }),
    ).toThrow(/RESTRICTED_DATABASE_URL must be a postgres/);
  });
  it('defaults AUTH_PROVIDER to cognito and requires the pool vars', () => {
    expect(() => parseEnv({ ...base })).toThrow(
      /COGNITO_USER_POOL_ID is required when AUTH_PROVIDER=cognito/,
    );
    const parsed = parseEnv({ ...base, ...cognito });
    expect(parsed.AUTH_PROVIDER).toBe('cognito');
    if (parsed.AUTH_PROVIDER !== 'cognito') throw new Error('narrow');
    expect(parsed.COGNITO_USER_POOL_ID).toBe(cognito.COGNITO_USER_POOL_ID);
  });

  it('fails with a sentence when the pool id is missing under cognito', () => {
    expect(() =>
      parseEnv({
        ...base,
        AUTH_PROVIDER: 'cognito',
        COGNITO_REGION: 'eu-south-1',
        COGNITO_CLIENT_ID_PARTICIPANT: cognito.COGNITO_CLIENT_ID_PARTICIPANT,
        COGNITO_CLIENT_ID_ADMIN: cognito.COGNITO_CLIENT_ID_ADMIN,
      }),
    ).toThrow('COGNITO_USER_POOL_ID is required when AUTH_PROVIDER=cognito.');
  });

  it('requires JWT_SECRET and accepts AUTH_PROVIDER=local without Cognito vars', () => {
    const withoutSecret: NodeJS.ProcessEnv = { ...base, AUTH_PROVIDER: 'local' };
    delete withoutSecret.JWT_SECRET;
    expect(() => parseEnv(withoutSecret)).toThrow(/Required|JWT_SECRET/);
    const parsed = parseEnv({
      ...base,
      AUTH_PROVIDER: 'local',
    });
    expect(parsed.AUTH_PROVIDER).toBe('local');
  });

  it('rejects a pool id that does not start with the region', () => {
    expect(() =>
      parseEnv({
        ...base,
        AUTH_PROVIDER: 'cognito',
        COGNITO_REGION: 'eu-south-1',
        COGNITO_USER_POOL_ID: 'eu-west-1_LocalTest0',
        COGNITO_CLIENT_ID_PARTICIPANT: cognito.COGNITO_CLIENT_ID_PARTICIPANT,
        COGNITO_CLIENT_ID_ADMIN: cognito.COGNITO_CLIENT_ID_ADMIN,
      }),
    ).toThrow(/must start with COGNITO_REGION/);
  });

  it('fails at boot when only one of the AWS access-key pair is set', () => {
    expect(() =>
      parseEnv({
        ...base,
        ...cognito,
        AWS_ACCESS_KEY_ID: 'AKIATEST',
      }),
    ).toThrow(/AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must both be set/);
  });

  it('accepts a complete AWS access-key pair and records that AdminCreateUser is configured', () => {
    const parsed = parseEnv({
      ...base,
      ...cognito,
      AWS_REGION: 'eu-south-1',
      AWS_ACCESS_KEY_ID: 'AKIATEST',
      AWS_SECRET_ACCESS_KEY: 'secret',
    });
    expect(parsed.cognitoAdminConfigured).toBe(true);
    expect(parsed.AWS_REGION).toBe('eu-south-1');
  });
});
