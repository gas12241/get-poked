import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import CardDetailPage from './CardDetailPage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

describe('CardDetailPage', () => {
  it('renders full card detail including nested attacks/weaknesses', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/cards/:id" element={<CardDetailPage />} />
      </Routes>,
      { route: '/cards/1' },
    );

    expect(
      await screen.findByRole('heading', { name: 'Charizard' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Base/)).toBeInTheDocument();
    expect(screen.getByText('Ken Sugimori')).toBeInTheDocument();
    expect(screen.getByText(/Fire Spin/)).toBeInTheDocument();
    expect(screen.getByText(/Water \(×2\)/)).toBeInTheDocument();
  });

  it('shows a "No image available" placeholder instead of a broken image when image_large is blank', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/cards/1/`, () => {
        return HttpResponse.json({
          id: 1,
          name: 'Charizard',
          number: '4',
          rarity: 'Rare Holo',
          supertype: 'Pokémon',
          hp: '120',
          language: 'en',
          image_small: '',
          image_large: '',
          artist: 'Ken Sugimori',
          set: { id: 1, name: 'Base', series: 'Base', release_date: null },
          types: [],
          national_pokedex_numbers: [],
          subtypes: [],
          evolves_from: '',
          evolves_to: [],
          tcgplayer_url: '',
          cardmarket_url: '',
          details: {},
          attacks: [],
          weaknesses: [],
          resistances: [],
        });
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/cards/:id" element={<CardDetailPage />} />
      </Routes>,
      { route: '/cards/1' },
    );

    expect(await screen.findByText('No image available')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
