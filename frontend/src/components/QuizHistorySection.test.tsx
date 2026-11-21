import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { mockQuizAttemptDetail } from '../mocks/handlers';
import { renderWithProviders } from '../test/renderWithProviders';
import QuizHistorySection from './QuizHistorySection';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

describe('QuizHistorySection', () => {
  it('shows a log-in prompt instead of the calendar when not authenticated', () => {
    renderWithProviders(<QuizHistorySection isAuthenticated={false} />);

    expect(
      screen.getByText('Log in to see your quiz history.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('September 2026')).not.toBeInTheDocument();
  });

  it('highlights days with an attempt and lists that day’s attempts on selection', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz-attempts/dates/`, () => {
        return HttpResponse.json({ dates: ['2026-09-05'] });
      }),
      http.get(`${BASE_URL}/api/v1/quiz-attempts/by-date/:date/`, () => {
        return HttpResponse.json([
          {
            id: 1,
            quiz_mode: 'guess_card',
            difficulty: 'medium',
            score: 1,
            total_questions: 1,
            completed_at: '2026-09-05T10:00:00Z',
          },
        ]);
      }),
    );

    renderWithProviders(<QuizHistorySection isAuthenticated />, {
      route: '/quiz?month=2026-09',
    });

    const dayButton = await screen.findByRole('button', { name: '5' });
    await userEvent.click(dayButton);

    expect(await screen.findByText('Guess the Card')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    // Computed the same way the component does, not hardcoded — the
    // formatted string depends on the test runner's own timezone/locale.
    const expectedTime = new Date('2026-09-05T10:00:00Z').toLocaleTimeString(
      undefined,
      {
        hour: 'numeric',
        minute: '2-digit',
      },
    );
    expect(screen.getByText(expectedTime)).toBeInTheDocument();
  });

  it('shows "no quizzes" for a selected day with nothing', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz-attempts/dates/`, () => {
        return HttpResponse.json({ dates: ['2026-09-05'] });
      }),
      http.get(`${BASE_URL}/api/v1/quiz-attempts/by-date/:date/`, () => {
        return HttpResponse.json([]);
      }),
    );

    renderWithProviders(<QuizHistorySection isAuthenticated />, {
      route: '/quiz?month=2026-09',
    });

    await userEvent.click(await screen.findByRole('button', { name: '5' }));

    expect(
      await screen.findByText('No quizzes taken this day.'),
    ).toBeInTheDocument();
  });

  it('fetches and shows the full breakdown only once an attempt row is expanded', async () => {
    // A call counter, not just a timing-based absence check — proves the
    // detail endpoint genuinely isn't hit until expansion, rather than just
    // asserting on a render that might simply not have resolved yet either
    // way.
    let detailCallCount = 0;
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz-attempts/dates/`, () => {
        return HttpResponse.json({ dates: ['2026-09-05'] });
      }),
      http.get(`${BASE_URL}/api/v1/quiz-attempts/by-date/:date/`, () => {
        return HttpResponse.json([
          {
            id: 42,
            quiz_mode: 'guess_hp',
            difficulty: 'hard',
            score: 1,
            total_questions: 1,
            completed_at: '2026-09-05T10:00:00Z',
          },
        ]);
      }),
      http.get(`${BASE_URL}/api/v1/quiz-attempts/:id/`, () => {
        detailCallCount += 1;
        return HttpResponse.json(mockQuizAttemptDetail({ id: 42 }));
      }),
    );

    renderWithProviders(<QuizHistorySection isAuthenticated />, {
      route: '/quiz?month=2026-09',
    });

    await userEvent.click(await screen.findByRole('button', { name: '5' }));
    const row = await screen.findByRole('button', { name: /Guess the HP/ });
    // Give any eager (wrongly unguarded) fetch a chance to land before
    // asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(detailCallCount).toBe(0);

    await userEvent.click(row);

    expect(
      await screen.findByText('Correct answer: Charizard'),
    ).toBeInTheDocument();
    expect(detailCallCount).toBe(1);
  });
});
