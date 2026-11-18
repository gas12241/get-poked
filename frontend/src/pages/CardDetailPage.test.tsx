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

  it('defaults to "Back to cards" when arriving with no router state', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/cards/:id" element={<CardDetailPage />} />
      </Routes>,
      { route: '/cards/1' },
    );

    expect(
      await screen.findByRole('button', { name: /Back to cards/ }),
    ).toBeInTheDocument();
  });

  it('says "Back to Horoscope" when arriving from the Horoscope page', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/cards/:id" element={<CardDetailPage />} />
      </Routes>,
      { route: { pathname: '/cards/1', state: { from: 'horoscope' } } },
    );

    expect(
      await screen.findByRole('button', { name: /Back to Horoscope/ }),
    ).toBeInTheDocument();
  });

  it('shows TCGplayer/Cardmarket as icon buttons linking to their real URLs', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/cards/:id" element={<CardDetailPage />} />
      </Routes>,
      { route: '/cards/1' },
    );

    const tcgplayerLink = await screen.findByRole('link', {
      name: 'View on TCGplayer',
    });
    expect(tcgplayerLink).toHaveAttribute(
      'href',
      'https://example.com/tcgplayer',
    );
    expect(tcgplayerLink).toHaveAttribute('target', '_blank');
    expect(tcgplayerLink.querySelector('img')).toHaveAttribute(
      'src',
      'https://www.google.com/s2/favicons?domain=tcgplayer.com&sz=64',
    );

    const cardmarketLink = screen.getByRole('link', {
      name: 'View on Cardmarket',
    });
    expect(cardmarketLink).toHaveAttribute(
      'href',
      'https://example.com/cardmarket',
    );
    expect(cardmarketLink.querySelector('img')).toHaveAttribute(
      'src',
      'https://www.google.com/s2/favicons?domain=cardmarket.com&sz=64',
    );
  });

  it('omits a link entirely when its URL is blank, rather than showing a broken button', async () => {
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
          image_small: 'https://example.com/small.png',
          image_large: 'https://example.com/large.png',
          artist: 'Ken Sugimori',
          set: { id: 1, name: 'Base', series: 'Base', release_date: null },
          types: [],
          national_pokedex_numbers: [],
          subtypes: [],
          evolves_from: '',
          evolves_to: [],
          tcgplayer_url: '',
          cardmarket_url: 'https://example.com/cardmarket',
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

    await screen.findByRole('link', { name: 'View on Cardmarket' });
    expect(
      screen.queryByRole('link', { name: 'View on TCGplayer' }),
    ).not.toBeInTheDocument();
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
