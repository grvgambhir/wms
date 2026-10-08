import { describe, expect, it, vi } from 'vitest';
import { assertProductionDatabaseRoleIsNotSuperuser } from '../src/db/production-database-role.guard';

describe('production database role guard', () => {
  it('warns but starts when development runs as a superuser', async () => {
    // Development ran as the owner for months without a word, so every grant was bypassed
    // while the schema looked locked down. It now says so at startup.
    const query = vi.fn().mockResolvedValue({ rows: [{ isSuperuser: true, role: 'wms' }] });
    const warned = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      await expect(
        assertProductionDatabaseRoleIsNotSuperuser({ query }, 'development'),
      ).resolves.toBeUndefined();
      const lines = warned.mock.calls.map(([line]) => String(line)).join('');
      expect(lines).toMatch(/superuser/);
    } finally {
      warned.mockRestore();
    }
  });

  it('says nothing when development already runs least-privilege', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ isSuperuser: false, role: 'app_rw' }] });
    const warned = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      await expect(
        assertProductionDatabaseRoleIsNotSuperuser({ query }, 'development'),
      ).resolves.toBeUndefined();
      expect(warned).not.toHaveBeenCalled();
    } finally {
      warned.mockRestore();
    }
  });

  it('refuses a production superuser connection', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ isSuperuser: true, role: 'postgres' }] });
    await expect(
      assertProductionDatabaseRoleIsNotSuperuser({ query }, 'production'),
    ).rejects.toThrow(/database superuser/);
  });

  it('allows a least-privilege production role', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ isSuperuser: false, role: 'app_rw' }] });
    await expect(
      assertProductionDatabaseRoleIsNotSuperuser({ query }, 'production'),
    ).resolves.toBeUndefined();
  });
});
