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
    expect(screen.getByText('#4 · Ken Sugimori')).toBeInTheDocument();
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

  it('offers name suggestions scoped to the selected set, and filling one in triggers the search', async () => {
    let capturedNamesSet: string | null = null;
    server.use(
      http.get(`${BASE_URL}/api/v1/card-names/`, ({ request }) => {
        const url = new URL(request.url);
        capturedNamesSet = url.searchParams.get('set');
        return HttpResponse.json(['Piplup']);
      }),
    );
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
    await userEvent.click(
      await screen.findByRole('button', { name: 'Expand Base' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Base' }));

    await userEvent.type(
      screen.getByPlaceholderText('Search by name...'),
      'pi',
    );
    await waitFor(() => expect(capturedNamesSet).toBe('1'));

    await userEvent.click(
      await screen.findByRole('option', { name: 'Piplup' }),
    );

    await waitFor(() => expect(capturedSearch).toBe('Piplup'), {
      timeout: 1000,
    });
  });

  it('does not let a delayed search-debounce commit clobber a filter picked in the meantime', async () => {
    let capturedParams: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE_URL}/api/v1/cards/`, ({ request }) => {
        capturedParams = new URL(request.url).searchParams;
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
    // Pick a set immediately after typing, before the 400ms search debounce
    // has had a chance to fire.
    await userEvent.click(
      await screen.findByRole('button', { name: 'Expand Base' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Base' }));

    await waitFor(
      () => {
        expect(capturedParams?.get('search')).toBe('Char');
        expect(capturedParams?.get('set')).toBe('1');
      },
      { timeout: 1000 },
    );
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

  it('offers rarities fetched from the API as dropdown options and sends the chosen one', async () => {
    let capturedRarity: string | null = null;
    server.use(
      http.get(`${BASE_URL}/api/v1/cards/`, ({ request }) => {
        capturedRarity = new URL(request.url).searchParams.get('rarity');
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      }),
    );

    renderWithProviders(<CardListPage />);
    await screen.findByRole('option', { name: 'Rare Holo' });
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Rarity' }),
      'Rare Holo',
    );

    await waitFor(() => expect(capturedRarity).toBe('Rare Holo'));
  });

  it('scopes the rarity/type/supertype dropdown requests to the selected set', async () => {
    let capturedRaritiesSet: string | null = null;
    let capturedTypesSet: string | null = null;
    let capturedSupertypesSet: string | null = null;
    server.use(
      http.get(`${BASE_URL}/api/v1/rarities/`, ({ request }) => {
        capturedRaritiesSet = new URL(request.url).searchParams.get('set');
        return HttpResponse.json(['Common']);
      }),
      http.get(`${BASE_URL}/api/v1/types/`, ({ request }) => {
        capturedTypesSet = new URL(request.url).searchParams.get('set');
        return HttpResponse.json([{ id: 1, name: 'Fire' }]);
      }),
      http.get(`${BASE_URL}/api/v1/supertypes/`, ({ request }) => {
        capturedSupertypesSet = new URL(request.url).searchParams.get('set');
        return HttpResponse.json(['Pokémon']);
      }),
    );

    renderWithProviders(<CardListPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Expand Base' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Base' }));

    await waitFor(() => {
      expect(capturedRaritiesSet).toBe('1');
      expect(capturedTypesSet).toBe('1');
      expect(capturedSupertypesSet).toBe('1');
    });
  });

  it('resets the rarity filter to "All rarities" if it becomes invalid after switching sets', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/rarities/`, ({ request }) => {
        const set = new URL(request.url).searchParams.get('set');
        return HttpResponse.json(set ? ['Common'] : ['Common', 'Rare Holo EX']);
      }),
    );
    let capturedRarity: string | null = null;
    server.use(
      http.get(`${BASE_URL}/api/v1/cards/`, ({ request }) => {
        capturedRarity = new URL(request.url).searchParams.get('rarity');
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      }),
    );

    renderWithProviders(<CardListPage />);
    await screen.findByRole('option', { name: 'Rare Holo EX' });
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Rarity' }),
      'Rare Holo EX',
    );
    await waitFor(() => expect(capturedRarity).toBe('Rare Holo EX'));

    await userEvent.click(
      await screen.findByRole('button', { name: 'Expand Base' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Base' }));

    await waitFor(() => expect(capturedRarity).toBeNull());
    expect(screen.getByRole('combobox', { name: 'Rarity' })).toHaveValue('');
  });

  it('disables "Reset filters" until a filter is applied, then clears filters without touching the selected set', async () => {
    let capturedParams: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE_URL}/api/v1/cards/`, ({ request }) => {
        capturedParams = new URL(request.url).searchParams;
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      }),
    );

    renderWithProviders(<CardListPage />);
    expect(
      screen.getByRole('button', { name: 'Reset filters' }),
    ).toBeDisabled();

    // Pick a set, then apply a rarity filter and a search term within it.
    await userEvent.click(
      await screen.findByRole('button', { name: 'Expand Base' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Base' }));
    await screen.findByRole('option', { name: 'Rare Holo' });
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Rarity' }),
      'Rare Holo',
    );
    const searchInput = screen.getByPlaceholderText('Search by name...');
    await userEvent.type(searchInput, 'Char');
    await waitFor(() =>
      expect(capturedParams?.get('rarity')).toBe('Rare Holo'),
    );

    const resetButton = screen.getByRole('button', { name: 'Reset filters' });
    expect(resetButton).toBeEnabled();
    await userEvent.click(resetButton);

    await waitFor(() => {
      expect(capturedParams?.get('rarity')).toBeNull();
      expect(capturedParams?.get('search')).toBeNull();
      expect(capturedParams?.get('set')).toBe('1');
    });
    expect(searchInput).toHaveValue('');
    expect(resetButton).toBeDisabled();
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
