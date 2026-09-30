import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  checkQuizAnswer,
  getQuizQuestions,
  submitQuizAttempt,
} from '../api/quiz';
import type { QuizAnswerInput, QuizDifficulty, QuizMode } from '../api/quiz';
import { filterSetNameSuggestions, getCardNames, getSets } from '../api/cards';
import type { QuizSession } from '../store/quizStore';
import { useQuizStore } from '../store/quizStore';
import { useAuthStore } from '../store/authStore';
import NameAutocomplete from '../components/NameAutocomplete';
import CaseOpeningReel, { StartingReel } from '../components/CaseOpeningReel';
import './pages.css';

const MODES: { value: QuizMode; label: string }[] = [
  { value: 'guess_card', label: 'Guess the Card' },
  { value: 'guess_set', label: 'Guess the Set' },
  { value: 'guess_hp', label: 'Guess the HP' },
];

const QUESTION_COUNTS: { value: number; label: string }[] = [
  { value: 3, label: 'Short' },
  { value: 5, label: 'Medium' },
  { value: 7, label: 'Long' },
];

// Deliberately the reverse of what "rare" suggests: most players recognize
// a distinctive chase card's set on sight more easily than a common, which
// they've likely seen dozens of across different sets — confirmed directly
// with the user rather than assumed. See docs/decisions.md #047.
const DIFFICULTIES: {
  value: QuizDifficulty;
  label: string;
  description: string;
}[] = [
  {
    value: 'easy',
    label: 'Easy',
    description:
      'Chase cards — Ultra Rare, Secret Rare, Special Illustration Rare, and similar',
  },
  {
    value: 'medium',
    label: 'Medium',
    description:
      'Everything in between — Rare Holo, EX, GX, V, VMAX, VSTAR, and similar',
  },
  {
    value: 'hard',
    label: 'Hard',
    description: 'Common, Uncommon, and Rare cards',
  },
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
  const selectedDifficulty = DIFFICULTIES.find((d) => d.value === difficulty);

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
      {selectedDifficulty && (
        <p className="quiz-picker-description">
          {selectedDifficulty.description}
        </p>
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
      checkQuizAnswer({ card: question.card, mode: session.mode, guess }),
    onSuccess: setFeedback,
  });

  function handleSubmitGuess(e: FormEvent) {
    e.preventDefault();
    checkMutation.mutate();
  }

  function handleNext() {
    if (!feedback) return;
    onAnswered({
      card: question.card,
      is_correct: feedback.correct,
      time_taken_seconds: (Date.now() - (startedAt ?? Date.now())) / 1000,
      order: session.currentIndex,
    });
  }

  return (
    <div className="quiz-question">
      <button onClick={onAbandon} className="quiz-abandon">
        Abandon quiz
      </button>
      <p>
        Question {session.currentIndex + 1} of {session.questions.length}
      </p>
      {isOpening ? (
        <CaseOpeningReel
          rarity={question.rarity}
          imageSrc={question.image}
          alt="Card to guess"
          difficulty={session.difficulty}
          onFinish={() => {
            setIsOpening(false);
            setStartedAt(Date.now());
            onRevealed();
          }}
        />
      ) : (
        <>
          <img src={question.image} alt="Card to guess" />
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
            {question.set && (
              <>
                <dt>Set</dt>
                <dd>{question.set.name}</dd>
              </>
            )}
            <dt>Rarity</dt>
            <dd>{question.rarity || '—'}</dd>
            <dt>Types</dt>
            <dd>{question.types.join(', ') || '—'}</dd>
          </dl>

          {!feedback ? (
            <form onSubmit={handleSubmitGuess}>
              {session.mode === 'guess_card' ? (
                // Deliberately unscoped (no set/series) — suggestions drawn
                // from the whole catalog are the same regardless of which
                // card this question is actually about, so they can't leak
                // the answer the way scoping to this question's small
                // eligible pool sometimes could. See docs/decisions.md #036.
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
            <div>
              <p>
                {feedback.correct
                  ? 'Correct!'
                  : `Incorrect. The answer was ${feedback.answer}.`}
              </p>
              <button onClick={handleNext}>Next</button>
            </div>
          )}
        </>
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
  onSaved: () => void;
  onPlayAgain: () => void;
}) {
  const score = session.answers.filter((a) => a.is_correct).length;

  const saveAttempt = useMutation({
    mutationFn: () =>
      submitQuizAttempt({ quiz_mode: session.mode, answers: session.answers }),
    onSuccess: onSaved,
  });

  return (
    <div className="quiz-summary">
      <h2>Quiz complete!</h2>
      <p>
        Score: {score} / {session.questions.length}
      </p>
      {isAuthenticated ? (
        session.submitted ? (
          <p>Score saved.</p>
        ) : (
          <>
            <button
              onClick={() => saveAttempt.mutate()}
              disabled={saveAttempt.isPending}
            >
              {saveAttempt.isPending ? 'Saving...' : 'Save score'}
            </button>
            {saveAttempt.isError && <p>Failed to save score. Try again.</p>}
          </>
        )
      ) : (
        <p>Log in to save your score.</p>
      )}
      <button onClick={onPlayAgain}>Play again</button>
    </div>
  );
}

function QuizPage() {
  const session = useQuizStore((s) => s.session);
  const startSession = useQuizStore((s) => s.startSession);
  const recordAnswer = useQuizStore((s) => s.recordAnswer);
  const revealCurrent = useQuizStore((s) => s.revealCurrent);
  const markSubmitted = useQuizStore((s) => s.markSubmitted);
  const abandonSession = useQuizStore((s) => s.abandonSession);
  const isAuthenticated = useAuthStore((s) => s.accessToken !== null);
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
        rarity={firstQuestion?.rarity}
        imageSrc={firstQuestion?.image}
        difficulty={difficulty}
        onFinish={() => {
          revealCurrent();
          setPendingMode(null);
        }}
      />
    );
  }

  if (!session) {
    return (
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
    );
  }

  const isComplete = session.currentIndex >= session.questions.length;

  if (isComplete) {
    return (
      <QuizSummary
        session={session}
        isAuthenticated={isAuthenticated}
        onSaved={markSubmitted}
        onPlayAgain={abandonSession}
      />
    );
  }

  return (
    <QuizQuestionView
      key={session.currentIndex}
      session={session}
      onAnswered={recordAnswer}
      onAbandon={abandonSession}
      onRevealed={revealCurrent}
    />
  );
}

export default QuizPage;
