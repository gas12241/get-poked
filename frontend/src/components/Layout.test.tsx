import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
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
        <Route path="/login" element={<p>Login page content</p>} />
        <Route path="/signup" element={<p>Signup page content</p>} />
        <Route path="/profile" element={<p>Profile page content</p>} />
        <Route path="/collection" element={<p>Collection page content</p>} />
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
  });

  it('hides the Profile link when logged out', () => {
    renderLayoutAt('/');

    expect(
      screen.queryByRole('link', { name: 'Profile' }),
    ).not.toBeInTheDocument();
  });

  it("shows the user's username as the nav link once their profile loads", async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/me/`, () => {
        return HttpResponse.json({
          email: 'tester@example.com',
          username: 'pikachu',
          first_name: '',
          last_name: '',
          is_verified: true,
          date_joined: '2026-01-15T00:00:00Z',
          has_usable_password: true,
        });
      }),
    );

    renderLayoutAt('/');

    expect(
      await screen.findByRole('link', { name: 'pikachu' }),
    ).toHaveAttribute('href', '/profile');
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

  it('highlights Log in while on the login page', () => {
    renderLayoutAt('/login');

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Sign up' })).not.toHaveClass(
      'active',
    );
  });

  it('highlights Sign up while on the signup page', () => {
    renderLayoutAt('/signup');

    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Log in' })).not.toHaveClass(
      'active',
    );
  });

  it('hides the Collection link when logged out', () => {
    renderLayoutAt('/');

    expect(
      screen.queryByRole('link', { name: 'Collection' }),
    ).not.toBeInTheDocument();
  });

  it('shows the Collection link when logged in', () => {
    useAuthStore.getState().setAccessToken('test-token');

    renderLayoutAt('/');

    expect(screen.getByRole('link', { name: 'Collection' })).toHaveAttribute(
      'href',
      '/collection',
    );
  });

  it('highlights Collection while on the collection page', () => {
    useAuthStore.getState().setAccessToken('test-token');

    renderLayoutAt('/collection');

    expect(screen.getByRole('link', { name: 'Collection' })).toHaveClass(
      'active',
    );
    expect(screen.getByRole('link', { name: 'Cards' })).not.toHaveClass(
      'active',
    );
  });
});

// Below useIsMobileNav's own breakpoint, Layout renders the bottom tab bar
// + slim top bar instead of .main-nav — never both at once (see
// docs/decisions.md #103), so these reuse the exact same accessible-name
// queries as the desktop tests above without any container-scoping needed.
function mockMobileMatchMedia() {
  return vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
    media: '(max-width: 768px)',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as MediaQueryList);
}

describe('Layout mobile nav', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAccessToken();
  });

  it('renders the tab bar instead of the desktop nav', () => {
    const matchMediaSpy = mockMobileMatchMedia();

    renderLayoutAt('/');

    expect(
      screen.getByRole('navigation', { name: 'Primary' }),
    ).toBeInTheDocument();
    expect(document.querySelector('.main-nav')).not.toBeInTheDocument();
    matchMediaSpy.mockRestore();
  });

  it('highlights Quiz in the tab bar while on the quiz page', () => {
    const matchMediaSpy = mockMobileMatchMedia();

    renderLayoutAt('/quiz');

    expect(screen.getByRole('link', { name: 'Quiz' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Cards' })).not.toHaveClass(
      'active',
    );
    matchMediaSpy.mockRestore();
  });

  it('hides the Collection tab when logged out', () => {
    const matchMediaSpy = mockMobileMatchMedia();

    renderLayoutAt('/');

    expect(
      screen.queryByRole('link', { name: 'Collection' }),
    ).not.toBeInTheDocument();
    matchMediaSpy.mockRestore();
  });

  it('shows the Collection tab when logged in', () => {
    useAuthStore.getState().setAccessToken('test-token');
    const matchMediaSpy = mockMobileMatchMedia();

    renderLayoutAt('/');

    expect(screen.getByRole('link', { name: 'Collection' })).toHaveAttribute(
      'href',
      '/collection',
    );
    matchMediaSpy.mockRestore();
  });

  it('shows the brand, account links, and theme toggle in the slim top bar', () => {
    const matchMediaSpy = mockMobileMatchMedia();

    renderLayoutAt('/');

    expect(screen.getByRole('link', { name: 'Get Poked' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Switch to (dark|light) mode/ }),
    ).toBeInTheDocument();
    matchMediaSpy.mockRestore();
  });

  it("shows the user's username in the top bar once logged in", async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/me/`, () => {
        return HttpResponse.json({
          email: 'tester@example.com',
          username: 'pikachu',
          first_name: '',
          last_name: '',
          is_verified: true,
          date_joined: '2026-01-15T00:00:00Z',
          has_usable_password: true,
        });
      }),
    );
    const matchMediaSpy = mockMobileMatchMedia();

    renderLayoutAt('/');

    expect(
      await screen.findByRole('link', { name: 'pikachu' }),
    ).toHaveAttribute('href', '/profile');
    matchMediaSpy.mockRestore();
  });
});
