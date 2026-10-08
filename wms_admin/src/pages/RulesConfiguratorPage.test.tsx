import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { RulesConfiguratorPage } from './RulesConfiguratorPage';

afterEach(cleanup);

describe('RulesConfiguratorPage publish flow', () => {
  it('publishes only a real diff after confirming its registration impact', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/rules-configurator']}><RulesConfiguratorPage /></MemoryRouter>);

    const publish = await screen.findByRole('button', { name: 'Publish Rule Register' });
    expect(publish).toBeDisabled();
    expect(screen.getByText('v2.1 (Active in Production)')).toBeVisible();

    await user.click(screen.getByRole('radio', { name: 'Crew Average Age' }));
    expect(publish).toBeEnabled();
    expect(screen.getByText(/v2\.2 \(draft\)/)).toBeVisible();
    await user.click(publish);

    const dialog = screen.getByRole('dialog', { name: 'Impact Analysis (RUL-03)' });
    expect(within(dialog).getByText('3 of 5')).toBeVisible();
    expect(within(dialog).getByText(/T-101 · Harper \/ Rossi/)).toBeVisible();
    expect(screen.getByText('v2.1 (Active in Production) → v2.2 (draft)')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Confirm & Publish' }));
    expect(await screen.findByText('v2.2 (Active in Production)')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(publish).toBeDisabled();
  });
});
