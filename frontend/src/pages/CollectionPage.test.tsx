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
});
