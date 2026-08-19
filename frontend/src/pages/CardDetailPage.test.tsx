import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import CardDetailPage from './CardDetailPage';

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
});
