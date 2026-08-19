import { http, HttpResponse } from 'msw';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

const mockSet = { id: 1, name: 'Base', series: 'Base' };

const mockCardListItem = {
  id: 1,
  name: 'Charizard',
  number: '4',
  rarity: 'Rare Holo',
  supertype: 'Pokémon',
  image_small: 'https://example.com/small.png',
  set: mockSet,
  types: [{ id: 1, name: 'Fire' }],
};

const mockCardDetail = {
  ...mockCardListItem,
  hp: '120',
  language: 'en',
  image_large: 'https://example.com/large.png',
  artist: 'Ken Sugimori',
  national_pokedex_numbers: [6],
  subtypes: ['Stage 2'],
  evolves_from: 'Charmeleon',
  evolves_to: [],
  tcgplayer_url: 'https://example.com/tcgplayer',
  cardmarket_url: 'https://example.com/cardmarket',
  details: {},
  attacks: [
    {
      name: 'Fire Spin',
      cost: ['Fire', 'Fire'],
      converted_energy_cost: 2,
      damage: '100',
      text: 'Discard 2 Energy attached to this Pokémon.',
      order: 0,
    },
  ],
  weaknesses: [{ type: { id: 2, name: 'Water' }, value: '×2' }],
  resistances: [],
};

export const handlers = [
  http.get(`${BASE_URL}/api/v1/health/`, () => {
    return HttpResponse.json({ status: 'ok' });
  }),

  http.get(`${BASE_URL}/api/v1/cards/`, () => {
    return HttpResponse.json({
      count: 1,
      next: null,
      previous: null,
      results: [mockCardListItem],
    });
  }),

  http.get(`${BASE_URL}/api/v1/cards/:id/`, () => {
    return HttpResponse.json(mockCardDetail);
  }),

  http.get(`${BASE_URL}/api/v1/sets/`, () => {
    return HttpResponse.json([
      {
        ...mockSet,
        tcg_id: 'base1',
        release_date: '1999-01-09',
        language: 'en',
        image_symbol: '',
        image_logo: '',
      },
    ]);
  }),

  http.get(`${BASE_URL}/api/v1/types/`, () => {
    return HttpResponse.json([
      { id: 1, name: 'Fire' },
      { id: 2, name: 'Water' },
    ]);
  }),
];
