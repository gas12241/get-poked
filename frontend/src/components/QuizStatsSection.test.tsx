import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { mockQuizAttemptStats } from '../mocks/handlers';
import { renderWithProviders } from '../test/renderWithProviders';
import QuizStatsSection from './QuizStatsSection';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

describe('QuizStatsSection', () => {
  it('shows a log-in prompt instead of fetching stats when not authenticated', () => {
    renderWithProviders(<QuizStatsSection isAuthenticated={false} />);

    expect(
      screen.getByText('Log in to see your quiz stats.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
  });

  it('shows "—" rather than 0% for a fresh account with no attempts at all', async () => {
    renderWithProviders(<QuizStatsSection isAuthenticated />);

    expect(await screen.findByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Career')).toBeInTheDocument();
    expect(screen.getAllByText('0 quizzes · —')).toHaveLength(2);
    // Four modes listed per period (Today + Career), all unplayed — each
    // mode row's own accuracy span is exactly "—".
    expect(screen.getAllByText("Guess the Card's Name")).toHaveLength(2);
    expect(screen.getAllByText('—')).toHaveLength(2 * 4);
  });

  it('shows real totals and a per-mode breakdown', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz-attempts/stats/`, () => {
        return HttpResponse.json(
          mockQuizAttemptStats({
            today: {
              attempts: 2,
              correct: 3,
              total_questions: 10,
              accuracy: 0.3,
              by_mode: [
                {
                  mode: 'guess_card',
                  attempts: 2,
                  correct: 3,
                  total_questions: 10,
                  accuracy: 0.3,
                },
                {
                  mode: 'guess_set',
                  attempts: 0,
                  correct: 0,
                  total_questions: 0,
                  accuracy: null,
                },
                {
                  mode: 'guess_hp',
                  attempts: 0,
                  correct: 0,
                  total_questions: 0,
                  accuracy: null,
                },
                {
                  mode: 'guess_set_icon',
                  attempts: 0,
                  correct: 0,
                  total_questions: 0,
                  accuracy: null,
                },
              ],
            },
          }),
        );
      }),
    );

    renderWithProviders(<QuizStatsSection isAuthenticated />);

    // Raw correct/total shown alongside the percentage, not just the
    // percentage alone — user-requested, see docs/decisions.md #098.
    expect(
      await screen.findByText('2 quizzes · 3/10 correct (30%)'),
    ).toBeInTheDocument();
    expect(screen.getByText('3/10 (30%)')).toBeInTheDocument();
    // Career still comes back from the zero-state default in this test's
    // override — proves the two periods render independently.
    expect(screen.getByText('0 quizzes · —')).toBeInTheDocument();
  });

  it('uses singular "quiz" for exactly one attempt', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz-attempts/stats/`, () => {
        return HttpResponse.json(
          mockQuizAttemptStats({
            today: {
              attempts: 1,
              correct: 5,
              total_questions: 5,
              accuracy: 1,
              by_mode: [
                {
                  mode: 'guess_card',
                  attempts: 1,
                  correct: 5,
                  total_questions: 5,
                  accuracy: 1,
                },
                {
                  mode: 'guess_set',
                  attempts: 0,
                  correct: 0,
                  total_questions: 0,
                  accuracy: null,
                },
                {
                  mode: 'guess_hp',
                  attempts: 0,
                  correct: 0,
                  total_questions: 0,
                  accuracy: null,
                },
                {
                  mode: 'guess_set_icon',
                  attempts: 0,
                  correct: 0,
                  total_questions: 0,
                  accuracy: null,
                },
              ],
            },
          }),
        );
      }),
    );

    renderWithProviders(<QuizStatsSection isAuthenticated />);

    expect(
      await screen.findByText('1 quiz · 5/5 correct (100%)'),
    ).toBeInTheDocument();
  });

  it('fetches and labels the selected calendar day instead of today, when one is selected', async () => {
    const requestedDates: string[] = [];
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz-attempts/stats/`, ({ request }) => {
        requestedDates.push(
          new URL(request.url).searchParams.get('date') ?? '',
        );
        return HttpResponse.json(
          mockQuizAttemptStats({
            today: {
              attempts: 1,
              correct: 2,
              total_questions: 5,
              accuracy: 0.4,
              by_mode: [
                {
                  mode: 'guess_card',
                  attempts: 1,
                  correct: 2,
                  total_questions: 5,
                  accuracy: 0.4,
                },
                {
                  mode: 'guess_set',
                  attempts: 0,
                  correct: 0,
                  total_questions: 0,
                  accuracy: null,
                },
                {
                  mode: 'guess_hp',
                  attempts: 0,
                  correct: 0,
                  total_questions: 0,
                  accuracy: null,
                },
                {
                  mode: 'guess_set_icon',
                  attempts: 0,
                  correct: 0,
                  total_questions: 0,
                  accuracy: null,
                },
              ],
            },
          }),
        );
      }),
    );

    renderWithProviders(<QuizStatsSection isAuthenticated />, {
      route: '/quiz?month=2026-09&date=2026-09-05',
    });

    // Same day-formatting QuizHistorySection's own selected-day heading
    // uses, not a literal "Today" — this is a past day, not the real one.
    expect(await screen.findByText('September 5th, 2026')).toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    expect(requestedDates).toEqual(['2026-09-05']);
  });

  it('falls back to the real today when no day is selected on the calendar', async () => {
    const requestedDates: string[] = [];
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz-attempts/stats/`, ({ request }) => {
        requestedDates.push(
          new URL(request.url).searchParams.get('date') ?? '',
        );
        return HttpResponse.json(mockQuizAttemptStats());
      }),
    );

    renderWithProviders(<QuizStatsSection isAuthenticated />, {
      route: '/quiz?month=2026-09',
    });

    expect(await screen.findByText('Today')).toBeInTheDocument();
    // Computed the same way the component does, not hardcoded — this
    // assertion depends on the real system date, same reasoning
    // QuizHistorySection's own time-formatting test already uses.
    expect(requestedDates).toEqual([new Date().toISOString().slice(0, 10)]);
  });
});
