import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import { useAuthStore } from '../store/authStore';
import ProfilePage from './ProfilePage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

beforeEach(() => {
  useAuthStore.getState().clearAccessToken();
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

  it('shows the fetched profile when logged in', async () => {
    useAuthStore.getState().setAccessToken('test-token');

    renderWithProviders(<ProfilePage />);

    expect(await screen.findByText('tester@example.com')).toBeInTheDocument();
    expect(screen.getByText('Member since January 2026')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ash')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ketchum')).toBeInTheDocument();
  });

  it('saves an edited name', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.patch(`${BASE_URL}/api/v1/me/`, async ({ request }) => {
        const body = (await request.json()) as {
          first_name: string;
          last_name: string;
        };
        return HttpResponse.json({
          email: 'tester@example.com',
          first_name: body.first_name,
          last_name: body.last_name,
          is_verified: true,
          date_joined: '2026-01-15T00:00:00Z',
          has_usable_password: true,
        });
      }),
    );

    renderWithProviders(<ProfilePage />);
    await screen.findByDisplayValue('Ash');

    const firstNameInput = screen.getByLabelText('First name');
    await userEvent.clear(firstNameInput);
    await userEvent.type(firstNameInput, 'Red');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Red')).toBeInTheDocument();
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
});
