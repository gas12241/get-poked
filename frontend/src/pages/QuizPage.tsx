import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  checkQuizAnswer,
  getQuizQuestions,
  submitQuizAttempt,
} from '../api/quiz';
import type { QuizAnswerInput, QuizMode } from '../api/quiz';
import { getCardNames } from '../api/cards';
import type { QuizSession } from '../store/quizStore';
import { useQuizStore } from '../store/quizStore';
import { useAuthStore } from '../store/authStore';
import NameAutocomplete from '../components/NameAutocomplete';
import CaseOpeningReel from '../components/CaseOpeningReel';
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

function ModeSelection({
  questionCount,
  onSelectCount,
  onSelect,
  isPending,
  error,
}: {
  questionCount: number;
  onSelectCount: (count: number) => void;
  onSelect: (mode: QuizMode) => void;
  isPending: boolean;
  error: string | null;
}) {
  return (
    <div className="quiz-mode-selection">
      <h1>Quiz</h1>
      <div className="quiz-mode-buttons">
        {MODES.map((mode) => (
          <button
            key={mode.value}
            onClick={() => onSelect(mode.value)}
            disabled={isPending}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <p className="quiz-count-label">Quiz length</p>
      <div
        className="quiz-count-picker"
        role="radiogroup"
        aria-label="Quiz length"
      >
        {QUESTION_COUNTS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={questionCount === value}
            className={questionCount === value ? 'active' : undefined}
            onClick={() => onSelectCount(value)}
            disabled={isPending}
          >
            {label} ({value})
          </button>
        ))}
      </div>
      {error && <p>Failed to start quiz: {error}</p>}
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
  const [questionCount, setQuestionCount] = useState(5);

  const startQuiz = useMutation({
    mutationFn: (mode: QuizMode) =>
      getQuizQuestions({ mode, count: questionCount }),
    onSuccess: (data, mode) => startSession(mode, data.questions),
  });

  if (!session) {
    return (
      <ModeSelection
        questionCount={questionCount}
        onSelectCount={setQuestionCount}
        onSelect={(mode) => startQuiz.mutate(mode)}
        isPending={startQuiz.isPending}
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
