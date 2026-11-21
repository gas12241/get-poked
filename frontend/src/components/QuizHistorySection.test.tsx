import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
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

    // The click updated the URL's `date` param (not just local state) —
    // the calendar re-reads `selectedDate` from there, so it marking the
    // day as selected is the observable proof the URL actually changed.
    expect(await screen.findByText('Guess the Card')).toBeInTheDocument();
    expect(dayButton).toHaveClass('quiz-history-calendar-day-selected');
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

  it('each attempt row links to its own detail page instead of expanding in place', async () => {
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
    );

    renderWithProviders(<QuizHistorySection isAuthenticated />, {
      route: '/quiz?month=2026-09',
    });

    await userEvent.click(await screen.findByRole('button', { name: '5' }));
    const row = await screen.findByRole('link', { name: /Guess the HP/ });

    expect(row).toHaveAttribute('href', '/quiz-history/42');
  });

  it('restores the selected day immediately from a directly-loaded URL, with no click needed', async () => {
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
      route: '/quiz?month=2026-09&date=2026-09-05',
    });

    expect(await screen.findByText('September 5th, 2026')).toBeInTheDocument();
    expect(await screen.findByText('Guess the Card')).toBeInTheDocument();
  });

  function makeAttempts(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      quiz_mode: 'guess_card' as const,
      difficulty: 'medium' as const,
      score: 1,
      total_questions: 1,
      completed_at: `2026-09-05T1${i}:00:00Z`,
    }));
  }

  it('shows no scroll hint when a day has few attempts', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz-attempts/dates/`, () => {
        return HttpResponse.json({ dates: ['2026-09-05'] });
      }),
      http.get(`${BASE_URL}/api/v1/quiz-attempts/by-date/:date/`, () => {
        return HttpResponse.json(makeAttempts(4));
      }),
    );

    renderWithProviders(<QuizHistorySection isAuthenticated />, {
      route: '/quiz?month=2026-09',
    });

    await userEvent.click(await screen.findByRole('button', { name: '5' }));

    expect(await screen.findAllByText('Guess the Card')).toHaveLength(4);
    expect(screen.queryByText(/Scroll to see all/)).not.toBeInTheDocument();
  });

  it('shows a scroll hint once a day has more attempts than fit without scrolling', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz-attempts/dates/`, () => {
        return HttpResponse.json({ dates: ['2026-09-05'] });
      }),
      http.get(`${BASE_URL}/api/v1/quiz-attempts/by-date/:date/`, () => {
        return HttpResponse.json(makeAttempts(6));
      }),
    );

    renderWithProviders(<QuizHistorySection isAuthenticated />, {
      route: '/quiz?month=2026-09',
    });

    await userEvent.click(await screen.findByRole('button', { name: '5' }));

    expect(
      await screen.findByText('↓ Scroll to see all 6 quizzes'),
    ).toBeInTheDocument();
  });
});
