import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import { useAuthStore } from '../store/authStore';
import Layout from './Layout';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// ScrollRestoration requires a data router (useMatches), which this test's
// plain MemoryRouter/<Routes> setup doesn't provide — and jsdom has no real
// scrolling to verify anyway. The actual data-router case is covered by
// routing.test.tsx.
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, ScrollRestoration: () => null };
});

function renderLayoutAt(route: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<p>Cards page content</p>} />
        <Route path="/cards/:id" element={<p>Card detail content</p>} />
        <Route path="/quiz" element={<p>Quiz page content</p>} />
      </Route>
    </Routes>,
    { route },
  );
}

describe('Layout', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAccessToken();
  });

  it('shows Log in/Sign up links when logged out', () => {
    renderLayoutAt('/');

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
      'href',
      '/signup',
    );
    expect(
      screen.queryByRole('button', { name: 'Log out' }),
    ).not.toBeInTheDocument();
  });

  it('shows a Log out button when logged in, which clears the token on click', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.post(`${BASE_URL}/api/v1/token/logout/`, () => {
        return new HttpResponse(null, { status: 205 });
      }),
    );

    renderLayoutAt('/');

    expect(
      screen.queryByRole('link', { name: 'Log in' }),
    ).not.toBeInTheDocument();
    const logoutButton = screen.getByRole('button', { name: 'Log out' });

    await userEvent.click(logoutButton);

    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('renders the matched child route alongside the disclaimer footer', () => {
    renderLayoutAt('/');

    expect(screen.getByText('Cards page content')).toBeInTheDocument();
    expect(screen.getByText(/unofficial fan project/i)).toBeInTheDocument();
  });

  it('renders a "Get Poked" brand link pointing back to the Cards page', () => {
    renderLayoutAt('/');

    expect(screen.getByRole('link', { name: 'Get Poked' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('highlights Cards while on the card list', () => {
    renderLayoutAt('/');

    expect(screen.getByRole('link', { name: 'Cards' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Quiz' })).not.toHaveClass(
      'active',
    );
  });

  it('highlights Cards while on a card detail page', () => {
    renderLayoutAt('/cards/5');

    expect(screen.getByRole('link', { name: 'Cards' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Quiz' })).not.toHaveClass(
      'active',
    );
  });

  it('highlights Quiz while on the quiz page', () => {
    renderLayoutAt('/quiz');

    expect(screen.getByRole('link', { name: 'Quiz' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Cards' })).not.toHaveClass(
      'active',
    );
  });
});
