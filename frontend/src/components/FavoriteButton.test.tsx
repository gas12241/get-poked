import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import { useAuthStore } from '../store/authStore';
import FavoriteButton from './FavoriteButton';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

beforeEach(() => {
  useAuthStore.getState().clearAccessToken();
});

describe('FavoriteButton', () => {
  it('renders nothing when logged out', () => {
    renderWithProviders(<FavoriteButton cardId={1} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows an empty star when the card is not favorited', async () => {
    useAuthStore.getState().setAccessToken('test-token');

    renderWithProviders(<FavoriteButton cardId={1} />);

    const button = await screen.findByRole('button', {
      name: 'Add to favorites',
    });
    expect(button).toHaveTextContent('☆');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows a filled star when the card is already favorited', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/favorites/by-card/`, () => {
        return HttpResponse.json({ 1: 42 });
      }),
    );

    renderWithProviders(<FavoriteButton cardId={1} />);

    const button = await screen.findByRole('button', {
      name: 'Remove from favorites',
    });
    expect(button).toHaveTextContent('★');
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('adds the card to favorites when clicked while unfavorited', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    let requestedCardId: number | undefined;
    server.use(
      http.post(`${BASE_URL}/api/v1/favorites/`, async ({ request }) => {
        const body = (await request.json()) as { card_id: number };
        requestedCardId = body.card_id;
        return HttpResponse.json(
          { id: 1, card: {}, date_added: '2026-01-15T00:00:00Z' },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<FavoriteButton cardId={7} />);
    const button = await screen.findByRole('button', {
      name: 'Add to favorites',
    });

    await userEvent.click(button);

    await waitFor(() => expect(requestedCardId).toBe(7));
  });

  it('removes the favorite when clicked while already favorited', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    let requestedId: string | undefined;
    server.use(
      http.get(`${BASE_URL}/api/v1/favorites/by-card/`, () => {
        return HttpResponse.json({ 7: 42 });
      }),
      http.delete(`${BASE_URL}/api/v1/favorites/:id/`, ({ params }) => {
        requestedId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<FavoriteButton cardId={7} />);
    const button = await screen.findByRole('button', {
      name: 'Remove from favorites',
    });

    await userEvent.click(button);

    await waitFor(() => expect(requestedId).toBe('42'));
  });

  it('does not navigate when clicked inside a wrapping Link (list-tile usage)', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route
              path="/"
              element={
                <Link to="/cards/7" className="card-tile">
                  List tile
                  <FavoriteButton cardId={7} />
                </Link>
              }
            />
            <Route path="/cards/7" element={<p>Card detail page</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const button = await screen.findByRole('button', {
      name: 'Add to favorites',
    });

    await userEvent.click(button);

    // Give a real navigation every chance to have happened before asserting
    // it didn't — still on the list tile, not the detail route.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText('List tile')).toBeInTheDocument();
    expect(screen.queryByText('Card detail page')).not.toBeInTheDocument();
  });
});
