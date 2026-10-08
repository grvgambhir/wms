import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { ExceptionsPage } from './ExceptionsPage';

afterEach(cleanup);

describe('ExceptionsPage review queue', () => {
  // Games-scale queue (24 cases) plus dual-control mutations needs more than the 5s default.
  it('requires two distinct approvals for high-impact cases and records coded rejection', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/exceptions']}><ExceptionsPage /></MemoryRouter>);

    expect(await screen.findByRole('region', { name: 'EXC-1 review' })).toBeVisible();
    expect(screen.getByText('Belt / grade')).toBeVisible();
    expect(screen.getByText('2nd Kyu · minimum 1st Kyu required')).toHaveClass('text-danger');
    expect(screen.getByText('Dual approval required — 0/2 signatures')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Approve as Reviewer A' }));
    expect(await screen.findByText('Dual approval required — 1/2 signatures')).toBeVisible();
    expect(screen.getByRole('button', { name: '✓ Reviewer A' })).toBeDisabled();
    expect(screen.queryByText('Exception approved — 2/2 signatures')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Approve as Reviewer B' }));
    expect(await screen.findByText('Exception approved — 2/2 signatures')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Approve as Reviewer B' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /A\. Bianchi/ }));
    const detail = await screen.findByRole('region', { name: 'EXC-2 review' });
    expect(within(detail).getByText(/Restricted medical\/classification data/)).toBeVisible();
    await user.click(within(detail).getByRole('button', { name: 'Reject with reason: Insufficient evidence' }));
    await waitFor(() => expect(within(detail).getByText('Rejected — Insufficient evidence')).toBeVisible());
  }, 20_000);
});
