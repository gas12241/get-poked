import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import { useAuthStore } from '../store/authStore';
import LoginPage from './LoginPage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// The real GoogleSignInButton renders nothing without a configured Client
// ID and needs a real browser either way — stubbed as a plain button that
// fires a fake credential, so these tests exercise LoginPage's own handling
// of a successful/failed Google sign-in, not the Google widget itself
// (covered separately by GoogleSignInButton.test.tsx).
vi.mock('../components/GoogleSignInButton', () => ({
  default: ({ onCredential }: { onCredential: (c: string) => void }) => (
    <button
      type="button"
      onClick={() => onCredential('fake-google-credential')}
    >
      Sign in with Google
    </button>
  ),
}));

async function fillAndSubmit(email: string, password: string) {
  await userEvent.type(screen.getByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

beforeEach(() => {
  useAuthStore.getState().clearAccessToken();
});

describe('LoginPage', () => {
  it('logs in successfully and stores the access token', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/token/`, () => {
        return HttpResponse.json({ access: 'real-access-token' });
      }),
    );

    renderWithProviders(<LoginPage />);
    await fillAndSubmit('tester@example.com', 'a-strong-passw0rd!');

    await waitFor(() =>
      expect(useAuthStore.getState().accessToken).toBe('real-access-token'),
    );
  });

  it('shows the backend error message on failure', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/token/`, () => {
        return HttpResponse.json(
          { detail: 'No active account found with the given credentials' },
          { status: 401 },
        );
      }),
    );

    renderWithProviders(<LoginPage />);
    await fillAndSubmit('tester@example.com', 'wrong-password');

    expect(
      await screen.findByText(
        'No active account found with the given credentials',
      ),
    ).toBeInTheDocument();
  });

  it('offers to resend the verification email for an unverified account', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/token/`, () => {
        return HttpResponse.json(
          { detail: 'Please verify your email before logging in.' },
          { status: 400 },
        );
      }),
    );

    renderWithProviders(<LoginPage />);
    await fillAndSubmit('tester@example.com', 'a-strong-passw0rd!');

    const resendButton = await screen.findByRole('button', {
      name: 'Resend verification email',
    });
    await userEvent.click(resendButton);

    expect(
      await screen.findByRole('button', { name: 'Verification email sent' }),
    ).toBeInTheDocument();
  });

  it('links to the signup page', () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
      'href',
      '/signup',
    );
  });

  it('links to the forgot-password page', () => {
    renderWithProviders(<LoginPage />);

    expect(
      screen.getByRole('link', { name: 'Forgot your password?' }),
    ).toHaveAttribute('href', '/forgot-password');
  });

  it('logs in via Google and stores the access token', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/google/`, () => {
        return HttpResponse.json({ access: 'google-access-token' });
      }),
    );

    renderWithProviders(<LoginPage />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Sign in with Google' }),
    );

    await waitFor(() =>
      expect(useAuthStore.getState().accessToken).toBe('google-access-token'),
    );
  });
});
