import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import { useQuizStore } from '../store/quizStore';
import { useAuthStore } from '../store/authStore';
import {
  FLIP_DURATION_MS,
  SPIN_DURATION_MS,
} from '../components/CaseOpeningReel';
import QuizPage from './QuizPage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

beforeEach(() => {
  useQuizStore.setState({ session: null });
  useAuthStore.setState({ accessToken: null });
});

// Every question opens with a case-opening reel (see CaseOpeningReel.tsx,
// docs/decisions.md #040) before the guess form appears, so callers need a
// longer-than-default wait for it. Waiting on the "Card to guess" alt text
// specifically would resolve too early: the reel's own winning slot
// carries that same alt text on its (visually flipped-away) reveal image
// from the moment it mounts, not just once spinning finishes — only the
// guess form is actually gated on that. Derived from the component's own
// exported durations, not a hardcoded number, so this can't silently fall
// out of sync if those change.
const REEL_TIMEOUT_MS = SPIN_DURATION_MS + FLIP_DURATION_MS + 1000;

async function startQuiz() {
  renderWithProviders(<QuizPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Guess the Card' }));
  await screen.findByLabelText('Your guess', {}, { timeout: REEL_TIMEOUT_MS });
}

async function completeOneQuestionQuiz() {
  await startQuiz();
  await userEvent.type(screen.getByLabelText('Your guess'), 'Charizard');
  await userEvent.click(screen.getByRole('button', { name: 'Submit guess' }));
  await screen.findByText('Correct!');
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Quiz complete!');
}

describe('QuizPage', () => {
  it('shows mode selection and starts a quiz for the selected mode', async () => {
    await startQuiz();
    expect(screen.getByText('Question 1 of 1')).toBeInTheDocument();
  });

  it('defaults to a Medium (5-question) quiz, and sends the chosen length as count', async () => {
    let capturedCount: string | null = null;
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz/`, ({ request }) => {
        capturedCount = new URL(request.url).searchParams.get('count');
        return HttpResponse.json({
          questions: [
            {
              card: 1,
              image: 'https://example.com/masked.png',
              rarity: 'Rare Holo',
              supertype: 'Pokémon',
              types: ['Fire'],
            },
          ],
        });
      }),
    );

    renderWithProviders(<QuizPage />);

    const mediumButton = screen.getByRole('radio', { name: 'Medium (5)' });
    expect(mediumButton).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('radio', { name: 'Short (3)' }));
    expect(screen.getByRole('radio', { name: 'Short (3)' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Guess the Card' }),
    );

    await waitFor(() => expect(capturedCount).toBe('3'));
  });

  it('offers name suggestions for "Guess the Card" without scoping them to a set or series', async () => {
    const requestedParams: URLSearchParams[] = [];
    server.use(
      http.get(`${BASE_URL}/api/v1/card-names/`, ({ request }) => {
        requestedParams.push(new URL(request.url).searchParams);
        return HttpResponse.json(['Piplup']);
      }),
    );

    await startQuiz();
    await userEvent.type(screen.getByLabelText('Your guess'), 'pi');

    expect(
      await screen.findByRole('option', { name: 'Piplup' }),
    ).toBeInTheDocument();
    const lastRequest = requestedParams[requestedParams.length - 1];
    expect(lastRequest.get('set')).toBeNull();
    expect(lastRequest.get('series')).toBeNull();
  });

  it('shows feedback for a guess and advances to the summary', async () => {
    await completeOneQuestionQuiz();
    expect(screen.getByText('Score: 1 / 1')).toBeInTheDocument();
  });

  it('prompts an unauthenticated user to log in instead of offering to save', async () => {
    await completeOneQuestionQuiz();
    expect(screen.getByText('Log in to save your score.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save score' }),
    ).not.toBeInTheDocument();
  });

  it('lets an authenticated user save their score', async () => {
    useAuthStore.setState({ accessToken: 'test-token' });
    await completeOneQuestionQuiz();

    await userEvent.click(screen.getByRole('button', { name: 'Save score' }));

    expect(await screen.findByText('Score saved.')).toBeInTheDocument();
  });

  it('does not show the guess form (or let a guess be typed) until the case-opening reel finishes', async () => {
    renderWithProviders(<QuizPage />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Guess the Card' }),
    );

    expect(screen.queryByLabelText('Your guess')).not.toBeInTheDocument();

    await screen.findByLabelText(
      'Your guess',
      {},
      { timeout: REEL_TIMEOUT_MS },
    );
  });

  it('returns to mode selection when a quiz is abandoned', async () => {
    await startQuiz();
    await userEvent.click(screen.getByRole('button', { name: 'Abandon quiz' }));

    expect(
      screen.getByRole('button', { name: 'Guess the Card' }),
    ).toBeInTheDocument();
  });

  it('resumes an in-progress quiz after remounting', async () => {
    const { unmount } = renderWithProviders(<QuizPage />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Guess the Card' }),
    );
    await screen.findByAltText(
      'Card to guess',
      {},
      { timeout: REEL_TIMEOUT_MS },
    );
    unmount();

    renderWithProviders(<QuizPage />);

    // Unmounted mid-reel, before it actually finished (the reveal image
    // appears as soon as the reel lands, well before its onFinish fires —
    // see docs/decisions.md #040 addendum), so this question was never
    // marked revealed. Remounting replays the reel in full. See the next
    // test for the already-revealed case (docs/decisions.md #043).
    expect(
      await screen.findByAltText(
        'Card to guess',
        {},
        { timeout: REEL_TIMEOUT_MS },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 1')).toBeInTheDocument();
  });

  it('skips the case-opening reel on remount for a question already revealed', async () => {
    const { unmount } = renderWithProviders(<QuizPage />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Guess the Card' }),
    );
    // Wait for the reel to actually finish (the guess form only appears
    // once it does), unlike the previous test which unmounts mid-reel.
    await screen.findByLabelText(
      'Your guess',
      {},
      { timeout: REEL_TIMEOUT_MS },
    );
    unmount();

    renderWithProviders(<QuizPage />);

    // Already revealed before this remount, so the reel is skipped
    // entirely and the guess form is there immediately.
    expect(screen.getByLabelText('Your guess')).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 1')).toBeInTheDocument();
  });
});
