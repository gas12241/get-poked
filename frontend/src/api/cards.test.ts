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

  it('also matches mid-name, not just as a prefix', () => {
    // See docs/decisions.md #046 — the exact case reported: "Black" should
    // find "SM Black Star Promos" even though the name doesn't start with
    // it.
    const sets = ['SM Black Star Promos', 'Jungle'].map(makeSet);
    expect(filterSetNameSuggestions(sets, 'black')).toEqual([
      'SM Black Star Promos',
    ]);
  });

  it('prefers shorter names over longer ones sharing a common suffix, not pure alphabetical order', () => {
    // Real bug found via live testing: a plain alphabetical cap for "black"
    // pushed "SM Black Star Promos" out of the top 8 entirely, crowded out
    // by earlier-alphabet era prefixes sharing the same "Black Star
    // Promos" suffix (BW, DP, HGSS, Nintendo, ...). Shortest-first surfaces
    // it.
    const names = [
      'Black & White',
      'Black Bolt',
      'BW Black Star Promos',
      'DP Black Star Promos',
      'HGSS Black Star Promos',
      'Nintendo Black Star Promos',
      'Pitch Black',
      'Scarlet & Violet Black Star Promos',
      'SM Black Star Promos',
      'SWSH Black Star Promos',
      'Wizards Black Star Promos',
      'XY Black Star Promos',
    ];
    const sets = names.map(makeSet);
    expect(filterSetNameSuggestions(sets, 'black')).toContain(
      'SM Black Star Promos',
    );
  });

  it('returns nothing for an empty or whitespace-only search', () => {
    const sets = ['Base'].map(makeSet);
    expect(filterSetNameSuggestions(sets, '')).toEqual([]);
    expect(filterSetNameSuggestions(sets, '   ')).toEqual([]);
  });

  it('dedupes repeated set names and caps at 8, alphabetical among equal lengths', () => {
    // 9 unique same-length names (A-I) plus a duplicate "Set A" — with
    // every name the same length, this falls back entirely to the
    // alphabetical tiebreak. If the duplicate weren't deduped before the
    // top-8 cap, "Set A" would appear twice and "Set H" would be pushed
    // out instead.
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
