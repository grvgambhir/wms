import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { FinancePage } from './FinancePage';

afterEach(() => {
  cleanup();
});

function parseEuro(text: string | null): number {
  return Number((text ?? '').replace(/[€\s]/g, '').replace(/,/g, ''));
}

function kpiEuro(label: string): number {
  return parseEuro(within(screen.getByLabelText(label)).getByText(/^€/).textContent);
}

function kpiDetailCount(label: string, pattern: RegExp): number {
  const detail = within(screen.getByLabelText(label)).getByText(pattern).textContent ?? '';
  return Number(detail.match(/(\d+)/)?.[1]);
}

describe('FinancePage reconciliation flow', () => {
  it('loads the overview and refunds a captured settlement while keeping the books balanced', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/finance']}>
        <FinancePage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Finance Settlement & Reconciliation' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Finance & Reconcile' })).toHaveClass('bg-admin-active');

    const settledKpi = await screen.findByLabelText('SETTLED (CAPTURED)');
    const refundedKpi = screen.getByLabelText('REFUNDED');
    const varianceKpi = screen.getByLabelText('RECONCILIATION VARIANCE');
    const settledBefore = kpiEuro('SETTLED (CAPTURED)');
    const refundedBefore = kpiEuro('REFUNDED');
    const settledCountBefore = kpiDetailCount('SETTLED (CAPTURED)', /payments reconciled/);
    const refundedCountBefore = kpiDetailCount('REFUNDED', /refunds processed/);
    expect(within(varianceKpi).getByText('€0.00')).toBeVisible();

    const sofiaRow = screen.getByRole('row', { name: /Sofia Greco/ });
    await user.click(within(sofiaRow).getByRole('button', { name: 'Refund Sofia Greco settlement' }));

    await waitFor(() => {
      expect(within(sofiaRow).getByText('Refunded')).toBeVisible();
      expect(within(sofiaRow).queryByRole('button', { name: 'Refund Sofia Greco settlement' })).not.toBeInTheDocument();
    });
    expect(kpiEuro('SETTLED (CAPTURED)')).toBe(settledBefore - 90);
    expect(within(settledKpi).getByText(`${settledCountBefore - 1} payments reconciled`)).toBeVisible();
    expect(kpiEuro('REFUNDED')).toBe(refundedBefore + 90);
    expect(within(refundedKpi).getByText(`${refundedCountBefore + 1} refunds processed`)).toBeVisible();
    expect(within(varianceKpi).getByText('€0.00')).toBeVisible();
    expect(within(varianceKpi).getByText('✓ Books balance · every callback matched')).toBeVisible();
  });
});
