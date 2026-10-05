import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import { useAuthStore } from '../store/authStore';
import ProfilePage from './ProfilePage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeEach(() => {
  useAuthStore.getState().clearAccessToken();
  mockNavigate.mockClear();
});

describe('ProfilePage', () => {
  it('shows a login prompt when logged out', () => {
    renderWithProviders(<ProfilePage />);

    expect(screen.getByText(/to view your profile/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('shows the fetched profile when logged in, fields read-only until Edit is clicked', async () => {
    useAuthStore.getState().setAccessToken('test-token');

    renderWithProviders(<ProfilePage />);

    expect(
      await screen.findByRole('heading', { name: 'Welcome, Ash' }),
    ).toBeInTheDocument();
    expect(screen.getByText('tester@example.com')).toBeInTheDocument();
    // Computed the same way the component formats it (toLocaleDateString,
    // local timezone) rather than hardcoded — date_joined is a real
    // timestamp, so which calendar day it lands on for a viewer near
    // midnight UTC genuinely depends on the runner's own timezone, same as
    // any other local-time-converted moment.
    const expectedDate = new Date('2026-01-15T00:00:00Z').toLocaleDateString(
      undefined,
      { year: 'numeric', month: 'long', day: 'numeric' },
    );
    expect(
      screen.getByText(`Member since ${expectedDate}`),
    ).toBeInTheDocument();

    // Plain text, not inputs — nothing is editable until Edit is clicked.
    expect(screen.getByText('ash')).toBeInTheDocument();
    expect(screen.getByText('Ash')).toBeInTheDocument();
    expect(screen.getByText('Ketchum')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(3);
  });

  it('falls back to the username in the welcome heading when no first name is set', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/me/`, () => {
        return HttpResponse.json({
          email: 'tester@example.com',
          username: 'ash',
          first_name: '',
          last_name: '',
          is_verified: true,
          date_joined: '2026-01-15T00:00:00Z',
          has_usable_password: true,
        });
      }),
    );

    renderWithProviders(<ProfilePage />);

    expect(
      await screen.findByRole('heading', { name: 'Welcome, ash' }),
    ).toBeInTheDocument();
  });

  it('edits and saves the username independently', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.patch(`${BASE_URL}/api/v1/me/`, async ({ request }) => {
        const body = (await request.json()) as { username?: string };
        expect(body).toEqual({ username: 'red' });
        return HttpResponse.json({
          email: 'tester@example.com',
          username: 'red',
          first_name: 'Ash',
          last_name: 'Ketchum',
          is_verified: true,
          date_joined: '2026-01-15T00:00:00Z',
          has_usable_password: true,
        });
      }),
    );

    renderWithProviders(<ProfilePage />);
    await screen.findByText('ash');

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await userEvent.click(editButtons[0]); // Username is the first row.

    const input = screen.getByLabelText('Username');
    await userEvent.clear(input);
    await userEvent.type(input, 'red');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    // Back to read-only, showing the new value.
    expect(await screen.findByText('red')).toBeInTheDocument();
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
  });

  it('only one field is editable at a time', async () => {
    useAuthStore.getState().setAccessToken('test-token');

    renderWithProviders(<ProfilePage />);
    await screen.findByText('ash');

    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);

    // Username's row is now a Save/Cancel form with no Edit button, leaving
    // First name's and Last name's — click whichever is first. Opening it
    // must close Username's edit instead of leaving both open together.
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('cancelling an edit discards the change and leaves the field read-only', async () => {
    useAuthStore.getState().setAccessToken('test-token');

    renderWithProviders(<ProfilePage />);
    await screen.findByText('ash');

    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    const input = screen.getByLabelText('Username');
    await userEvent.clear(input);
    await userEvent.type(input, 'somethingelse');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
    expect(screen.getByText('ash')).toBeInTheDocument();
    expect(screen.queryByText('somethingelse')).not.toBeInTheDocument();
  });

  it('shows a backend error for a username already taken', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.patch(`${BASE_URL}/api/v1/me/`, () => {
        return HttpResponse.json(
          { username: ['This field must be unique.'] },
          { status: 400 },
        );
      }),
    );

    renderWithProviders(<ProfilePage />);
    await screen.findByText('ash');

    await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('This field must be unique.'),
    ).toBeInTheDocument();
  });

  it('shows the change-password form for an account with a usable password', async () => {
    useAuthStore.getState().setAccessToken('test-token');

    renderWithProviders(<ProfilePage />);

    expect(
      await screen.findByLabelText('Current password'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/signed in with Google/)).not.toBeInTheDocument();
  });

  it('changes the password successfully', async () => {
    useAuthStore.getState().setAccessToken('test-token');

    renderWithProviders(<ProfilePage />);
    await screen.findByLabelText('Current password');

    await userEvent.type(
      screen.getByLabelText('Current password'),
      'old-pass123!',
    );
    await userEvent.type(
      screen.getByLabelText('New password'),
      'a-new-strong-passw0rd!',
    );
    await userEvent.type(
      screen.getByLabelText('Confirm new password'),
      'a-new-strong-passw0rd!',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Change password' }),
    );

    expect(await screen.findByText('Password changed.')).toBeInTheDocument();
  });

  it('shows a mismatch error without calling the API', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    let requested = false;
    server.use(
      http.post(`${BASE_URL}/api/v1/me/change-password/`, () => {
        requested = true;
        return HttpResponse.json({ detail: 'Password changed.' });
      }),
    );

    renderWithProviders(<ProfilePage />);
    await screen.findByLabelText('Current password');

    await userEvent.type(
      screen.getByLabelText('Current password'),
      'old-pass123!',
    );
    await userEvent.type(screen.getByLabelText('New password'), 'new-pass!');
    await userEvent.type(
      screen.getByLabelText('Confirm new password'),
      'different!',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Change password' }),
    );

    expect(
      await screen.findByText("Passwords don't match."),
    ).toBeInTheDocument();
    expect(requested).toBe(false);
  });

  it('shows the backend error on a wrong current password', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.post(`${BASE_URL}/api/v1/me/change-password/`, () => {
        return HttpResponse.json(
          { detail: 'Current password is incorrect.' },
          { status: 400 },
        );
      }),
    );

    renderWithProviders(<ProfilePage />);
    await screen.findByLabelText('Current password');

    await userEvent.type(
      screen.getByLabelText('Current password'),
      'wrong-password',
    );
    await userEvent.type(
      screen.getByLabelText('New password'),
      'a-new-strong-passw0rd!',
    );
    await userEvent.type(
      screen.getByLabelText('Confirm new password'),
      'a-new-strong-passw0rd!',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Change password' }),
    );

    expect(
      await screen.findByText('Current password is incorrect.'),
    ).toBeInTheDocument();
  });

  it('shows a set-a-password link for a Google-only account', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/me/`, () => {
        return HttpResponse.json({
          email: 'google-user@example.com',
          username: 'redgoogle',
          first_name: 'Red',
          last_name: '',
          is_verified: true,
          date_joined: '2026-01-15T00:00:00Z',
          has_usable_password: false,
        });
      }),
    );

    renderWithProviders(<ProfilePage />);

    expect(
      await screen.findByText(/signed in with Google/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Set a password' }),
    ).toHaveAttribute('href', '/forgot-password');
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
  });

  it('opens a confirm dialog before logging out', async () => {
    useAuthStore.getState().setAccessToken('test-token');

    renderWithProviders(<ProfilePage />);
    await screen.findByText('ash');

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

    expect(
      await screen.findByText('Log out of your account?'),
    ).toBeInTheDocument();
    // Logging out hasn't actually happened yet.
    expect(useAuthStore.getState().accessToken).toBe('test-token');
  });

  it('cancelling the confirm dialog keeps the session', async () => {
    useAuthStore.getState().setAccessToken('test-token');

    renderWithProviders(<ProfilePage />);
    await screen.findByText('ash');
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByText('Log out of your account?');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.queryByText('Log out of your account?'),
    ).not.toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBe('test-token');
  });

  it('confirming logs out, clears the token, and navigates home', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.post(`${BASE_URL}/api/v1/token/logout/`, () => {
        return new HttpResponse(null, { status: 205 });
      }),
    );

    renderWithProviders(<ProfilePage />);
    await screen.findByText('ash');
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByText('Log out of your account?');

    await userEvent.click(
      screen.getAllByRole('button', { name: 'Log out' })[1],
    );

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBeNull());
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
