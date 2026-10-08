import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { AccreditationDeskPage } from './AccreditationDeskPage';

afterEach(cleanup);

function kpiCount(label: string): number {
  return Number(within(screen.getByLabelText(label)).getByText(/^\d+$/).textContent);
}

describe('AccreditationDeskPage credential lifecycle', () => {
  // Games-scale desk (60 cards) plus three 120ms mock mutations needs more than the 5s default.
  it('gates ineligible records and issues, reissues, then revokes an eligible credential', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/accreditation-desk']}><AccreditationDeskPage /></MemoryRouter>);

    const daniel = await screen.findByRole('article', { name: 'Daniel Harper accreditation' });
    const lucas = screen.getByRole('article', { name: 'Lucas Bianchi accreditation' });
    expect(within(lucas).getByText('Photo and eligibility must both be approved before issuing.')).toBeVisible();
    expect(within(lucas).queryByRole('button', { name: 'Issue credential' })).not.toBeInTheDocument();

    const pendingBefore = kpiCount('PENDING REVIEW');
    const issuedBefore = kpiCount('ISSUED');
    const revokedBefore = kpiCount('REVOKED');

    await user.click(within(daniel).getByRole('button', { name: 'Issue credential' }));
    const firstBadgeText = (await within(daniel).findByText(/^COMO27-\d{6}$/)).textContent;
    expect(firstBadgeText).toMatch(/^COMO27-\d{6}$/);
    expect(kpiCount('PENDING REVIEW')).toBe(pendingBefore - 1);
    expect(kpiCount('ISSUED')).toBe(issuedBefore + 1);

    // Reissue is fire-and-forget; the first badge is already in the DOM, so wait
    // until Daniel's number actually changes instead of matching the old one.
    await user.click(within(daniel).getByRole('button', { name: 'Reissue' }));
    await waitFor(() => {
      expect(within(daniel).getByText(/^COMO27-\d{6}$/).textContent).not.toBe(firstBadgeText);
    });
    const secondBadgeText = within(daniel).getByText(/^COMO27-\d{6}$/).textContent;
    expect(secondBadgeText).toMatch(/^COMO27-\d{6}$/);
    expect(within(daniel).queryByText(firstBadgeText ?? '')).not.toBeInTheDocument();

    await user.click(within(daniel).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(within(daniel).getByText('Revoked: Revoked by OC accreditation')).toBeVisible());
    expect(within(daniel).queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
    expect(kpiCount('ISSUED')).toBe(issuedBefore);
    expect(kpiCount('REVOKED')).toBe(revokedBefore + 1);
  }, 20_000);
});
