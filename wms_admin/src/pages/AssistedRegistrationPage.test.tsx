import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { AssistedRegistrationPage } from './AssistedRegistrationPage';

afterEach(cleanup);

describe('AssistedRegistrationPage proxy flow', () => {
  // Games-scale audit trail (50 events) plus mock delays needs more than the 5s default.
  it('blocks actions until consent, then records attributed start and submit audit events', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/assisted-registration']}><AssistedRegistrationPage /></MemoryRouter>);

    await user.click(await screen.findByRole('radio', { name: 'Select participant Luca Bianchi' }));
    const audit = screen.getByLabelText('Proxy audit trail');
    const auditBefore = within(audit).getAllByRole('article').length;
    const start = screen.getByRole('button', { name: 'Start registration on behalf' });
    expect(start).toBeDisabled();
    expect(screen.getByText('Proxy action is blocked until this participant’s consent is recorded.')).toBeVisible();

    await user.click(screen.getByRole('radio', { name: 'In person' }));
    await user.click(screen.getByRole('button', { name: 'Record participant consent' }));
    // Consent-gate: Luca's selected panel must show a reference and unlock proxy actions.
    // Do not query the whole page — the Games-scale trail already lists many consent events.
    const consentSection = screen.getByRole('heading', { name: '2. Record consent' }).closest('section');
    await waitFor(() => {
      expect(within(consentSection as HTMLElement).getByText(/Consent reference: CONSENT-COMO27-\d{4}/)).toBeVisible();
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start registration on behalf' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Start registration on behalf' }));
    await user.click(await screen.findByRole('button', { name: 'Submit registration on behalf' }));
    expect(await screen.findByText('Registration submitted on the participant’s behalf.')).toBeVisible();

    const entries = within(audit).getAllByRole('article');
    expect(entries).toHaveLength(auditBefore + 3);
    expect(within(entries[0]!).getByText('Registration submitted on behalf')).toBeVisible();
    expect(within(entries[0]!).getByText('Acted by: Helen Ward')).toBeVisible();
    expect(within(entries[0]!).getByText('On behalf of: Luca Bianchi')).toBeVisible();
    expect(within(entries[0]!).getByText(/Consent reference: CONSENT-COMO27-\d{4}/)).toBeVisible();
    expect(within(screen.getByLabelText('AUDIT EVENTS')).getByText(String(auditBefore + 3))).toBeVisible();
  }, 20_000);
});
