import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import { useAuthStore } from '../store/authStore';
import CollectionQuickControl from './CollectionQuickControl';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

beforeEach(() => {
  useAuthStore.getState().clearAccessToken();
});

describe('CollectionQuickControl', () => {
  it('renders nothing when logged out', () => {
    renderWithProviders(<CollectionQuickControl cardId={1} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows only a plus button when the card is not yet owned', async () => {
    useAuthStore.getState().setAccessToken('test-token');

    renderWithProviders(<CollectionQuickControl cardId={1} />);

    await screen.findByRole('button', { name: 'Add one to collection' });
    expect(
      screen.queryByRole('button', { name: 'Remove one from collection' }),
    ).not.toBeInTheDocument();
  });

  it('shows both minus and plus once the card is owned', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/by-card/`, () => {
        return HttpResponse.json({ 1: { id: 42, quantity: 3 } });
      }),
    );

    renderWithProviders(<CollectionQuickControl cardId={1} />);

    await screen.findByRole('button', { name: 'Remove one from collection' });
    expect(
      screen.getByRole('button', { name: 'Add one to collection' }),
    ).toBeInTheDocument();
  });

  it('adds the card to the collection when plus is clicked while unowned', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    let requestedCardId: number | undefined;
    server.use(
      http.post(`${BASE_URL}/api/v1/collections/`, async ({ request }) => {
        const body = (await request.json()) as { card_id: number };
        requestedCardId = body.card_id;
        return HttpResponse.json(
          { id: 1, card: {}, quantity: 1, date_added: '2026-01-15T00:00:00Z' },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<CollectionQuickControl cardId={9} />);
    const button = await screen.findByRole('button', {
      name: 'Add one to collection',
    });

    await userEvent.click(button);

    await waitFor(() => expect(requestedCardId).toBe(9));
  });

  it('increments the quantity when plus is clicked while already owned', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    let patchedQuantity: number | undefined;
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/by-card/`, () => {
        return HttpResponse.json({ 1: { id: 42, quantity: 3 } });
      }),
      http.patch(`${BASE_URL}/api/v1/collections/:id/`, async ({ request }) => {
        const body = (await request.json()) as { quantity: number };
        patchedQuantity = body.quantity;
        return HttpResponse.json({
          id: 42,
          card: {},
          quantity: body.quantity,
          date_added: '2026-01-15T00:00:00Z',
        });
      }),
    );

    renderWithProviders(<CollectionQuickControl cardId={1} />);
    const button = await screen.findByRole('button', {
      name: 'Add one to collection',
    });

    await userEvent.click(button);

    await waitFor(() => expect(patchedQuantity).toBe(4));
  });

  it('decrements the quantity when minus is clicked above quantity 1', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    let patchedQuantity: number | undefined;
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/by-card/`, () => {
        return HttpResponse.json({ 1: { id: 42, quantity: 3 } });
      }),
      http.patch(`${BASE_URL}/api/v1/collections/:id/`, async ({ request }) => {
        const body = (await request.json()) as { quantity: number };
        patchedQuantity = body.quantity;
        return HttpResponse.json({
          id: 42,
          card: {},
          quantity: body.quantity,
          date_added: '2026-01-15T00:00:00Z',
        });
      }),
    );

    renderWithProviders(<CollectionQuickControl cardId={1} />);
    const button = await screen.findByRole('button', {
      name: 'Remove one from collection',
    });

    await userEvent.click(button);

    await waitFor(() => expect(patchedQuantity).toBe(2));
  });

  it('removes the entry entirely when minus is clicked at quantity 1, rather than patching to 0', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    let deletedId: string | undefined;
    let patchCalled = false;
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/by-card/`, () => {
        return HttpResponse.json({ 1: { id: 42, quantity: 1 } });
      }),
      http.patch(`${BASE_URL}/api/v1/collections/:id/`, () => {
        patchCalled = true;
        return HttpResponse.json({
          id: 42,
          card: {},
          quantity: 0,
          date_added: '2026-01-15T00:00:00Z',
        });
      }),
      http.delete(`${BASE_URL}/api/v1/collections/:id/`, ({ params }) => {
        deletedId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<CollectionQuickControl cardId={1} />);
    const button = await screen.findByRole('button', {
      name: 'Remove one from collection',
    });

    await userEvent.click(button);

    await waitFor(() => expect(deletedId).toBe('42'));
    expect(patchCalled).toBe(false);
  });

  it('refetches an active cards-list query too, so a card removed on the Owned/Favorites view can disappear without a page refresh', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    let cardsFetchCount = 0;
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/by-card/`, () => {
        return HttpResponse.json({ 1: { id: 42, quantity: 1 } });
      }),
      http.delete(`${BASE_URL}/api/v1/collections/:id/`, () => {
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${BASE_URL}/api/v1/cards/`, () => {
        cardsFetchCount += 1;
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // A sibling consumer of the same ['cards', ...] key the Cards page's
    // Owned/Favorites view actually uses — stands in for that page's own
    // query without pulling in all of CardListPage.
    function CardsListStandIn() {
      useQuery({
        queryKey: ['cards', { owned: true }],
        queryFn: () => fetch(`${BASE_URL}/api/v1/cards/`).then((r) => r.json()),
      });
      return null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CardsListStandIn />
          <CollectionQuickControl cardId={1} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const button = await screen.findByRole('button', {
      name: 'Remove one from collection',
    });
    await waitFor(() => expect(cardsFetchCount).toBe(1));

    await userEvent.click(button);

    await waitFor(() => expect(cardsFetchCount).toBe(2));
  });

  it('refetches an active favorite-ids query too, so a card the server auto-unfavorited on add shows up unfavorited without a page refresh', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    let favoritesFetchCount = 0;
    server.use(
      http.post(`${BASE_URL}/api/v1/collections/`, () => {
        return HttpResponse.json(
          { id: 1, card: {}, quantity: 1, date_added: '2026-01-15T00:00:00Z' },
          { status: 201 },
        );
      }),
      http.get(`${BASE_URL}/api/v1/favorites/by-card/`, () => {
        favoritesFetchCount += 1;
        return HttpResponse.json({});
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // A sibling consumer of the same ['favorite-ids-by-card'] key
    // FavoriteButton actually uses — stands in for it without pulling in
    // the whole component.
    function FavoritesStandIn() {
      useQuery({
        queryKey: ['favorite-ids-by-card'],
        queryFn: () =>
          fetch(`${BASE_URL}/api/v1/favorites/by-card/`).then((r) => r.json()),
      });
      return null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FavoritesStandIn />
          <CollectionQuickControl cardId={9} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const button = await screen.findByRole('button', {
      name: 'Add one to collection',
    });
    await waitFor(() => expect(favoritesFetchCount).toBe(1));

    await userEvent.click(button);

    await waitFor(() => expect(favoritesFetchCount).toBe(2));
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
                  <CollectionQuickControl cardId={7} />
                </Link>
              }
            />
            <Route path="/cards/7" element={<p>Card detail page</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const button = await screen.findByRole('button', {
      name: 'Add one to collection',
    });

    await userEvent.click(button);

    // Give a real navigation every chance to have happened before asserting
    // it didn't — still on the list tile, not the detail route.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText('List tile')).toBeInTheDocument();
    expect(screen.queryByText('Card detail page')).not.toBeInTheDocument();
  });
});
