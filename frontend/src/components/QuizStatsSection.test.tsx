import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { mockQuizAttemptStats } from '../mocks/handlers';
import { renderWithProviders } from '../test/renderWithProviders';
import QuizStatsSection from './QuizStatsSection';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

const TODAY_MODE_ROW = (overrides: Record<string, unknown>) => ({
  mode: 'guess_card',
  attempts: 0,
  correct: 0,
  total_questions: 0,
  accuracy: null,
  ...overrides,
});

const ZERO_OTHER_MODE_ROWS = [
  TODAY_MODE_ROW({ mode: 'guess_set' }),
  TODAY_MODE_ROW({ mode: 'guess_hp' }),
  TODAY_MODE_ROW({ mode: 'guess_set_icon' }),
];

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

    // Day panel shown by default; "Today" since a fresh account's
    // resolved date (no prior attempt to fall back to) is the real today.
    expect(
      await screen.findByText('Today', { selector: 'button' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Career')).toBeInTheDocument();
    expect(screen.getByText('0 quizzes · —')).toBeInTheDocument();
    expect(screen.getByText("Guess the Card's Name")).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(4);
  });

  it('shows real totals and a per-mode breakdown for the day panel, and omits the date param when nothing is selected', async () => {
    const requestedDates: string[] = [];
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz-attempts/stats/`, ({ request }) => {
        requestedDates.push(
          new URL(request.url).searchParams.get('date') ?? '',
        );
        return HttpResponse.json(
          mockQuizAttemptStats({
            today: {
              attempts: 2,
              correct: 3,
              total_questions: 10,
              accuracy: 0.3,
              by_mode: [
                TODAY_MODE_ROW({
                  attempts: 2,
                  correct: 3,
                  total_questions: 10,
                  accuracy: 0.3,
                }),
                ...ZERO_OTHER_MODE_ROWS,
              ],
            },
          }),
        );
      }),
    );

    renderWithProviders(<QuizStatsSection isAuthenticated />);

    // Raw correct/total shown alongside the percentage, not just the
    // percentage alone — see docs/decisions.md #098.
    expect(
      await screen.findByText('2 quizzes · 3/10 correct (30%)'),
    ).toBeInTheDocument();
    expect(screen.getByText('3/10 (30%)')).toBeInTheDocument();
    // No `date` sent at all — the backend resolves its own default
    // (the most recently played date) rather than the frontend guessing
    // "today". See docs/decisions.md #102.
    expect(requestedDates).toEqual(['']);
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
                TODAY_MODE_ROW({
                  attempts: 1,
                  correct: 5,
                  total_questions: 5,
                  accuracy: 1,
                }),
                ...ZERO_OTHER_MODE_ROWS,
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

  it('toggles to the Career panel and back', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz-attempts/stats/`, () => {
        return HttpResponse.json(
          mockQuizAttemptStats({
            today: {
              attempts: 1,
              correct: 1,
              total_questions: 1,
              accuracy: 1,
              by_mode: [
                TODAY_MODE_ROW({
                  attempts: 1,
                  correct: 1,
                  total_questions: 1,
                  accuracy: 1,
                }),
                ...ZERO_OTHER_MODE_ROWS,
              ],
            },
            career: {
              attempts: 9,
              correct: 9,
              total_questions: 9,
              accuracy: 1,
              by_mode: [
                TODAY_MODE_ROW({
                  attempts: 9,
                  correct: 9,
                  total_questions: 9,
                  accuracy: 1,
                }),
                ...ZERO_OTHER_MODE_ROWS,
              ],
            },
          }),
        );
      }),
    );

    renderWithProviders(<QuizStatsSection isAuthenticated />);
    await screen.findByText('1 quiz · 1/1 correct (100%)');
    // Only the day panel's own totals are visible — Career's are not on
    // the page yet, confirming only one panel renders at a time.
    expect(
      screen.queryByText('9 quizzes · 9/9 correct (100%)'),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Career' }));

    expect(
      await screen.findByText('9 quizzes · 9/9 correct (100%)'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('1 quiz · 1/1 correct (100%)'),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Today' }));

    expect(
      await screen.findByText('1 quiz · 1/1 correct (100%)'),
    ).toBeInTheDocument();
  });

  it('labels the day panel with the resolved date, not always "Today"', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz-attempts/stats/`, () => {
        return HttpResponse.json(mockQuizAttemptStats({ date: '2026-09-05' }));
      }),
    );

    renderWithProviders(<QuizStatsSection isAuthenticated />);

    // Same day-formatting QuizHistorySection's own selected-day heading
    // uses, not a literal "Today" — the resolved day is a past date here.
    expect(
      await screen.findByRole('radio', { name: 'September 5th, 2026' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Today', { selector: 'button' }),
    ).not.toBeInTheDocument();
  });

  it('sends the selected calendar day instead of omitting the date param', async () => {
    const requestedDates: string[] = [];
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz-attempts/stats/`, ({ request }) => {
        requestedDates.push(
          new URL(request.url).searchParams.get('date') ?? '',
        );
        return HttpResponse.json(mockQuizAttemptStats({ date: '2026-09-05' }));
      }),
    );

    renderWithProviders(<QuizStatsSection isAuthenticated />, {
      route: '/quiz?month=2026-09&date=2026-09-05',
    });

    await screen.findByRole('radio', { name: 'September 5th, 2026' });
    expect(requestedDates).toEqual(['2026-09-05']);
  });

  it('switches back to the day panel when a different day is selected while viewing Career', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz-attempts/stats/`, ({ request }) => {
        const date = new URL(request.url).searchParams.get('date');
        return HttpResponse.json(
          mockQuizAttemptStats({ date: date ?? '2026-09-01' }),
        );
      }),
    );

    renderWithProviders(
      <Routes>
        <Route
          path="/quiz"
          element={
            <>
              <QuizStatsSection isAuthenticated />
              <Link to="/quiz?date=2026-09-10">Select Sept 10</Link>
            </>
          }
        />
      </Routes>,
      { route: '/quiz?date=2026-09-01' },
    );

    await screen.findByRole('radio', { name: 'September 1st, 2026' });
    await userEvent.click(screen.getByRole('radio', { name: 'Career' }));
    expect(
      screen.getByRole('radio', { name: 'Career', checked: true }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByText('Select Sept 10'));

    expect(
      await screen.findByRole('radio', {
        name: 'September 10th, 2026',
        checked: true,
      }),
    ).toBeInTheDocument();
  });
});
