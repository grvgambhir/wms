import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { CommunicationsPage } from './CommunicationsPage';

afterEach(() => { cleanup(); });

function kpiCount(label: string): number {
  return Number(within(screen.getByLabelText(label)).getByText(/^[0-9,]+$/).textContent?.replace(/,/g, ''));
}

describe('CommunicationsPage broadcast flow', () => {
  it('prefills a template, previews reach, and appends a sent broadcast newest-first', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/communications']}><CommunicationsPage /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Communications Center' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Communications' })).toHaveClass('bg-admin-active');
    expect(await screen.findByLabelText('BROADCASTS SENT')).toBeVisible();
    const sentBefore = kpiCount('BROADCASTS SENT');
    const recipientsBefore = kpiCount('RECIPIENTS REACHED');
    expect(screen.getByRole('button', { name: 'Send broadcast' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Payment reminder' }));
    expect(screen.getByLabelText('Subject')).toHaveValue('Complete your Como Lake 2027 entry payment');
    expect(screen.getByText('Your entry is reserved but not yet confirmed. Please complete your payment to secure your place. Entries close 30 September 2027.')).toBeVisible();
    expect(screen.getByText('This broadcast will reach 213 participants.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Pending payment · 213' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Email' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Send broadcast' }));
    expect(await screen.findByText('Broadcast sent to 213 participants.')).toBeVisible();
    await waitFor(() => expect(kpiCount('BROADCASTS SENT')).toBe(sentBefore + 1));
    expect(kpiCount('RECIPIENTS REACHED')).toBe(recipientsBefore + 213);
    expect(screen.getByLabelText('Subject')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Send broadcast' })).toBeDisabled();

    const log = screen.getByRole('region', { name: 'DELIVERY LOG' });
    const newest = within(log).getAllByRole('listitem')[0];
    expect(within(newest!).getByText('Complete your Como Lake 2027 entry payment')).toBeVisible();
    expect(within(newest!).getByText(/Pending payment · 213 recipients/)).toBeVisible();
  });
});
