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
