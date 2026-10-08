import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { PasswordField } from './PasswordField';

afterEach(cleanup);

describe('PasswordField', () => {
  it('reveals and hides the typed password without losing the value', async () => {
    const user = userEvent.setup();
    render(<PasswordField label="Password" name="password" defaultValue="" />);

    const input = screen.getByLabelText('Password') as HTMLInputElement;
    expect(input).toHaveAttribute('type', 'password');
    await user.type(input, 'Secret1');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('Secret1');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveValue('Secret1');
  });
});
