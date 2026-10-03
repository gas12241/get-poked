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
  image_large: 'https://example.com/large.png',
  artist: 'Ken Sugimori',
  set: mockSet,
  types: [{ id: 1, name: 'Fire' }],
};

const HOROSCOPE_SLOTS: { supertype: string; rarity_tier: string }[] = [
  { supertype: 'Pokémon', rarity_tier: 'common' },
  { supertype: 'Pokémon', rarity_tier: 'mid' },
  { supertype: 'Pokémon', rarity_tier: 'common' },
  { supertype: 'Pokémon', rarity_tier: 'chase' },
  { supertype: 'Pokémon', rarity_tier: 'common' },
  { supertype: 'Trainer', rarity_tier: 'common' },
  { supertype: 'Energy', rarity_tier: 'common' },
];

export function mockHoroscopePull(pullDate: string, id = 1) {
  return {
    id,
    pull_date: pullDate,
    pulled_at: `${pullDate}T00:00:00Z`,
    cards: HOROSCOPE_SLOTS.map((slot, order) => ({
      card: {
        ...mockCardListItem,
        id: order + 1,
        name: `Card ${order}`,
        supertype: slot.supertype,
      },
      supertype: slot.supertype,
      rarity_tier: slot.rarity_tier,
      order,
    })),
  };
}

const mockCardDetail = {
  ...mockCardListItem,
  hp: '120',
  language: 'en',
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

  http.get(`${BASE_URL}/api/v1/rarities/`, () => {
    return HttpResponse.json(['Common', 'Rare Holo']);
  }),

  http.get(`${BASE_URL}/api/v1/supertypes/`, () => {
    return HttpResponse.json(['Pokémon', 'Trainer', 'Energy']);
  }),

  http.get(`${BASE_URL}/api/v1/card-names/`, () => {
    return HttpResponse.json(['Charizard']);
  }),

  http.get(`${BASE_URL}/api/v1/quiz/`, () => {
    return HttpResponse.json({
      questions: [
        {
          card: 1,
          image: 'https://example.com/masked.png',
          rarity: 'Rare Holo',
          supertype: 'Pokémon',
          types: ['Fire'],
          hp: '120',
          set: { id: 1, name: 'Base' },
        },
      ],
    });
  }),

  http.post(`${BASE_URL}/api/v1/quiz/check/`, () => {
    return HttpResponse.json({ correct: true, answer: 'Charizard' });
  }),

  http.post(`${BASE_URL}/api/v1/quiz-attempts/`, () => {
    return HttpResponse.json({
      id: 1,
      quiz_mode: 'guess_card',
      score: 1,
      total_questions: 1,
      completed_at: '2026-01-01T00:00:00Z',
    });
  }),

  // Defaults: no pulls anywhere, and pulling today creates a fresh 7-card
  // one — individual tests override via server.use() for other states
  // (a specific day already has a pull, an error, ...).
  http.get(`${BASE_URL}/api/v1/horoscope-pull-dates/`, () => {
    return HttpResponse.json({ dates: [] });
  }),

  http.get(`${BASE_URL}/api/v1/horoscope-pulls/:date/`, () => {
    return new HttpResponse(null, { status: 404 });
  }),

  http.post(`${BASE_URL}/api/v1/horoscope/pull/`, () => {
    return HttpResponse.json(mockHoroscopePull('2026-01-01'));
  }),

  // Auth defaults — happy paths; tests override via server.use() for error
  // states (duplicate email, unverified login, expired token, ...). Refresh
  // defaults to "no valid cookie" (401), matching a fresh, logged-out start.
  http.post(`${BASE_URL}/api/v1/register/`, () => {
    return HttpResponse.json({ email: 'new@example.com' }, { status: 201 });
  }),

  http.post(`${BASE_URL}/api/v1/verify-email/`, () => {
    return HttpResponse.json({ access: 'verified-token' });
  }),

  http.post(`${BASE_URL}/api/v1/verify-email/resend/`, () => {
    return HttpResponse.json({
      detail: 'If that account exists, a verification email has been sent.',
    });
  }),

  http.post(`${BASE_URL}/api/v1/token/`, () => {
    return HttpResponse.json({ access: 'test-access-token' });
  }),

  http.post(`${BASE_URL}/api/v1/token/refresh/`, () => {
    return new HttpResponse(null, { status: 401 });
  }),

  http.post(`${BASE_URL}/api/v1/token/logout/`, () => {
    return new HttpResponse(null, { status: 205 });
  }),

  http.post(`${BASE_URL}/api/v1/password-reset/`, () => {
    return HttpResponse.json({
      detail: 'If that account exists, a password reset email has been sent.',
    });
  }),

  http.post(`${BASE_URL}/api/v1/password-reset/confirm/`, () => {
    return HttpResponse.json({ access: 'reset-token' });
  }),

  http.post(`${BASE_URL}/api/v1/google/`, () => {
    return HttpResponse.json({ access: 'google-access-token' });
  }),

  http.get(`${BASE_URL}/api/v1/me/`, () => {
    return HttpResponse.json({
      email: 'tester@example.com',
      first_name: 'Ash',
      last_name: 'Ketchum',
      is_verified: true,
      date_joined: '2026-01-15T00:00:00Z',
      has_usable_password: true,
    });
  }),

  http.patch(`${BASE_URL}/api/v1/me/`, () => {
    return HttpResponse.json({
      email: 'tester@example.com',
      first_name: 'Ash',
      last_name: 'Ketchum',
      is_verified: true,
      date_joined: '2026-01-15T00:00:00Z',
      has_usable_password: true,
    });
  }),

  http.post(`${BASE_URL}/api/v1/me/change-password/`, () => {
    return HttpResponse.json({ detail: 'Password changed.' });
  }),
];
