import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { getCard, getCards, getSets, getTypes } from './cards';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

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
