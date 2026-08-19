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

  it('sends the selected set id as a query param', async () => {
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
    await screen.findByRole('option', { name: 'Base' });
    const setSelect = screen.getByRole('combobox', { name: 'Set' });
    await userEvent.selectOptions(setSelect, '1');

    await waitFor(() => expect(capturedSet).toBe('1'));
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
