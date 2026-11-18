import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import { useAuthStore } from '../store/authStore';
import CollectionControl from './CollectionControl';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

beforeEach(() => {
  useAuthStore.getState().clearAccessToken();
});

describe('CollectionControl', () => {
  it('renders nothing when logged out', () => {
    renderWithProviders(<CollectionControl cardId={1} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows an "Add to collection" button when the card is not owned', async () => {
    useAuthStore.getState().setAccessToken('test-token');

    renderWithProviders(<CollectionControl cardId={1} />);

    expect(
      await screen.findByRole('button', { name: 'Add to collection' }),
    ).toBeInTheDocument();
  });

  it('adds the card to the collection when clicked', async () => {
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

    renderWithProviders(<CollectionControl cardId={9} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add to collection' }),
    );

    await waitFor(() => expect(requestedCardId).toBe(9));
  });

  it('shows a quantity stepper when the card is already owned', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/by-card/`, () => {
        return HttpResponse.json({ 1: { id: 42, quantity: 3 } });
      }),
    );

    renderWithProviders(<CollectionControl cardId={1} />);

    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add to collection' }),
    ).not.toBeInTheDocument();
  });

  it('increasing quantity sends the new total for the right entry', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    let requestedUrl = '';
    let requestedBody: { quantity: number } | undefined;
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/by-card/`, () => {
        return HttpResponse.json({ 1: { id: 42, quantity: 3 } });
      }),
      http.patch(
        `${BASE_URL}/api/v1/collections/:id/`,
        async ({ request, params }) => {
          requestedUrl = params.id as string;
          requestedBody = (await request.json()) as { quantity: number };
          return HttpResponse.json({
            id: 42,
            card: {},
            quantity: 4,
            date_added: '2026-01-15T00:00:00Z',
          });
        },
      ),
    );

    renderWithProviders(<CollectionControl cardId={1} />);
    await screen.findByText('3');

    await userEvent.click(
      screen.getByRole('button', { name: 'Increase quantity' }),
    );

    await waitFor(() => expect(requestedUrl).toBe('42'));
    expect(requestedBody).toEqual({ quantity: 4 });
  });

  it('decreasing below 1 is disallowed', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/by-card/`, () => {
        return HttpResponse.json({ 1: { id: 42, quantity: 1 } });
      }),
    );

    renderWithProviders(<CollectionControl cardId={1} />);
    await screen.findByText('1');

    expect(
      screen.getByRole('button', { name: 'Decrease quantity' }),
    ).toBeDisabled();
  });

  it('removes the entry when Remove is clicked', async () => {
    useAuthStore.getState().setAccessToken('test-token');
    let requestedId = '';
    server.use(
      http.get(`${BASE_URL}/api/v1/collections/by-card/`, () => {
        return HttpResponse.json({ 1: { id: 42, quantity: 2 } });
      }),
      http.delete(`${BASE_URL}/api/v1/collections/:id/`, ({ params }) => {
        requestedId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<CollectionControl cardId={1} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove' }),
    );

    await waitFor(() => expect(requestedId).toBe('42'));
  });
});
