import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CategoryCheckRepository } from '../../repositories/ApiCategoryCheckRepository';
import { CategoryCheckerPanel } from './CategoryCheckerPanel';

afterEach(cleanup);

function fakeRepository(categoryName: string): CategoryCheckRepository {
  return {
    products: vi.fn(async () => [
      { id: 'swim', name: '100m Freestyle', participantType: 'individual', sport: 'Swimming', event: 'Como' },
      { id: 'four', name: 'Coxed Four', participantType: 'crew', sport: 'Rowing', event: 'Como' },
    ]),
    check: vi.fn(async (sportEntryProductId: string) => ({
      sportEntryProductId,
      sport: 'Swimming',
      ruleVersionId: 'rv',
      version: 'v2.1',
      referenceDate: '2027-12-31',
      derivation: {
        ruleVersionId: 'rv',
        referenceDate: '2027-12-31',
        categoryName,
        dimensions: [{ attribute: 'age', value: 42, bandName: categoryName || undefined }],
        blockedBy: categoryName ? [] : [{ predicate: 'attribute_in' as const, messageKey: 'eligibility.cannot_evaluate' }],
      },
    })),
  };
}

describe('CategoryCheckerPanel', () => {
  it('checks a date of birth against the selected product and shows the category', async () => {
    const repository = fakeRepository('40–44');
    render(<CategoryCheckerPanel repository={repository} />);
    await screen.findByRole('option', { name: 'Swimming · 100m Freestyle' });

    const button = screen.getByRole('button', { name: 'Check category' });
    expect(button).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Date of birth'), '1985-06-01');
    await userEvent.click(button);

    expect(await screen.findByText('40–44')).toBeInTheDocument();
    expect(screen.getByText(/42 on 2027-12-31/)).toBeInTheDocument();
    expect(repository.check).toHaveBeenCalledWith('swim', [{ dateOfBirth: '1985-06-01' }]);
  });

  it('says plainly when an age is outside every band', async () => {
    render(<CategoryCheckerPanel repository={fakeRepository('')} />);
    await screen.findByRole('option', { name: 'Swimming · 100m Freestyle' });
    await userEvent.type(screen.getByLabelText('Date of birth'), '2010-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Check category' }));
    expect(await screen.findByText('No category — outside every band')).toBeInTheDocument();
  });

  it('lets a crew be checked member by member, with roles', async () => {
    const repository = fakeRepository('Category C (43–49)');
    render(<CategoryCheckerPanel repository={repository} />);
    await screen.findByRole('option', { name: 'Rowing · Coxed Four' });
    await userEvent.selectOptions(screen.getByLabelText('Sport entry'), 'four');

    await userEvent.type(screen.getByLabelText('Member 1 date of birth'), '1980-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Add member' }));
    await userEvent.type(screen.getByLabelText('Member 2 date of birth'), '2000-01-01');
    await userEvent.type(screen.getAllByLabelText('Role')[1]!, 'coxswain');
    await userEvent.click(screen.getByRole('button', { name: 'Check category' }));

    await waitFor(() =>
      expect(repository.check).toHaveBeenCalledWith('four', [
        { dateOfBirth: '1980-01-01' },
        { dateOfBirth: '2000-01-01', role: 'coxswain' },
      ]),
    );
  });
});
