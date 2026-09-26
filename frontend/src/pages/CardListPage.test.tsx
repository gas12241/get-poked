import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import CardListPage from './CardListPage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

describe('CardListPage', () => {
  it('renders cards fetched from the API', async () => {
    renderWithProviders(<CardListPage />);

    expect(await screen.findByText('Charizard')).toBeInTheDocument();
    expect(
      screen.getByText('Base', { selector: '.card-set' }),
    ).toBeInTheDocument();
  });

  it('sends the search term as a query param after typing', async () => {
    let capturedSearch: string | null = null;
    server.use(
      http.get(`${BASE_URL}/api/v1/cards/`, ({ request }) => {
        capturedSearch = new URL(request.url).searchParams.get('search');
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      }),
    );

    renderWithProviders(<CardListPage />);
    await userEvent.type(
      screen.getByPlaceholderText('Search by name...'),
      'Char',
    );

    await waitFor(() => expect(capturedSearch).toBe('Char'), { timeout: 1000 });
  });

  it('sends the selected set id as a query param when a set is picked from the sidebar', async () => {
    let capturedSet: string | null = null;
    server.use(
      http.get(`${BASE_URL}/api/v1/cards/`, ({ request }) => {
        capturedSet = new URL(request.url).searchParams.get('set');
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      }),
    );

    renderWithProviders(<CardListPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Expand Base' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Base' }));

    await waitFor(() => expect(capturedSet).toBe('1'));
  });

  it('defaults to sorting by name when no set is selected', async () => {
    let capturedOrdering: string | null = null;
    server.use(
      http.get(`${BASE_URL}/api/v1/cards/`, ({ request }) => {
        capturedOrdering = new URL(request.url).searchParams.get('ordering');
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      }),
    );

    renderWithProviders(<CardListPage />);

    await waitFor(() => expect(capturedOrdering).toBe('name'));
  });

  it('defaults to sorting by number once a set is selected, and resets to name when back to All Sets', async () => {
    let capturedOrdering: string | null = null;
    server.use(
      http.get(`${BASE_URL}/api/v1/cards/`, ({ request }) => {
        capturedOrdering = new URL(request.url).searchParams.get('ordering');
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      }),
    );

    renderWithProviders(<CardListPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Expand Base' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Base' }));

    await waitFor(() => expect(capturedOrdering).toBe('number'));

    await userEvent.click(screen.getByRole('button', { name: 'All Sets' }));

    await waitFor(() => expect(capturedOrdering).toBe('name'));
  });

  it('sends the chosen sort field and direction as the ordering param', async () => {
    let capturedOrdering: string | null = null;
    server.use(
      http.get(`${BASE_URL}/api/v1/cards/`, ({ request }) => {
        capturedOrdering = new URL(request.url).searchParams.get('ordering');
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      }),
    );

    renderWithProviders(<CardListPage />);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Sort by' }),
      'number',
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Sort direction' }),
      'desc',
    );

    await waitFor(() => expect(capturedOrdering).toBe('-number'));
  });

  it('disables the Previous button on the first page and enables Next when more pages exist', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/cards/`, () => {
        return HttpResponse.json({
          count: 50,
          next: 'http://localhost/api/v1/cards/?page=2',
          previous: null,
          results: [],
        });
      }),
    );

    renderWithProviders(<CardListPage />);

    expect(await screen.findByText('Previous')).toBeDisabled();
    expect(screen.getByText('Next')).toBeEnabled();
  });
});
