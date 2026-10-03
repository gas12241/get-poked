import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import { useAuthStore } from '../store/authStore';
import SignupPage from './SignupPage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// See LoginPage.test.tsx for why this is stubbed rather than using the real
// GoogleSignInButton/@react-oauth/google.
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

async function fillForm(
  email: string,
  username: string,
  password: string,
  confirmPassword: string,
) {
  await userEvent.type(screen.getByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('Username'), username);
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.type(
    screen.getByLabelText('Confirm password'),
    confirmPassword,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
}

describe('SignupPage', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAccessToken();
  });

  it('shows a check-your-email message on success, with no auto-login', async () => {
    renderWithProviders(<SignupPage />);
    await fillForm(
      'new@example.com',
      'newuser',
      'a-strong-passw0rd!',
      'a-strong-passw0rd!',
    );

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
  });

  it('rejects mismatched passwords without calling the API', async () => {
    let requested = false;
    server.use(
      http.post(`${BASE_URL}/api/v1/register/`, () => {
        requested = true;
        return HttpResponse.json({ email: 'new@example.com' }, { status: 201 });
      }),
    );

    renderWithProviders(<SignupPage />);
    await fillForm(
      'new@example.com',
      'newuser',
      'a-strong-passw0rd!',
      'different!',
    );

    expect(
      await screen.findByText("Passwords don't match."),
    ).toBeInTheDocument();
    expect(requested).toBe(false);
  });

  it('shows the backend error message on failure (e.g. duplicate email)', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/register/`, () => {
        return HttpResponse.json(
          { email: ['This field must be unique.'] },
          { status: 400 },
        );
      }),
    );

    renderWithProviders(<SignupPage />);
    await fillForm(
      'existing@example.com',
      'newuser',
      'a-strong-passw0rd!',
      'a-strong-passw0rd!',
    );

    expect(
      await screen.findByText('This field must be unique.'),
    ).toBeInTheDocument();
  });

  it('shows a backend error for a username already taken', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/register/`, () => {
        return HttpResponse.json(
          { username: ['This field must be unique.'] },
          { status: 400 },
        );
      }),
    );

    renderWithProviders(<SignupPage />);
    await fillForm(
      'new@example.com',
      'taken',
      'a-strong-passw0rd!',
      'a-strong-passw0rd!',
    );

    expect(
      await screen.findByText('This field must be unique.'),
    ).toBeInTheDocument();
  });

  it('links to the login page', () => {
    renderWithProviders(<SignupPage />);

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('signs up via Google and stores the access token', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/google/`, () => {
        return HttpResponse.json({ access: 'google-access-token' });
      }),
    );

    renderWithProviders(<SignupPage />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Sign in with Google' }),
    );

    await waitFor(() =>
      expect(useAuthStore.getState().accessToken).toBe('google-access-token'),
    );
  });
});
