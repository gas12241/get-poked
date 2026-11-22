import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  checkQuizAnswer,
  createQuizShare,
  getQuizAttemptDetail,
  getQuizQuestions,
  getQuizShare,
  submitQuizAttempt,
} from '../api/quiz';
import type {
  QuizAnswerInput,
  QuizAttemptDetail,
  QuizDifficulty,
  QuizMode,
  QuizShareDetail,
} from '../api/quiz';
import { filterSetNameSuggestions, getCardNames, getSets } from '../api/cards';
import type { QuizSession } from '../store/quizStore';
import { useQuizStore } from '../store/quizStore';
import { useIsAuthenticated } from '../store/authStore';
import {
  DIFFICULTIES,
  MODES,
  SET_ICON_DIFFICULTY_DESCRIPTIONS,
} from '../lib/quizOptions';
import {
  difficultyLabel,
  formatSeconds,
  modeLabel,
} from '../lib/quizAttemptFormatting';
import NameAutocomplete from '../components/NameAutocomplete';
import { StartingReel } from '../components/CaseOpeningReel';
import ConfirmDialog from '../components/ConfirmDialog';
import QuizAttemptBreakdown from '../components/QuizAttemptBreakdown';
import QuizHistorySection from '../components/QuizHistorySection';
import QuizStatsSection from '../components/QuizStatsSection';
import './pages.css';

const QUESTION_COUNTS: { value: number; label: string }[] = [
  { value: 3, label: 'Short' },
  { value: 5, label: 'Medium' },
  { value: 7, label: 'Long' },
];

function ModeSelection({
  mode,
  onSelectMode,
  questionCount,
  onSelectCount,
  difficulty,
  onSelectDifficulty,
  onStart,
  error,
}: {
  mode: QuizMode;
  onSelectMode: (mode: QuizMode) => void;
  questionCount: number;
  onSelectCount: (count: number) => void;
  difficulty: QuizDifficulty;
  onSelectDifficulty: (difficulty: QuizDifficulty) => void;
  onStart: () => void;
  error: string | null;
}) {
  // guess_set_icon's difficulty means answer format, not a rarity pool —
  // sets have no rarity — so it gets its own description text instead of
  // DIFFICULTIES' rarity-based ones. See docs/decisions.md #096.
  const difficultyDescription =
    mode === 'guess_set_icon'
      ? SET_ICON_DIFFICULTY_DESCRIPTIONS[difficulty]
      : DIFFICULTIES.find((d) => d.value === difficulty)?.description;

  return (
    <div className="quiz-mode-selection">
      <h1>Quiz</h1>
      <div
        className="quiz-mode-buttons"
        role="radiogroup"
        aria-label="Quiz mode"
      >
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            className={mode === m.value ? 'active' : undefined}
            onClick={() => onSelectMode(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="quiz-picker-label">Difficulty</p>
      <div className="quiz-picker" role="radiogroup" aria-label="Difficulty">
        {DIFFICULTIES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={difficulty === value}
            className={difficulty === value ? 'active' : undefined}
            onClick={() => onSelectDifficulty(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {difficultyDescription && (
        <p className="quiz-picker-description">{difficultyDescription}</p>
      )}
      <p className="quiz-picker-label">Quiz length</p>
      <div className="quiz-picker" role="radiogroup" aria-label="Quiz length">
        {QUESTION_COUNTS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={questionCount === value}
            className={questionCount === value ? 'active' : undefined}
            onClick={() => onSelectCount(value)}
          >
            {label} ({value})
          </button>
        ))}
      </div>
      <button type="button" className="quiz-start-button" onClick={onStart}>
        Start Quiz
      </button>
      {error && <p>Failed to start quiz: {error}</p>}
    </div>
  );
}

// Shown in place of ModeSelection from the moment a mode is picked until
// the first question's reel has fully revealed it — StartingReel (see
// CaseOpeningReel.tsx) fills that wait with an idle spin instead of a dead
// pause, then hands off into the same reveal QuizQuestionView would use.
// The count is already known from the picker, so it's shown immediately
// for continuity with QuizQuestionView's own header, even before the real
// questions arrive. See docs/decisions.md #044.
function StartingQuestion({
  questionCount,
  ready,
  rarity,
  imageSrc,
  difficulty,
  onFinish,
}: {
  questionCount: number;
  ready: boolean;
  rarity?: string;
  imageSrc?: string;
  difficulty: QuizDifficulty;
  onFinish: () => void;
}) {
  return (
    <div className="quiz-question">
      <p>Question 1 of {questionCount}</p>
      <StartingReel
        ready={ready}
        rarity={rarity}
        imageSrc={imageSrc}
        difficulty={difficulty}
        onFinish={onFinish}
      />
    </div>
  );
}

function QuizQuestionView({
  session,
  onAnswered,
  onAbandon,
  onRevealed,
}: {
  session: QuizSession;
  onAnswered: (answer: QuizAnswerInput) => void;
  onAbandon: () => void;
  onRevealed: () => void;
}) {
  const [guess, setGuess] = useState('');
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    answer: string;
  } | null>(null);
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  // Every question gets its own case-opening reveal — this component
  // remounts fresh per question (see the `key` prop where it's rendered
  // below), so this state naturally resets each time. See
  // docs/decisions.md #040. Skipped if this question was already revealed
  // before this mount (e.g. navigating away and back, or a reload) — see
  // docs/decisions.md #043.
  const [isOpening, setIsOpening] = useState(!session.currentRevealed);
  // Set once the reel finishes, not at mount — otherwise every question's
  // recorded time would be inflated by the reel's own duration. If already
  // revealed, there's no reel to wait on, so the timer starts right away.
  const [startedAt, setStartedAt] = useState<number | null>(() =>
    session.currentRevealed ? Date.now() : null,
  );

  // Full set list, cached under the same ['sets'] query key CardListPage
  // already uses — fetched once and filtered client-side per keystroke
  // (see filterSetNameSuggestions), not re-fetched every question or every
  // character typed.
  const setsQuery = useQuery({ queryKey: ['sets'], queryFn: getSets });

  const question = session.questions[session.currentIndex];

  const checkMutation = useMutation({
    mutationFn: () =>
      session.mode === 'guess_set_icon'
        ? checkQuizAnswer({ set: question.set, mode: session.mode, guess })
        : checkQuizAnswer({ card: question.card, mode: session.mode, guess }),
    onSuccess: setFeedback,
  });

  function handleSubmitGuess(e: FormEvent) {
    e.preventDefault();
    checkMutation.mutate();
  }

  function handleNext() {
    if (!feedback) return;
    onAnswered({
      ...(session.mode === 'guess_set_icon'
        ? { set: question.set }
        : { card: question.card }),
      guess,
      is_correct: feedback.correct,
      time_taken_seconds: (Date.now() - (startedAt ?? Date.now())) / 1000,
      order: session.currentIndex,
    });
  }

  return (
    <div className="quiz-question">
      <p>
        Question {session.currentIndex + 1} of {session.questions.length}
      </p>
      {isOpening ? (
        // StartingReel rather than CaseOpeningReel directly: with this
        // question's data already on hand, `ready` is true from the first
        // render, but StartingReel still idles for MIN_IDLE_DURATION_MS
        // before crossfading into the real spin (see docs/decisions.md
        // #057) — the same brief wind-up question 1 gets, so the cut from
        // "Next" straight into a full-speed 3.5s spin doesn't feel abrupt.
        <StartingReel
          ready
          // guess_set_icon has no rarity at all (sets aren't rare) — a
          // fixed neutral tier purely for the reel's own tint, since the
          // reel treats an undefined rarity as "data not ready yet" and
          // would otherwise idle forever. See docs/decisions.md #096.
          rarity={question.rarity ?? 'Common'}
          imageSrc={question.image}
          difficulty={session.difficulty}
          onFinish={() => {
            setIsOpening(false);
            setStartedAt(Date.now());
            onRevealed();
          }}
        />
      ) : (
        <div className="quiz-revealed">
          <img
            src={question.image}
            alt={
              session.mode === 'guess_set_icon'
                ? 'Set to guess'
                : 'Card to guess'
            }
          />
          <div className="quiz-revealed-details">
            <dl>
              {question.name && (
                <>
                  <dt>Name</dt>
                  <dd>{question.name}</dd>
                </>
              )}
              {question.hp && (
                <>
                  <dt>HP</dt>
                  <dd>{question.hp}</dd>
                </>
              )}
              {question.card_set && (
                <>
                  <dt>Set</dt>
                  <dd>{question.card_set.name}</dd>
                </>
              )}
              {question.rarity && (
                <>
                  <dt>Rarity</dt>
                  <dd>{question.rarity}</dd>
                </>
              )}
              {question.types && (
                <>
                  <dt>Types</dt>
                  <dd>{question.types.join(', ') || '—'}</dd>
                </>
              )}
            </dl>

            {!feedback ? (
              <form onSubmit={handleSubmitGuess}>
                {session.mode === 'guess_card' ? (
                  // Deliberately unscoped (no set/series) — suggestions
                  // drawn from the whole catalog are the same regardless of
                  // which card this question is actually about, so they
                  // can't leak the answer the way scoping to this
                  // question's small eligible pool sometimes could. See
                  // docs/decisions.md #036.
                  <NameAutocomplete
                    value={guess}
                    onChange={setGuess}
                    fetchSuggestions={(text) => getCardNames({ search: text })}
                    ariaLabel="Your guess"
                  />
                ) : session.mode === 'guess_set' ? (
                  // Same reasoning as guess_card above — the full set list
                  // isn't scoped to this question's eligible pool, so it
                  // can't hint at the answer. See docs/decisions.md #045.
                  <NameAutocomplete
                    value={guess}
                    onChange={setGuess}
                    fetchSuggestions={(text) =>
                      Promise.resolve(
                        filterSetNameSuggestions(setsQuery.data ?? [], text),
                      )
                    }
                    ariaLabel="Your guess"
                  />
                ) : session.mode === 'guess_set_icon' && question.choices ? (
                  // Easy/medium only — hard has no `choices` (see
                  // build_set_icon_question) and falls through to the plain
                  // input below. Same radiogroup/button/.active convention
                  // already used for the mode/difficulty/length pickers
                  // above, not a new pattern. `guess` is set to the
                  // option's name (not its id) — the same human-readable
                  // string shape every other mode's guess already is, so
                  // checking/scoring/the breakdown all need no special
                  // handling for this mode. See docs/decisions.md #096.
                  <div
                    className="quiz-picker quiz-set-icon-choices"
                    role="radiogroup"
                    aria-label="Your guess"
                  >
                    {question.choices.map((choice) => (
                      <button
                        key={choice.id}
                        type="button"
                        role="radio"
                        aria-checked={guess === choice.name}
                        className={guess === choice.name ? 'active' : undefined}
                        onClick={() => setGuess(choice.name)}
                      >
                        {choice.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    aria-label="Your guess"
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                  />
                )}
                <button
                  type="submit"
                  disabled={checkMutation.isPending || !guess}
                >
                  Submit guess
                </button>
              </form>
            ) : (
              <div className="quiz-feedback">
                <p>
                  {feedback.correct
                    ? 'Correct!'
                    : `Incorrect. The answer was ${feedback.answer}.`}
                </p>
                <button onClick={handleNext}>Next</button>
              </div>
            )}
          </div>
        </div>
      )}
      <button
        onClick={() => setConfirmingAbandon(true)}
        className="quiz-abandon"
      >
        Abandon quiz
      </button>
      {confirmingAbandon && (
        <ConfirmDialog
          message="Abandon this quiz? Your progress will be lost."
          confirmLabel="Abandon quiz"
          onConfirm={onAbandon}
          onCancel={() => setConfirmingAbandon(false)}
        />
      )}
    </div>
  );
}

function QuizSummary({
  session,
  isAuthenticated,
  onSaved,
  onPlayAgain,
}: {
  session: QuizSession;
  isAuthenticated: boolean;
  onSaved: (attemptId: number) => void;
  onPlayAgain: () => void;
}) {
  const score = session.answers.filter((a) => a.is_correct).length;

  // Summed across every answer's own time_taken_seconds (the same value
  // each breakdown row already shows individually), not re-timed here —
  // one total/average pair for the whole quiz, computed from data that
  // already exists rather than a new timer.
  const totalSeconds = session.answers.reduce(
    (sum, a) => sum + a.time_taken_seconds,
    0,
  );
  const averageSecondsPerQuestion = session.answers.length
    ? totalSeconds / session.answers.length
    : 0;

  // Re-fetches the breakdown by id on a remount that finds the session
  // already submitted (e.g. the user clicked a card's image, opened its
  // detail page, then hit the browser's back button) — this component's
  // own saveState is necessarily lost on remount, but the attempt id
  // persisted in the Zustand session survives it. See docs/decisions.md
  // #093.
  const attemptDetailQuery = useQuery({
    queryKey: ['quiz-attempt-detail', session.attemptId],
    queryFn: () => getQuizAttemptDetail(session.attemptId as number),
    enabled: session.submitted && session.attemptId != null,
  });

  // Plain state, not useMutation — found live that useMutation's own
  // isSuccess/data got stuck mid-transition under React StrictMode
  // specifically when its onSuccess callback synchronously triggers a
  // second store's (Zustand's) update; a plain async function + useState
  // has none of that cross-store interaction to race against.
  const [saveState, setSaveState] = useState<
    | { status: 'idle' }
    | { status: 'saving' }
    | { status: 'saved'; attempt: QuizAttemptDetail }
    | { status: 'error' }
  >({ status: 'idle' });

  async function save() {
    setSaveState({ status: 'saving' });
    try {
      const attempt = await submitQuizAttempt({
        quiz_mode: session.mode,
        difficulty: session.difficulty,
        shared_token: session.sharedToken ?? undefined,
        answers: session.answers.map(
          ({ card, set, guess, time_taken_seconds, order }) => ({
            card,
            set,
            guess,
            time_taken_seconds,
            order,
          }),
        ),
      });
      setSaveState({ status: 'saved', attempt });
      onSaved(attempt.id);
    } catch {
      setSaveState({ status: 'error' });
    }
  }

  // Auto-saves on completion rather than waiting for a click, so a
  // browsable history (see the history section below) is actually
  // complete — see docs/decisions.md #088. Mount-only: QuizSummary itself
  // only mounts once a session first becomes complete.
  //
  // hasTriggeredSave guards against a real, observed bug: React
  // double-invokes effects in StrictMode (and effects generally aren't
  // guaranteed to run exactly once), and `!session.submitted` alone doesn't
  // catch a second invocation that lands before the first save's response
  // comes back and flips it — caught live (two QuizAttempt rows from one
  // quiz) before this guard existed, not just a theoretical concern.
  const hasTriggeredSave = useRef(false);
  useEffect(() => {
    if (isAuthenticated && !session.submitted && !hasTriggeredSave.current) {
      hasTriggeredSave.current = true;
      save();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Split out of the JSX below rather than nested ternaries three levels
  // deep — `breakdown` is whatever sits between the quiz-type meta and the
  // score/time footer (the per-question rows, a loading placeholder, or
  // nothing at all), `statusText` is the one line (plus a retry button for
  // the error case) that explains what happened to the save itself.
  let breakdown: ReactNode = null;
  let statusText: ReactNode = null;

  if (isAuthenticated) {
    if (saveState.status === 'saved') {
      breakdown = <QuizAttemptBreakdown answers={saveState.attempt.answers} />;
      statusText = <p>Score saved.</p>;
    } else if (session.submitted) {
      // A page reload, or a remount after navigating away and back
      // (session.submitted persisted, but this mount's own save never
      // ran) — re-fetch the breakdown by the persisted attempt id rather
      // than showing just the bare score. Falls back to a bare "Score
      // saved." for a session persisted before attemptId existed, or if
      // the re-fetch itself fails.
      if (attemptDetailQuery.data) {
        breakdown = (
          <QuizAttemptBreakdown answers={attemptDetailQuery.data.answers} />
        );
        statusText = <p>Score saved.</p>;
      } else if (attemptDetailQuery.isLoading) {
        breakdown = <p>Loading...</p>;
      } else {
        statusText = <p>Score saved.</p>;
      }
    } else if (saveState.status === 'saving') {
      statusText = <p>Saving...</p>;
    } else if (saveState.status === 'error') {
      statusText = (
        <>
          <p>Failed to save score.</p>
          <button onClick={save}>Try again</button>
        </>
      );
    }
  } else {
    statusText = <p>Log in to save your score.</p>;
  }

  // Only once the attempt is actually saved — a share link has to point
  // at a real QuizAttempt (see QuizShareCreateView), same reasoning as
  // why the breakdown itself only renders once saved.
  const canShare = isAuthenticated && session.attemptId != null;

  return (
    <div className="quiz-summary">
      <h2>Quiz complete!</h2>
      <div className="quiz-summary-meta">
        <p>
          Quiz Type: <strong>{modeLabel(session.mode)}</strong>
        </p>
        <p>
          Difficulty: <strong>{difficultyLabel(session.difficulty)}</strong>
        </p>
        <p>
          Quiz Length:{' '}
          <strong>
            {session.questions.length}{' '}
            {session.questions.length === 1 ? 'question' : 'questions'}
          </strong>
        </p>
      </div>
      {breakdown}
      <div className="quiz-summary-footer">
        <p>
          Score:{' '}
          <strong>
            {score} / {session.questions.length}
          </strong>
        </p>
        <p>
          Time taken:{' '}
          <strong>
            {formatSeconds(totalSeconds)} total (
            {formatSeconds(averageSecondsPerQuestion)}/question)
          </strong>
        </p>
        {statusText}
        {canShare && <ShareQuizLink attemptId={session.attemptId as number} />}
      </div>
      <button onClick={onPlayAgain}>Play again</button>
    </div>
  );
}

// Shown in QuizSummary's footer once the attempt is saved — creates a
// link that replays this exact quiz for whoever opens it (see
// QuizShareDetailView), and shows it ready to copy. get_or_create on the
// backend means clicking "Share this quiz" again just shows the same
// link instead of minting a new one. See docs/decisions.md #101.
function ShareQuizLink({ attemptId }: { attemptId: number }) {
  const [copied, setCopied] = useState(false);
  const shareMutation = useMutation({
    mutationFn: () => createQuizShare(attemptId),
  });

  if (shareMutation.data) {
    const url = `${window.location.origin}/quiz/shared/${shareMutation.data.token}`;
    return (
      <div className="quiz-share-link">
        <input aria-label="Shareable quiz link" readOnly value={url} />
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => shareMutation.mutate()}>
      {shareMutation.isPending ? 'Creating link...' : 'Share this quiz'}
    </button>
  );
}

// Shown in place of ModeSelection when arriving via /quiz/shared/:token —
// mode/difficulty/length are all fixed by the original attempt the link
// points at, so there's nothing to pick, just a chance to see whose quiz
// it is before committing to it. See docs/decisions.md #101.
function SharedQuizStart({
  share,
  onStart,
}: {
  share: QuizShareDetail;
  onStart: () => void;
}) {
  return (
    <div className="quiz-mode-selection">
      <h1>Quiz</h1>
      <p>
        Shared by <strong>{share.shared_by.username}</strong>
      </p>
      <p>
        {modeLabel(share.quiz_mode)} &middot;{' '}
        {difficultyLabel(share.difficulty)} &middot; {share.questions.length}{' '}
        {share.questions.length === 1 ? 'question' : 'questions'}
      </p>
      <button type="button" className="quiz-start-button" onClick={onStart}>
        Start Quiz
      </button>
    </div>
  );
}

function QuizPage() {
  const { token: sharedToken } = useParams<{ token?: string }>();
  const navigate = useNavigate();
  const session = useQuizStore((s) => s.session);
  const startSession = useQuizStore((s) => s.startSession);
  const recordAnswer = useQuizStore((s) => s.recordAnswer);
  const revealCurrent = useQuizStore((s) => s.revealCurrent);
  const markSubmitted = useQuizStore((s) => s.markSubmitted);
  const abandonSession = useQuizStore((s) => s.abandonSession);
  // Plain abandonSession alone would leave the URL at /quiz/shared/:token,
  // which re-shows SharedQuizStart for the same link forever — there'd be
  // no way back to the normal mode picker/history. Navigate to the plain
  // /quiz route too whenever leaving a shared session. See
  // docs/decisions.md #101.
  const exitSession = () => {
    abandonSession();
    if (sharedToken) {
      navigate('/quiz');
    }
  };
  const isAuthenticated = useIsAuthenticated();
  const [mode, setMode] = useState<QuizMode>(MODES[0].value);
  const [questionCount, setQuestionCount] = useState(5);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('medium');
  // Set the moment a mode is picked, cleared once its first question has
  // been fully revealed — while set (and not errored), StartingQuestion
  // replaces ModeSelection/QuizQuestionView so there's a continuous idle
  // reel to look at instead of a dead pause, then a hand-off into the real
  // spin, instead of a hard cut. See docs/decisions.md #044.
  const [pendingMode, setPendingMode] = useState<QuizMode | null>(null);

  const startQuiz = useMutation({
    mutationFn: (mode: QuizMode) =>
      getQuizQuestions({ mode, count: questionCount, difficulty }),
    // Session creation happens as soon as the fetch resolves — same timing
    // as before this feature existed — so it's persisted the moment real
    // question data exists. Navigating away or reloading mid-reveal then
    // only ever loses the cosmetic idle/crossfade, never the fetched quiz
    // itself; QuizQuestionView's own currentRevealed check (#043) already
    // handles resuming an interrupted, not-yet-revealed first question.
    onSuccess: (data, mode) => startSession(mode, data.questions, difficulty),
  });

  // Arriving via /quiz/shared/:token with no session yet — fetches the
  // fixed mode/difficulty/questions the link points at, shown through
  // SharedQuizStart in place of the mode picker below. See
  // docs/decisions.md #101.
  const sharedQuizQuery = useQuery({
    queryKey: ['quiz-share', sharedToken],
    queryFn: () => getQuizShare(sharedToken as string),
    enabled: Boolean(sharedToken) && !session,
  });

  // Covers both halves of starting a quiz: still fetching (session doesn't
  // exist yet) and fetched-but-not-yet-revealed (session exists, at
  // question 0, unrevealed) — StartingQuestion stays the same mounted
  // component across that boundary so the idle loop can hand off into the
  // real spin without unmounting.
  const showingStartingQuestion =
    pendingMode !== null &&
    !startQuiz.isError &&
    (!session || (session.currentIndex === 0 && !session.currentRevealed));

  if (showingStartingQuestion) {
    const firstQuestion = session?.questions[0];
    return (
      <StartingQuestion
        questionCount={questionCount}
        ready={firstQuestion !== undefined}
        // guess_set_icon has no rarity at all — same fallback as
        // QuizQuestionView's own StartingReel call, purely so the reel's
        // "has real data arrived" check doesn't idle forever. See
        // docs/decisions.md #096.
        rarity={firstQuestion ? (firstQuestion.rarity ?? 'Common') : undefined}
        imageSrc={firstQuestion?.image}
        difficulty={difficulty}
        onFinish={() => {
          revealCurrent();
          setPendingMode(null);
        }}
      />
    );
  }

  if (sharedToken && !session) {
    if (sharedQuizQuery.isError) {
      return <p>This quiz link wasn&apos;t found.</p>;
    }
    if (!sharedQuizQuery.data) {
      return <p>Loading shared quiz...</p>;
    }
    const shareData = sharedQuizQuery.data;
    return (
      <SharedQuizStart
        share={shareData}
        onStart={() =>
          startSession(
            shareData.quiz_mode,
            shareData.questions,
            shareData.difficulty,
            sharedToken,
          )
        }
      />
    );
  }

  if (!session) {
    return (
      <>
        <ModeSelection
          mode={mode}
          onSelectMode={setMode}
          questionCount={questionCount}
          onSelectCount={setQuestionCount}
          difficulty={difficulty}
          onSelectDifficulty={setDifficulty}
          onStart={() => {
            setPendingMode(mode);
            startQuiz.mutate(mode);
          }}
          error={startQuiz.isError ? (startQuiz.error as Error).message : null}
        />
        <QuizStatsSection isAuthenticated={isAuthenticated} />
        <QuizHistorySection isAuthenticated={isAuthenticated} />
      </>
    );
  }

  const isComplete = session.currentIndex >= session.questions.length;

  if (isComplete) {
    return (
      <QuizSummary
        session={session}
        isAuthenticated={isAuthenticated}
        onSaved={markSubmitted}
        onPlayAgain={exitSession}
      />
    );
  }

  return (
    <QuizQuestionView
      key={session.currentIndex}
      session={session}
      onAnswered={recordAnswer}
      onAbandon={exitSession}
      onRevealed={revealCurrent}
    />
  );
}

export default QuizPage;
