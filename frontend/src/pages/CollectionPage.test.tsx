import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import { useAuthStore } from '../store/authStore';
import CollectionPage from './CollectionPage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

const mockCard = {
  id: 1,
  name: 'Charizard',
  number: '4',
  rarity: 'Rare Holo',
  supertype: 'Pokémon',
  image_small: 'https://example.com/small.png',
  image_large: 'https://example.com/large.png',
  artist: 'Ken Sugimori',
  set: { id: 1, name: 'Base', series: 'Base' },
  types: [],
};

beforeEach(() => {
  useAuthStore.getState().clearAccessToken();
});

describe('CollectionPage', () => {
  it('shows a login prompt when logged out', () => {
    renderWithProviders(<CollectionPage />);

    expect(screen.getByText(/to view your collection/)).toBeInTheDocument();
  });

  it('shows the Owned tab by default with an empty state', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/`, () => {
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      }),
    );

    renderWithProviders(<CollectionPage />);

    expect(
      await screen.findByText(
        "You haven't added any cards to your collection yet.",
      ),
    ).toBeInTheDocument();
  });

  it('lists owned cards with a quantity stepper', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/`, () => {
        return HttpResponse.json({
          count: 1,
          next: null,
          previous: null,
          results: [
            {
              id: 10,
              card: mockCard,
              quantity: 2,
              date_added: '2026-01-15T00:00:00Z',
            },
          ],
        });
      }),
    );

    renderWithProviders(<CollectionPage />);

    expect(await screen.findByText('Charizard')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('removing an owned card calls the right endpoint', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    let requestedId = '';
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/`, () => {
        return HttpResponse.json({
          count: 1,
          next: null,
          previous: null,
          results: [
            {
              id: 10,
              card: mockCard,
              quantity: 1,
              date_added: '2026-01-15T00:00:00Z',
            },
          ],
        });
      }),
      http.delete(`${BASE_URL}/api/v1/collections/:id/`, ({ params }) => {
        requestedId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<CollectionPage />);
    await screen.findByText('Charizard');

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(requestedId).toBe('10'));
  });

  it('switches to the Favorites tab and lists favorited cards', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/`, () => {
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      }),
      http.get(`${BASE_URL}/api/v1/favorites/`, () => {
        return HttpResponse.json({
          count: 1,
          next: null,
          previous: null,
          results: [
            { id: 20, card: mockCard, date_added: '2026-01-15T00:00:00Z' },
          ],
        });
      }),
    );

    renderWithProviders(<CollectionPage />);
    await screen.findByText(
      "You haven't added any cards to your collection yet.",
    );

    await userEvent.click(screen.getByRole('button', { name: 'Favorites' }));

    expect(await screen.findByText('Charizard')).toBeInTheDocument();
  });

  it('shows an empty state on the Favorites tab with none favorited', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/favorites/`, () => {
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      }),
    );

    renderWithProviders(<CollectionPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Favorites' }));

    expect(
      await screen.findByText("You haven't favorited any cards yet."),
    ).toBeInTheDocument();
  });

  it('removing a favorite calls the right endpoint', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    let requestedId = '';
    server.use(
      http.get(`${BASE_URL}/api/v1/favorites/`, () => {
        return HttpResponse.json({
          count: 1,
          next: null,
          previous: null,
          results: [
            { id: 20, card: mockCard, date_added: '2026-01-15T00:00:00Z' },
          ],
        });
      }),
      http.delete(`${BASE_URL}/api/v1/favorites/:id/`, ({ params }) => {
        requestedId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<CollectionPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Favorites' }));
    await screen.findByText('Charizard');

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(requestedId).toBe('20'));
  });

  it('switches to the Stats tab and shows the summary numbers', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/stats/`, () => {
        return HttpResponse.json({
          total_unique_cards: 12,
          total_quantity: 18,
          total_favorites: 5,
          by_set: [{ set_id: 1, set_name: 'Base', owned: 8, total: 102 }],
          by_rarity: [{ rarity: 'Rare Holo', count: 3 }],
        });
      }),
    );

    renderWithProviders(<CollectionPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Stats' }));

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('Unique cards')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows a set completion row with a progress bar matching the percentage', async () => {
    // owned/total deliberately isn't numerically equal to the resulting
    // percentage (25/50 = 50%, not 25%) — a fixture where they coincided
    // (e.g. owned=25/total=100) would pass even if the component forgot to
    // divide by the total at all, which a first draft of this test did.
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/stats/`, () => {
        return HttpResponse.json({
          total_unique_cards: 8,
          total_quantity: 8,
          total_favorites: 0,
          by_set: [{ set_id: 1, set_name: 'Base', owned: 25, total: 50 }],
          by_rarity: [],
        });
      }),
    );

    renderWithProviders(<CollectionPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Stats' }));

    expect(await screen.findByText('25/50')).toBeInTheDocument();
    const fill = document.querySelector(
      '.collection-stats-bar-fill',
    ) as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('relabels the blank rarity bucket as "Unknown"', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/stats/`, () => {
        return HttpResponse.json({
          total_unique_cards: 1,
          total_quantity: 1,
          total_favorites: 0,
          by_set: [],
          by_rarity: [{ rarity: '', count: 1 }],
        });
      }),
    );

    renderWithProviders(<CollectionPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Stats' }));

    expect(await screen.findByText('Unknown')).toBeInTheDocument();
  });

  it('shows an empty-state message for a brand-new account with nothing owned', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/stats/`, () => {
        return HttpResponse.json({
          total_unique_cards: 0,
          total_quantity: 0,
          total_favorites: 0,
          by_set: [],
          by_rarity: [],
        });
      }),
    );

    renderWithProviders(<CollectionPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Stats' }));

    expect(
      await screen.findByText(
        'Add some cards to your collection to see stats here.',
      ),
    ).toBeInTheDocument();
  });
});
