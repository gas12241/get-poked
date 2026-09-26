import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  checkQuizAnswer,
  getQuizQuestions,
  submitQuizAttempt,
} from '../api/quiz';
import type { QuizAnswerInput, QuizMode } from '../api/quiz';
import type { QuizSession } from '../store/quizStore';
import { useQuizStore } from '../store/quizStore';
import { useAuthStore } from '../store/authStore';
import './pages.css';

const MODES: { value: QuizMode; label: string }[] = [
  { value: 'guess_card', label: 'Guess the Card' },
  { value: 'guess_set', label: 'Guess the Set' },
  { value: 'guess_hp', label: 'Guess the HP' },
];

function ModeSelection({
  onSelect,
  isPending,
  error,
}: {
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
      {error && <p>Failed to start quiz: {error}</p>}
    </div>
  );
}

function QuizQuestionView({
  session,
  onAnswered,
  onAbandon,
}: {
  session: QuizSession;
  onAnswered: (answer: QuizAnswerInput) => void;
  onAbandon: () => void;
}) {
  const [guess, setGuess] = useState('');
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    answer: string;
  } | null>(null);
  const [startedAt] = useState(() => Date.now());

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
      time_taken_seconds: (Date.now() - startedAt) / 1000,
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
          <input
            aria-label="Your guess"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
          />
          <button type="submit" disabled={checkMutation.isPending || !guess}>
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
  const markSubmitted = useQuizStore((s) => s.markSubmitted);
  const abandonSession = useQuizStore((s) => s.abandonSession);
  const isAuthenticated = useAuthStore((s) => s.accessToken !== null);

  const startQuiz = useMutation({
    mutationFn: (mode: QuizMode) => getQuizQuestions({ mode }),
    onSuccess: (data, mode) => startSession(mode, data.questions),
  });

  if (!session) {
    return (
      <ModeSelection
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
    />
  );
}

export default QuizPage;
