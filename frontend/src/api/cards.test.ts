import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import {
  filterSetNameSuggestions,
  getCard,
  getCards,
  getSets,
  getTypes,
} from './cards';
import type { Set } from './cards';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

function makeSet(name: string): Set {
  return {
    id: Math.random(),
    tcg_id: name,
    name,
    series: 'Base',
    release_date: null,
    language: 'en',
    image_symbol: '',
    image_logo: '',
  };
}

describe('cards api', () => {
  it('getCards builds a query string from provided filters, omitting empty ones', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE_URL}/api/v1/cards/`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      }),
    );

    await getCards({ search: 'char', rarity: '', page: 2 });

    const params = new URL(capturedUrl).searchParams;
    expect(params.get('search')).toBe('char');
    expect(params.has('rarity')).toBe(false);
    expect(params.get('page')).toBe('2');
  });

  it('getCard fetches the detail endpoint for the given id', async () => {
    const data = await getCard(1);
    expect(data.name).toBe('Charizard');
  });

  it('getSets returns the unpaginated set list', async () => {
    const data = await getSets();
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('Base');
  });

  it('getTypes returns the unpaginated type list', async () => {
    const data = await getTypes();
    expect(data).toHaveLength(2);
  });
});

describe('filterSetNameSuggestions', () => {
  it('matches by case-insensitive name prefix', () => {
    const sets = ['Base', 'Base Set 2', 'Battle Styles', 'Jungle'].map(makeSet);
    expect(filterSetNameSuggestions(sets, 'ba')).toEqual([
      'Base',
      'Base Set 2',
      'Battle Styles',
    ]);
    expect(filterSetNameSuggestions(sets, 'BA')).toEqual([
      'Base',
      'Base Set 2',
      'Battle Styles',
    ]);
  });

  it('returns nothing for an empty or whitespace-only search', () => {
    const sets = ['Base'].map(makeSet);
    expect(filterSetNameSuggestions(sets, '')).toEqual([]);
    expect(filterSetNameSuggestions(sets, '   ')).toEqual([]);
  });

  it('dedupes repeated set names and caps at 8, sorted alphabetically', () => {
    // 9 unique names (A-I) plus a duplicate "Set A". If the duplicate
    // weren't deduped before the top-8 cap, "Set A" would appear twice and
    // "Set H" would be pushed out instead.
    const names = [
      'Set I',
      'Set B',
      'Set G',
      'Set A',
      'Set F',
      'Set C',
      'Set H',
      'Set D',
      'Set E',
      'Set A',
    ];
    const sets = names.map(makeSet);
    expect(filterSetNameSuggestions(sets, 'set')).toEqual([
      'Set A',
      'Set B',
      'Set C',
      'Set D',
      'Set E',
      'Set F',
      'Set G',
      'Set H',
    ]);
  });
});
