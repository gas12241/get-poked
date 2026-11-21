import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import QuizAttemptDetailPage from './QuizAttemptDetailPage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

describe('QuizAttemptDetailPage', () => {
  it('renders the full per-question breakdown for a valid attempt', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/quiz-history/:id" element={<QuizAttemptDetailPage />} />
      </Routes>,
      { route: '/quiz-history/1' },
    );

    expect(await screen.findByText('Guess the Card')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 1/)).toBeInTheDocument();
    expect(screen.getByText('Your guess: Charizard')).toBeInTheDocument();
    expect(screen.getByText('Correct answer: Charizard')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Charizard' })).toHaveAttribute(
      'href',
      '/cards/1',
    );
  });

  it('shows an error message for an attempt that fails to load (not found or another user’s)', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz-attempts/:id/`, () => {
        return new HttpResponse(null, { status: 404 });
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/quiz-history/:id" element={<QuizAttemptDetailPage />} />
      </Routes>,
      { route: '/quiz-history/999' },
    );

    expect(
      await screen.findByText("Couldn't load this quiz attempt."),
    ).toBeInTheDocument();
  });

  it('shows a "Back to Quiz" button', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/quiz-history/:id" element={<QuizAttemptDetailPage />} />
      </Routes>,
      { route: '/quiz-history/1' },
    );

    expect(
      await screen.findByRole('button', { name: /Back to Quiz/ }),
    ).toBeInTheDocument();
  });
});
