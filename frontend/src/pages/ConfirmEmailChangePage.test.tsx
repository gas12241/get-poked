import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import ConfirmEmailChangePage from './ConfirmEmailChangePage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

describe('ConfirmEmailChangePage', () => {
  it('shows a missing-token message when there is no token in the URL', () => {
    renderWithProviders(<ConfirmEmailChangePage />, {
      route: '/confirm-email-change',
    });

    expect(
      screen.getByText('This link is missing its confirmation token.'),
    ).toBeInTheDocument();
  });

  it('confirms the change on a valid token and links back to the profile', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/email-change/confirm/`, () => {
        return HttpResponse.json({ detail: 'Email updated.' });
      }),
    );

    renderWithProviders(<ConfirmEmailChangePage />, {
      route: '/confirm-email-change?token=good-token',
    });

    expect(await screen.findByText('Email updated')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to your profile' }),
    ).toHaveAttribute('href', '/profile');
  });

  it('shows the backend error for an invalid/expired token', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/email-change/confirm/`, () => {
        return HttpResponse.json(
          { detail: 'This link is invalid or has expired.' },
          { status: 400 },
        );
      }),
    );

    renderWithProviders(<ConfirmEmailChangePage />, {
      route: '/confirm-email-change?token=bad-token',
    });

    expect(
      await screen.findByText('This link is invalid or has expired.'),
    ).toBeInTheDocument();
  });
});
