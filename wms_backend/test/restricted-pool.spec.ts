/**
 * Restricted pool config is a boot gate. Purge does not go through it.
 */
import { describe, expect, it } from 'vitest';
import { restrictedDatabaseUrlOrThrow } from '../src/evidence/restricted-pool';

describe('restrictedDatabaseUrlOrThrow', () => {
  it('fails when the URL is missing — there is no fallback to DATABASE_URL', () => {
    expect(() => restrictedDatabaseUrlOrThrow(undefined)).toThrow(
      /RESTRICTED_DATABASE_URL is required because the restricted evidence module is enabled/,
    );
  });

  it('refuses a URL that authenticates as app_rw', () => {
    expect(() =>
      restrictedDatabaseUrlOrThrow('postgres://app_rw:wms_app@localhost:5433/wms_dev'),
    ).toThrow(/must authenticate as restricted_rw/);
  });

  it('accepts a restricted_rw URL', () => {
    const url = 'postgres://restricted_rw:wms_restricted@localhost:5433/wms_dev';
    expect(restrictedDatabaseUrlOrThrow(url)).toBe(url);
  });
});
