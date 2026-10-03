import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import { useAuthStore } from '../store/authStore';
import ResetPasswordPage from './ResetPasswordPage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function fillForm(password: string, confirmPassword: string) {
  await userEvent.type(screen.getByLabelText('New password'), password);
  await userEvent.type(
    screen.getByLabelText('Confirm new password'),
    confirmPassword,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
}

beforeEach(() => {
  useAuthStore.getState().clearAccessToken();
});

describe('ResetPasswordPage', () => {
  it('shows a missing-token message when there is no token in the URL', () => {
    renderWithProviders(<ResetPasswordPage />, { route: '/reset-password' });

    expect(
      screen.getByText('This link is missing its reset token.'),
    ).toBeInTheDocument();
  });

  it('resets the password and logs in on success', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/password-reset/confirm/`, () => {
        return HttpResponse.json({ access: 'fresh-access-token' });
      }),
    );

    renderWithProviders(<ResetPasswordPage />, {
      route: '/reset-password?token=good-token',
    });
    await fillForm('a-new-strong-passw0rd!', 'a-new-strong-passw0rd!');

    await waitFor(() =>
      expect(useAuthStore.getState().accessToken).toBe('fresh-access-token'),
    );
  });

  it('rejects mismatched passwords without calling the API', async () => {
    let requested = false;
    server.use(
      http.post(`${BASE_URL}/api/v1/password-reset/confirm/`, () => {
        requested = true;
        return HttpResponse.json({ access: 'fresh-access-token' });
      }),
    );

    renderWithProviders(<ResetPasswordPage />, {
      route: '/reset-password?token=good-token',
    });
    await fillForm('a-new-strong-passw0rd!', 'different!');

    expect(
      await screen.findByText("Passwords don't match."),
    ).toBeInTheDocument();
    expect(requested).toBe(false);
  });

  it('shows the backend error and a way to request a new link for an invalid token', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/password-reset/confirm/`, () => {
        return HttpResponse.json(
          { detail: 'This password reset link is invalid or has expired.' },
          { status: 400 },
        );
      }),
    );

    renderWithProviders(<ResetPasswordPage />, {
      route: '/reset-password?token=bad-token',
    });
    await fillForm('a-new-strong-passw0rd!', 'a-new-strong-passw0rd!');

    expect(
      await screen.findByText(
        'This password reset link is invalid or has expired.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Request a new reset link' }),
    ).toHaveAttribute('href', '/forgot-password');
  });
});
