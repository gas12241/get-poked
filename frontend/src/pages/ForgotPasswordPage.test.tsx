import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import ForgotPasswordPage from './ForgotPasswordPage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

describe('ForgotPasswordPage', () => {
  it('shows a generic confirmation message on submit', async () => {
    renderWithProviders(<ForgotPasswordPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'tester@example.com');
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' }),
    );

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.getByText('tester@example.com')).toBeInTheDocument();
  });

  it('shows the same confirmation message even for a nonexistent account', async () => {
    // The backend always returns 200 with the same generic body regardless
    // of whether the account exists — nothing for the frontend to branch on.
    server.use(
      http.post(`${BASE_URL}/api/v1/password-reset/`, () => {
        return HttpResponse.json({
          detail:
            'If that account exists, a password reset email has been sent.',
        });
      }),
    );

    renderWithProviders(<ForgotPasswordPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'nobody@example.com');
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' }),
    );

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
  });

  it('shows a backend error message on a real failure (e.g. throttled)', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/password-reset/`, () => {
        return HttpResponse.json(
          { detail: 'Request was throttled.' },
          { status: 429 },
        );
      }),
    );

    renderWithProviders(<ForgotPasswordPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'tester@example.com');
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' }),
    );

    expect(
      await screen.findByText('Request was throttled.'),
    ).toBeInTheDocument();
  });

  it('links back to the login page', () => {
    renderWithProviders(<ForgotPasswordPage />);

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});
