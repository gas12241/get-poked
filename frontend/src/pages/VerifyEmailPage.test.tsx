import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import { useAuthStore } from '../store/authStore';
import VerifyEmailPage from './VerifyEmailPage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

beforeEach(() => {
  useAuthStore.getState().clearAccessToken();
});

describe('VerifyEmailPage', () => {
  it('shows a missing-token message when there is no token in the URL', () => {
    renderWithProviders(<VerifyEmailPage />, { route: '/verify-email' });

    expect(
      screen.getByText('This link is missing its verification token.'),
    ).toBeInTheDocument();
  });

  it('verifies and logs in on a valid token', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/verify-email/`, () => {
        return HttpResponse.json({ access: 'fresh-access-token' });
      }),
    );

    renderWithProviders(<VerifyEmailPage />, {
      route: '/verify-email?token=good-token',
    });

    expect(await screen.findByText("You're verified!")).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBe('fresh-access-token');
  });

  it('shows an error and a resend form for an invalid/expired token', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/verify-email/`, () => {
        return HttpResponse.json(
          { detail: 'This verification link is invalid or has expired.' },
          { status: 400 },
        );
      }),
      http.post(`${BASE_URL}/api/v1/verify-email/resend/`, () => {
        return HttpResponse.json({ detail: 'sent' });
      }),
    );

    renderWithProviders(<VerifyEmailPage />, {
      route: '/verify-email?token=bad-token',
    });

    expect(
      await screen.findByText(
        'This verification link is invalid or has expired.',
      ),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Email'), 'tester@example.com');
    await userEvent.click(
      screen.getByRole('button', { name: 'Send a new link' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Verification email sent' }),
    ).toBeInTheDocument();
  });
});
