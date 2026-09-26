import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
import Layout from './components/Layout';
import CardListPage from './pages/CardListPage';
import CardDetailPage from './pages/CardDetailPage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Mirrors App.tsx's route tree. Can't import App directly — it builds its
// own createBrowserRouter against the real window.history, which would leak
// state across tests; createMemoryRouter gives each test an isolated history.
function renderApp(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <CardListPage /> },
          { path: '/cards/:id', element: <CardDetailPage /> },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('Cards list -> detail -> back', () => {
  it('restores the previous filters and sort after visiting a card and going back', async () => {
    const requestedParams: URLSearchParams[] = [];
    server.use(
      http.get(`${BASE_URL}/api/v1/cards/`, ({ request }) => {
        requestedParams.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          count: 1,
          next: null,
          previous: null,
          results: [
            {
              id: 1,
              name: 'Charizard',
              number: '4',
              rarity: 'Rare Holo',
              supertype: 'Pokémon',
              image_small: 'https://example.com/small.png',
              artist: 'Ken Sugimori',
              set: { id: 1, name: 'Base', series: 'Base' },
              types: [{ id: 1, name: 'Fire' }],
            },
          ],
        });
      }),
    );

    renderApp('/?set=1&ordering=number');

    await screen.findByText('Charizard');
    await userEvent.click(screen.getByText('Charizard'));

    const backButton = await screen.findByRole('button', {
      name: /back to cards/i,
    });
    await userEvent.click(backButton);

    await screen.findByText('Charizard');
    await waitFor(() => {
      const lastRequest = requestedParams[requestedParams.length - 1];
      expect(lastRequest.get('set')).toBe('1');
      expect(lastRequest.get('ordering')).toBe('number');
    });
  });

  it('resets filters when navigating via the Cards nav link, unlike going back', async () => {
    const requestedParams: URLSearchParams[] = [];
    server.use(
      http.get(`${BASE_URL}/api/v1/cards/`, ({ request }) => {
        requestedParams.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      }),
    );

    renderApp('/?set=1');
    await waitFor(() =>
      expect(requestedParams[requestedParams.length - 1].get('set')).toBe('1'),
    );

    await userEvent.click(screen.getByRole('link', { name: 'Cards' }));

    await waitFor(() =>
      expect(requestedParams[requestedParams.length - 1].get('set')).toBeNull(),
    );
  });

  it('resets filters when clicking the "Get Poked" brand link, same as the Cards nav link', async () => {
    const requestedParams: URLSearchParams[] = [];
    server.use(
      http.get(`${BASE_URL}/api/v1/cards/`, ({ request }) => {
        requestedParams.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      }),
    );

    renderApp('/?set=1');
    await waitFor(() =>
      expect(requestedParams[requestedParams.length - 1].get('set')).toBe('1'),
    );

    await userEvent.click(screen.getByRole('link', { name: 'Get Poked' }));

    await waitFor(() =>
      expect(requestedParams[requestedParams.length - 1].get('set')).toBeNull(),
    );
  });
});
