import { StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { mockQuizAttemptDetail } from '../mocks/handlers';
import { renderWithProviders } from '../test/renderWithProviders';
import { useQuizStore } from '../store/quizStore';
import { useAuthStore } from '../store/authStore';
import {
  CROSSFADE_MS,
  FLIP_DURATION_MS,
  MIN_IDLE_DURATION_MS,
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
// out of sync if those change. The very first question of a quiz also sits
// through StartingReel's idle loop and crossfade before its own spin even
// starts (docs/decisions.md #044) — every helper below starts from
// ModeSelection, so all of them pay that cost.
const REEL_TIMEOUT_MS =
  MIN_IDLE_DURATION_MS +
  CROSSFADE_MS +
  SPIN_DURATION_MS +
  FLIP_DURATION_MS +
  1000;

async function startQuiz(ui = <QuizPage />) {
  renderWithProviders(ui);
  await userEvent.click(
    screen.getByRole('radio', { name: "Guess the Card's Name" }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Start Quiz' }));
  await screen.findByLabelText('Your guess', {}, { timeout: REEL_TIMEOUT_MS });
}

async function completeOneQuestionQuiz(ui = <QuizPage />) {
  await startQuiz(ui);
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

  it("defaults to Guess the Card's Name mode, does not start until Start Quiz is pressed, and sends the chosen mode", async () => {
    let capturedMode: string | null = null;
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz/`, ({ request }) => {
        capturedMode = new URL(request.url).searchParams.get('mode');
        return HttpResponse.json({
          questions: [
            {
              card: 1,
              image: 'https://example.com/masked.png',
              rarity: 'Common',
              supertype: 'Pokémon',
              types: ['Fire'],
              name: 'Charizard',
            },
          ],
        });
      }),
    );

    renderWithProviders(<QuizPage />);

    const cardRadio = screen.getByRole('radio', {
      name: "Guess the Card's Name",
    });
    expect(cardRadio).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(
      screen.getByRole('radio', { name: "Guess the Pokémon's HP" }),
    );
    expect(
      screen.getByRole('radio', { name: "Guess the Pokémon's HP" }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(cardRadio).toHaveAttribute('aria-checked', 'false');

    // Picking a mode alone doesn't start anything — still on the
    // mode-selection screen.
    expect(
      screen.getByRole('button', { name: 'Start Quiz' }),
    ).toBeInTheDocument();
    expect(capturedMode).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Start Quiz' }));

    await waitFor(() => expect(capturedMode).toBe('guess_hp'));
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

    await userEvent.click(screen.getByRole('button', { name: 'Start Quiz' }));

    await waitFor(() => expect(capturedCount).toBe('3'));
  });

  it('defaults to Medium difficulty, and sends the chosen difficulty', async () => {
    let capturedDifficulty: string | null = null;
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz/`, ({ request }) => {
        capturedDifficulty = new URL(request.url).searchParams.get(
          'difficulty',
        );
        return HttpResponse.json({
          questions: [
            {
              card: 1,
              image: 'https://example.com/masked.png',
              rarity: 'Common',
              supertype: 'Pokémon',
              types: ['Fire'],
            },
          ],
        });
      }),
    );

    renderWithProviders(<QuizPage />);

    const mediumButton = screen.getByRole('radio', { name: 'Medium' });
    expect(mediumButton).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByText(
        'Everything in between — Rare Holo, EX, GX, V, VMAX, VSTAR, and similar',
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Hard' }));
    expect(screen.getByRole('radio', { name: 'Hard' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(
      screen.getByText('Common, Uncommon, and Rare cards'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Start Quiz' }));

    await waitFor(() => expect(capturedDifficulty).toBe('hard'));
  });

  it(`offers name suggestions for "Guess the Card's Name" without scoping them to a set or series`, async () => {
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

  it('offers set-name suggestions for "Guess the Set", filtered by prefix', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz/`, () => {
        return HttpResponse.json({
          questions: [
            {
              card: 1,
              image: 'https://example.com/masked.png',
              rarity: 'Rare Holo',
              supertype: 'Pokémon',
              types: ['Fire'],
              name: 'Charizard',
              hp: '120',
            },
          ],
        });
      }),
      http.get(`${BASE_URL}/api/v1/sets/`, () => {
        return HttpResponse.json([
          { id: 1, name: 'Base', series: 'Base', release_date: null },
          { id: 2, name: 'Base Set 2', series: 'Base', release_date: null },
          { id: 3, name: 'Jungle', series: 'Base', release_date: null },
        ]);
      }),
    );

    renderWithProviders(<QuizPage />);
    await userEvent.click(
      screen.getByRole('radio', { name: "Guess the Pokémon's Set" }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start Quiz' }));
    await screen.findByLabelText(
      'Your guess',
      {},
      { timeout: REEL_TIMEOUT_MS },
    );

    await userEvent.type(screen.getByLabelText('Your guess'), 'ba');

    expect(
      await screen.findByRole('option', { name: 'Base' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Base Set 2' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Jungle' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('option', { name: 'Base' }));
    expect(screen.getByLabelText('Your guess')).toHaveValue('Base');
  });

  it('completes a "Guess the Set by Symbol" quiz at easy difficulty by clicking a choice, not typing', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/quiz/`, () => {
        return HttpResponse.json({
          questions: [
            {
              set: 5,
              image: 'https://example.com/symbol.png',
              choices: [
                { id: 5, name: 'Sword & Shield' },
                { id: 6, name: 'Scarlet & Violet' },
                { id: 7, name: 'Sun & Moon' },
                { id: 8, name: 'Black & White' },
              ],
            },
          ],
        });
      }),
      http.post(`${BASE_URL}/api/v1/quiz/check/`, () => {
        return HttpResponse.json({
          correct: true,
          answer: 'Sword & Shield',
        });
      }),
    );

    renderWithProviders(<QuizPage />);
    await userEvent.click(
      screen.getByRole('radio', { name: 'Guess the Set by Symbol' }),
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Easy' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start Quiz' }));

    const choiceButton = await screen.findByRole(
      'radio',
      { name: 'Sword & Shield' },
      { timeout: REEL_TIMEOUT_MS },
    );
    // No text input at all for this mode's easy/medium rounds — a typed
    // guess would be meaningless once the choices are right there.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await userEvent.click(choiceButton);
    expect(choiceButton).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Submit guess' }));

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Quiz complete!')).toBeInTheDocument();
  });

  it('shows feedback for a guess and advances to the summary', async () => {
    await completeOneQuestionQuiz();
    // Bolded value, same pattern as the quiz-type meta lines below.
    expect(
      screen.getByText('1 / 1', { selector: 'strong' }),
    ).toBeInTheDocument();
  });

  it('shows the mode/difficulty/length and the total time taken on the summary', async () => {
    await completeOneQuestionQuiz();

    // Default difficulty (medium, see QuizPage's own useState default) —
    // startQuiz only picks a mode, so this pins what's actually selected.
    // Each fact is its own line; the bolded-value treatment is the same
    // "selector: 'strong'" pattern CardListPage's own "Showing X from Y"
    // tests already use.
    expect(
      screen.getByText("Guess the Card's Name", { selector: 'strong' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Medium', { selector: 'strong' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('1 question', { selector: 'strong' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Quiz Type:', { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Difficulty:', { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Quiz Length:', { exact: false }),
    ).toBeInTheDocument();
    // Real elapsed time, so not asserting an exact number — just the
    // total/average shape, which for a one-question quiz are equal. The
    // bolded value is its own element now, so matched separately from its
    // "Time taken:" label.
    expect(
      screen.getByText('Time taken:', { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^\d+\.\d+s total \(\d+\.\d+s\/question\)$/, {
        selector: 'strong',
      }),
    ).toBeInTheDocument();
  });

  it('shows the breakdown, then score/time, then "Score saved.", then Play again — in that order', async () => {
    useAuthStore.setState({ accessToken: 'test-token' });
    await completeOneQuestionQuiz();

    const breakdown = screen.getByText('Your guess: Charizard');
    const scoreText = screen.getByText('Score:', { exact: false });
    const timeText = screen.getByText('Time taken:', { exact: false });
    const savedText = await screen.findByText('Score saved.');
    const playAgainButton = screen.getByRole('button', {
      name: 'Play again',
    });

    const inOrder = (first: Element, second: Element) =>
      Boolean(
        first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      );

    expect(inOrder(breakdown, scoreText)).toBe(true);
    expect(inOrder(scoreText, timeText)).toBe(true);
    expect(inOrder(timeText, savedText)).toBe(true);
    expect(inOrder(savedText, playAgainButton)).toBe(true);
  });

  it('prompts an unauthenticated user to log in instead of offering to save', async () => {
    await completeOneQuestionQuiz();
    expect(screen.getByText('Log in to save your score.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save score' }),
    ).not.toBeInTheDocument();
  });

  it('auto-saves an authenticated user’s score with no button click, and shows the breakdown', async () => {
    useAuthStore.setState({ accessToken: 'test-token' });
    await completeOneQuestionQuiz();

    expect(await screen.findByText('Score saved.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save score' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Your guess: Charizard')).toBeInTheDocument();
    expect(screen.getByText('Correct answer: Charizard')).toBeInTheDocument();
  });

  it('shows a retry button if the auto-save fails, and a successful retry shows the breakdown', async () => {
    useAuthStore.setState({ accessToken: 'test-token' });
    let callCount = 0;
    server.use(
      http.post(`${BASE_URL}/api/v1/quiz-attempts/`, () => {
        callCount += 1;
        if (callCount === 1) {
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json(mockQuizAttemptDetail());
      }),
    );

    await completeOneQuestionQuiz();

    await screen.findByText('Failed to save score.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Score saved.')).toBeInTheDocument();
    expect(screen.getByText('Correct answer: Charizard')).toBeInTheDocument();
  });

  it('shows the breakdown again after remounting post-save (e.g. navigating to a card page and back)', async () => {
    useAuthStore.setState({ accessToken: 'test-token' });
    let saveCallCount = 0;
    server.use(
      http.post(`${BASE_URL}/api/v1/quiz-attempts/`, () => {
        saveCallCount += 1;
        return HttpResponse.json(mockQuizAttemptDetail());
      }),
    );

    const { unmount } = renderWithProviders(<QuizPage />);
    await userEvent.click(
      screen.getByRole('radio', { name: "Guess the Card's Name" }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start Quiz' }));
    await screen.findByLabelText(
      'Your guess',
      {},
      { timeout: REEL_TIMEOUT_MS },
    );
    await userEvent.type(screen.getByLabelText('Your guess'), 'Charizard');
    await userEvent.click(screen.getByRole('button', { name: 'Submit guess' }));
    await screen.findByText('Correct!');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Quiz complete!');
    await screen.findByText('Score saved.');
    expect(saveCallCount).toBe(1);

    // Simulates clicking a card image's link to its detail page, then
    // hitting the browser's back button: QuizPage unmounts and remounts,
    // losing QuizSummary's own local save-result state, while the
    // persisted Zustand session still has submitted: true from before.
    unmount();
    renderWithProviders(<QuizPage />);

    expect(await screen.findByText('Score saved.')).toBeInTheDocument();
    expect(
      await screen.findByText('Correct answer: Charizard'),
    ).toBeInTheDocument();
    // Re-fetched by id (GET), not saved again (POST).
    expect(saveCallCount).toBe(1);
  });

  it('only saves once even if the completion effect runs twice (React StrictMode)', async () => {
    // Caught live, not just theoretical: React re-runs effects in
    // StrictMode (and effects aren't guaranteed to run exactly once in
    // general), and the naive `!session.submitted` guard alone doesn't
    // catch a second invocation landing before the first save's response
    // comes back and flips it — this produced two separate QuizAttempt
    // rows from one finished quiz before the ref guard was added.
    useAuthStore.setState({ accessToken: 'test-token' });
    let saveCallCount = 0;
    server.use(
      http.post(`${BASE_URL}/api/v1/quiz-attempts/`, () => {
        saveCallCount += 1;
        return HttpResponse.json(mockQuizAttemptDetail());
      }),
    );

    await completeOneQuestionQuiz(
      <StrictMode>
        <QuizPage />
      </StrictMode>,
    );

    await screen.findByText('Score saved.');
    expect(saveCallCount).toBe(1);
    // Also pins a second real bug found at the same time: reading
    // session.submitted (Zustand) before the mutation's own isSuccess/data
    // (react-query) could render "submitted" a frame before this mutation's
    // own data was visible under StrictMode, showing no breakdown at all.
    expect(
      await screen.findByText('Correct answer: Charizard'),
    ).toBeInTheDocument();
  });

  it('does not show the guess form (or let a guess be typed) until the case-opening reel finishes', async () => {
    renderWithProviders(<QuizPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Start Quiz' }));

    expect(screen.queryByLabelText('Your guess')).not.toBeInTheDocument();

    await screen.findByLabelText(
      'Your guess',
      {},
      { timeout: REEL_TIMEOUT_MS },
    );
  });

  it('asks for confirmation, then returns to mode selection when a quiz is abandoned', async () => {
    await startQuiz();

    await userEvent.click(screen.getByRole('button', { name: 'Abandon quiz' }));

    // Still on the quiz until the dialog's own confirm button is clicked —
    // the "Abandon quiz" trigger button alone doesn't abandon anything.
    expect(screen.getByLabelText('Your guess')).toBeInTheDocument();
    const dialog = screen.getByRole('alertdialog');
    expect(
      within(dialog).getByText(
        'Abandon this quiz? Your progress will be lost.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Abandon quiz' }),
    );

    expect(
      screen.getByRole('radio', { name: "Guess the Card's Name" }),
    ).toBeInTheDocument();
  });

  it('does not abandon the quiz if the confirmation is declined', async () => {
    await startQuiz();

    await userEvent.click(screen.getByRole('button', { name: 'Abandon quiz' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your guess')).toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: "Guess the Card's Name" }),
    ).not.toBeInTheDocument();
  });

  it(
    "shows an idle wind-up before the second question's reel too, not just the first",
    async () => {
      // Previously only the very first question got the idle-then-pull
      // build-up (StartingQuestion/StartingReel) — every later question
      // rendered CaseOpeningReel directly and jump-cut straight into its
      // full-speed spin, which read as rushed. QuizQuestionView now uses
      // StartingReel for every question. See docs/decisions.md #057.
      server.use(
        http.get(`${BASE_URL}/api/v1/quiz/`, () => {
          return HttpResponse.json({
            questions: [
              {
                card: 1,
                image: 'https://example.com/masked-1.png',
                rarity: 'Common',
                supertype: 'Pokémon',
                types: ['Fire'],
                name: 'Charmander',
              },
              {
                card: 2,
                image: 'https://example.com/masked-2.png',
                rarity: 'Common',
                supertype: 'Pokémon',
                types: ['Water'],
                name: 'Squirtle',
              },
            ],
          });
        }),
      );

      await startQuiz();
      await userEvent.type(screen.getByLabelText('Your guess'), 'Charmander');
      await userEvent.click(
        screen.getByRole('button', { name: 'Submit guess' }),
      );
      await screen.findByText('Correct!');
      await userEvent.click(screen.getByRole('button', { name: 'Next' }));

      expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
      // Specifically the idle loop (StartingReel), not CaseOpeningReel's
      // own spin straight away — both equally hide the guess form while
      // running, so that alone wouldn't catch a regression back to the
      // rushed jump-cut.
      expect(document.querySelector('.case-opening-idle-track')).not.toBeNull();

      await screen.findByLabelText(
        'Your guess',
        {},
        { timeout: REEL_TIMEOUT_MS },
      );
    },
    REEL_TIMEOUT_MS * 2,
  );

  it('resumes an in-progress quiz after remounting', async () => {
    const { unmount } = renderWithProviders(<QuizPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Start Quiz' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Start Quiz' }));
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
