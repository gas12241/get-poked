import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import Layout from './Layout';

// ScrollRestoration requires a data router (useMatches), which this test's
// plain MemoryRouter/<Routes> setup doesn't provide — and jsdom has no real
// scrolling to verify anyway. The actual data-router case is covered by
// routing.test.tsx.
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, ScrollRestoration: () => null };
});

describe('Layout', () => {
  it('renders the matched child route alongside the disclaimer footer', () => {
    renderWithProviders(
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<p>Page content</p>} />
        </Route>
      </Routes>,
    );

    expect(screen.getByText('Page content')).toBeInTheDocument();
    expect(screen.getByText(/unofficial fan project/i)).toBeInTheDocument();
  });

  it('renders a "Get Poked" brand link pointing back to the Cards page', () => {
    renderWithProviders(
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<p>Page content</p>} />
        </Route>
      </Routes>,
    );

    expect(screen.getByRole('link', { name: 'Get Poked' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
