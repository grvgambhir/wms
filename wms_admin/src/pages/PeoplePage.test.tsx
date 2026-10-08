import type { ReactElement } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, type AdminSession } from '../auth/AuthProvider';
import { RequireOcAdmin } from '../auth/RequireAuth';
import { ApiAdminPeopleRepository } from '../repositories/ApiAdminPeopleRepository';
import {
  MOCK_ADMIN_ID,
  MOCK_FINANCE_ID,
  MOCK_INVITED_ID,
  MOCK_STAFF_ID,
} from '../repositories/MockAdminPeopleRepository';
import { adminPeopleRepository } from '../repositories/provider';
import { ToastProvider } from '../components/ui/ToastProvider';
import { PeoplePage } from './PeoplePage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await adminPeopleRepository.reset();
});

function ocAdminSession(): AdminSession {
  return {
    username: 'olga.admin@example.com',
    me: {
      id: MOCK_ADMIN_ID,
      givenName: 'Olga',
      familyName: 'Admin',
      email: 'olga.admin@example.com',
      roles: ['oc_admin'],
    },
  };
}

function financeSession(): AdminSession {
  return {
    username: 'priya.finance@example.com',
    me: {
      id: MOCK_FINANCE_ID,
      givenName: 'Priya',
      familyName: 'Finance',
      email: 'priya.finance@example.com',
      roles: ['finance'],
    },
  };
}

function renderPeople(session: AdminSession, page: ReactElement = <PeoplePage />) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/people']}>
        <AuthProvider initialSession={session}>
          <RequireOcAdmin>{page}</RequireOcAdmin>
        </AuthProvider>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('PeoplePage roles', () => {
  it('refuses a finance-only session and does not show the people list', async () => {
    renderPeople(financeSession());

    expect(await screen.findByRole('heading', { name: 'This page is for administrators' })).toBeVisible();
    expect(screen.queryByRole('searchbox', { name: 'Search people' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite user' })).not.toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Sam Staff/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'People & Roles' })).not.toBeInTheDocument();
    expect(screen.queryByText('olga.admin@example.com')).not.toBeInTheDocument();
  });

  it('lets an oc_admin grant oc_staff and shows the chip', async () => {
    const user = userEvent.setup();
    renderPeople(ocAdminSession());

    const sam = await screen.findByRole('row', { name: /Sam Staff/ });
    expect(screen.getByRole('link', { name: 'People & Roles' })).toHaveClass('bg-admin-active');
    await user.click(within(sam).getByRole('button', { name: 'Grant' }));

    expect(await within(sam).findByRole('button', { name: 'Revoke OC staff (global) from Sam Staff' })).toBeVisible();
  });

  it('never offers participant in the grant dropdown', async () => {
    renderPeople(ocAdminSession());

    const sam = await screen.findByRole('row', { name: /Sam Staff/ });
    const grantSelect = within(sam).getByLabelText('Role to grant Sam Staff');
    const values = within(grantSelect)
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value);

    expect(values).toEqual(['oc_staff', 'oc_admin', 'finance']);
    expect(values).not.toContain('participant');
    expect(within(grantSelect).queryByText(/^participant$/i)).not.toBeInTheDocument();
  });

  it('explains a LAST_OC_ADMIN refusal and keeps the administrator chip', async () => {
    const user = userEvent.setup();
    renderPeople(ocAdminSession());

    const olga = await screen.findByRole('row', { name: /Olga Admin/ });
    await user.click(within(olga).getByRole('button', { name: 'Revoke Administrator (global) from Olga Admin' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Revoke Administrator (global) from Olga Admin');
    await user.click(screen.getByRole('button', { name: 'Revoke' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You cannot revoke this role. It is the last administrator account, and removing it would lock everyone out of the Command Centre.',
    );
    expect(within(olga).getByRole('button', { name: 'Revoke Administrator (global) from Olga Admin' })).toBeVisible();
  });

  it('loads a second page with the cursor from the first response', async () => {
    const user = userEvent.setup();
    const listSpy = vi.spyOn(adminPeopleRepository, 'listPeople');
    renderPeople(ocAdminSession());

    expect(await screen.findByRole('row', { name: /Olga Admin/ })).toBeVisible();
    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(1));
    const firstPage = (await listSpy.mock.results[0]?.value) as { cursor?: string };
    expect(firstPage.cursor).toBeTruthy();
    expect(listSpy.mock.calls[0]?.[0]).not.toHaveProperty('cursor');

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2));
    expect(listSpy.mock.calls[1]?.[0].cursor).toBe(firstPage.cursor);
    expect(await screen.findByRole('row', { name: /Extra Person 22/ })).toBeVisible();
  });

  it('retries a failed grant with the same Idempotency-Key and uses a new key for a new grant', async () => {
    const user = userEvent.setup();
    const keys: string[] = [];
    let grantAttempts = 0;
    const sam = {
      id: MOCK_STAFF_ID,
      givenName: 'Sam',
      familyName: 'Staff',
      email: 'sam.staff@example.com',
      profileStatus: 'complete',
      roles: [{ roleCode: 'participant', eventId: null }],
    };
    const alex = {
      id: '44444444-4444-4444-8444-444444444444',
      givenName: 'Alex',
      familyName: 'Other',
      email: 'alex.other@example.com',
      profileStatus: 'complete',
      roles: [{ roleCode: 'participant', eventId: null }],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/admin/people') && !url.includes('/roles')) {
          return new Response(JSON.stringify({ items: [sam, alex] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (init?.method === 'POST' && url.includes('/roles')) {
          const key = new Headers(init.headers).get('Idempotency-Key') ?? '';
          keys.push(key);
          grantAttempts += 1;
          if (grantAttempts === 1) {
            throw new TypeError('Failed to fetch');
          }
          return new Response(
            JSON.stringify({
              personId: url.includes(sam.id) ? sam.id : alex.id,
              roleCode: 'oc_staff',
              eventId: null,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('not found', { status: 404 });
      }),
    );

    renderPeople(ocAdminSession(), <PeoplePage repository={new ApiAdminPeopleRepository()} />);

    const samRow = await screen.findByRole('row', { name: /Sam Staff/ });
    await user.click(within(samRow).getByRole('button', { name: 'Grant' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The request did not reach the server');

    await user.click(within(samRow).getByRole('button', { name: 'Grant' }));
    expect(await within(samRow).findByRole('button', { name: 'Revoke OC staff (global) from Sam Staff' })).toBeVisible();

    const alexRow = screen.getByRole('row', { name: /Alex Other/ });
    await user.click(within(alexRow).getByRole('button', { name: 'Grant' }));
    expect(await within(alexRow).findByRole('button', { name: 'Revoke OC staff (global) from Alex Other' })).toBeVisible();

    expect(keys).toHaveLength(3);
    expect(keys[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[2]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('renders two distinguishable chips for the same role and revokes the event-scoped grant with its eventId', async () => {
    const user = userEvent.setup();
    const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const sam = {
      id: MOCK_STAFF_ID,
      givenName: 'Sam',
      familyName: 'Staff',
      email: 'sam.staff@example.com',
      profileStatus: 'complete',
      roles: [
        { roleCode: 'oc_staff', eventId: null },
        { roleCode: 'oc_staff', eventId },
      ],
    };
    const deleted: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/admin/people') && !url.includes('/roles')) {
          return new Response(JSON.stringify({ items: [sam] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (init?.method === 'DELETE' && url.includes('/roles')) {
          deleted.push(url);
          return new Response(null, { status: 204 });
        }
        return new Response('not found', { status: 404 });
      }),
    );

    renderPeople(ocAdminSession(), <PeoplePage repository={new ApiAdminPeopleRepository()} />);

    const samRow = await screen.findByRole('row', { name: /Sam Staff/ });
    const globalChip = within(samRow).getByRole('button', {
      name: 'Revoke OC staff (global) from Sam Staff',
    });
    const eventChip = within(samRow).getByRole('button', {
      name: `Revoke OC staff (event ${eventId}) from Sam Staff`,
    });
    expect(globalChip).toBeVisible();
    expect(eventChip).toBeVisible();
    expect(globalChip.textContent).toContain('global');
    expect(eventChip.textContent).toContain(eventId.slice(0, 8));
    expect(eventChip.textContent).not.toContain('global');

    await user.click(eventChip);
    expect(screen.getByRole('dialog')).toHaveTextContent(
      `Revoke OC staff (event ${eventId}) from Sam Staff`,
    );
    await user.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(deleted).toHaveLength(1));
    expect(deleted[0]).toContain(`/v1/admin/people/${MOCK_STAFF_ID}/roles/oc_staff`);
    expect(deleted[0]).toContain(`eventId=${eventId}`);
    expect(deleted[0]).not.toContain('eventId=undefined');
  });

  it('shows the invite form for an oc_admin', async () => {
    const user = userEvent.setup();
    renderPeople(ocAdminSession());

    expect(await screen.findByRole('button', { name: 'Invite user' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Invite user' }));
    expect(screen.getByRole('dialog', { name: 'Invite user' })).toBeVisible();
    expect(screen.getByLabelText('Role to invite')).toBeVisible();
    expect(within(screen.getByLabelText('Role to invite')).queryByText(/^participant$/i)).not.toBeInTheDocument();
  });

  it('explains USER_ALREADY_EXISTS instead of a generic failure', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/admin/people/invite') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              code: 'USER_ALREADY_EXISTS',
              detail: 'admin.invite.already_exists',
            }),
            { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
          );
        }
        if (url.includes('/v1/admin/people') && !url.includes('/roles')) {
          return new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );

    renderPeople(ocAdminSession(), <PeoplePage repository={new ApiAdminPeopleRepository()} />);
    await user.click(await screen.findByRole('button', { name: 'Invite user' }));
    await user.type(screen.getByLabelText('Email'), 'sam.staff@example.com');
    await user.type(screen.getByLabelText('First name'), 'Sam');
    await user.type(screen.getByLabelText('Last name'), 'Staff');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This email already has an account. Grant a role on their existing row instead of inviting again.',
    );
  });

  it('offers Resend invite only for an invited person who has not signed in', async () => {
    renderPeople(ocAdminSession());

    const invited = await screen.findByRole('row', { name: /Ivy Invited/ });
    expect(within(invited).getByRole('button', { name: 'Resend invite' })).toBeVisible();

    const sam = screen.getByRole('row', { name: /Sam Staff/ });
    expect(within(sam).queryByRole('button', { name: 'Resend invite' })).not.toBeInTheDocument();
  });

  it('warns that resending replaces the temporary password before sending', async () => {
    const user = userEvent.setup();
    renderPeople(ocAdminSession());

    const invited = await screen.findByRole('row', { name: /Ivy Invited/ });
    await user.click(within(invited).getByRole('button', { name: 'Resend invite' }));

    const dialog = screen.getByRole('dialog', { name: 'Resend invitation?' });
    expect(dialog).toHaveTextContent('replaces the temporary password');
    expect(dialog).toHaveTextContent('will stop working');

    await user.click(within(dialog).getByRole('button', { name: 'Resend invite' }));
    expect(await screen.findByText(/Invitation sent to ivy.invited@example.com/)).toBeVisible();
    expect(screen.getByText(/check spam/)).toBeVisible();
  });

  it('shows the invite dialog and a confirmation toast on invite', async () => {
    const user = userEvent.setup();
    renderPeople(ocAdminSession());

    await user.click(await screen.findByRole('button', { name: 'Invite user' }));
    const dialog = screen.getByRole('dialog', { name: 'Invite user' });
    await user.type(within(dialog).getByLabelText('Email'), 'new.oc@example.com');
    await user.type(within(dialog).getByLabelText('First name'), 'New');
    await user.type(within(dialog).getByLabelText('Last name'), 'Reviewer');
    await user.click(within(dialog).getByRole('button', { name: 'Send invitation' }));

    const toast = (await screen.findByText('Invitation sent')).closest('[role="status"]');
    expect(toast).not.toBeNull();
    expect(within(toast as HTMLElement).getByText('new.oc@example.com')).toBeVisible();
  });

  it('explains INVITE_ALREADY_ACCEPTED, PERSON_NOT_FOUND, and COGNITO_ADMIN_UNAVAILABLE on resend', async () => {
    const user = userEvent.setup();
    const ivy = {
      id: '55555555-5555-4555-8555-555555555555',
      givenName: 'Ivy',
      familyName: 'Invited',
      email: 'ivy.invited@example.com',
      profileStatus: 'placeholder',
      roles: [{ roleCode: 'oc_staff', eventId: null }],
    };
    const problems = [
      {
        code: 'INVITE_ALREADY_ACCEPTED',
        detail: 'admin.invite.already_accepted',
        status: 409,
        message: 'This person has already signed in. They should use Forgot password instead of a new invitation.',
      },
      {
        code: 'PERSON_NOT_FOUND',
        detail: 'admin.person.not_found',
        status: 404,
        message: 'This person is no longer in the list. Refresh and try again.',
      },
      {
        code: 'COGNITO_ADMIN_UNAVAILABLE',
        detail: 'admin.invite.cognito_unavailable',
        status: 503,
        message: 'Sending or resending invitations needs AWS credentials for Cognito AdminCreateUser.',
      },
    ];
    let attempt = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes(`/v1/admin/people/${ivy.id}/invite/resend`) && init?.method === 'POST') {
          const problem = problems[attempt] ?? problems[problems.length - 1];
          attempt += 1;
          return new Response(JSON.stringify({ code: problem.code, detail: problem.detail }), {
            status: problem.status,
            headers: { 'Content-Type': 'application/problem+json' },
          });
        }
        if (url.includes('/v1/admin/people') && !url.includes('/roles') && !url.includes('/invite')) {
          return new Response(JSON.stringify({ items: [ivy] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );

    renderPeople(ocAdminSession(), <PeoplePage repository={new ApiAdminPeopleRepository()} />);

    for (const problem of problems) {
      const row = await screen.findByRole('row', { name: /Ivy Invited/ });
      await user.click(within(row).getByRole('button', { name: 'Resend invite' }));
      const dialog = await screen.findByRole('dialog', { name: 'Resend invitation?' });
      await user.click(within(dialog).getByRole('button', { name: 'Resend invite' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(problem.message);
    }
  });

  it('offers Remove only for a purgeable invited person', async () => {
    renderPeople(ocAdminSession());

    const invited = await screen.findByRole('row', { name: /Ivy Invited/ });
    expect(within(invited).getByRole('button', { name: 'Remove' })).toBeVisible();

    const sam = screen.getByRole('row', { name: /Sam Staff/ });
    expect(within(sam).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('confirms removal and mentions Cognito before deleting a purgeable person', async () => {
    const user = userEvent.setup();
    renderPeople(ocAdminSession());

    const invited = await screen.findByRole('row', { name: /Ivy Invited/ });
    await user.click(within(invited).getByRole('button', { name: 'Remove' }));

    const dialog = screen.getByRole('dialog', { name: 'Remove Ivy Invited?' });
    expect(dialog).toHaveTextContent('Their Cognito account will be deleted too.');

    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(screen.queryByRole('row', { name: /Ivy Invited/ })).not.toBeInTheDocument(),
    );
  });

  it('shows the purge refusal reason from the API', async () => {
    const user = userEvent.setup();
    const ivy = {
      id: MOCK_INVITED_ID,
      givenName: 'Ivy',
      familyName: 'Invited',
      email: 'ivy.invited@example.com',
      profileStatus: 'placeholder',
      roles: [{ roleCode: 'oc_staff', eventId: null }],
      purgeable: true,
      purgeBlockers: [],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes(`/v1/admin/people/${ivy.id}`) && init?.method === 'DELETE') {
          return new Response(
            JSON.stringify({
              code: 'PURGE_BLOCKED',
              detail: 'This person has a registration order.',
            }),
            { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
          );
        }
        if (url.includes('/v1/admin/people') && !url.includes('/roles') && !url.includes('/invite')) {
          return new Response(JSON.stringify({ items: [ivy] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );

    renderPeople(ocAdminSession(), <PeoplePage repository={new ApiAdminPeopleRepository()} />);

    const row = await screen.findByRole('row', { name: /Ivy Invited/ });
    await user.click(within(row).getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove Ivy Invited?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This person has a registration order.');
  });
});
