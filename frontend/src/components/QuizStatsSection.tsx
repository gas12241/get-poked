import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getQuizAttemptStats } from '../api/quiz';
import type { QuizAttemptStatsSummary } from '../api/quiz';
import {
  formatAccuracy,
  formatQuizHistoryDate,
  formatScoreFraction,
  modeLabel,
} from '../lib/quizAttemptFormatting';

// A reusable "correct/total (accuracy%)" — or an em dash when nothing's
// been played, same null-not-zero reasoning as formatAccuracy itself.
function scoreText(
  correct: number,
  totalQuestions: number,
  accuracy: number | null,
): string {
  return accuracy === null
    ? '—'
    : `${formatScoreFraction(correct, totalQuestions)} (${formatAccuracy(accuracy)})`;
}

// No heading of its own — the active toggle button above already says
// which period this is, so repeating it here would just be the same
// label twice.
function StatsPeriod({ summary }: { summary: QuizAttemptStatsSummary }) {
  return (
    <div className="quiz-stats-period">
      <p className="quiz-stats-summary-line">
        {summary.attempts} {summary.attempts === 1 ? 'quiz' : 'quizzes'} ·{' '}
        {summary.accuracy === null
          ? '—'
          : `${formatScoreFraction(summary.correct, summary.total_questions)} correct (${formatAccuracy(summary.accuracy)})`}
      </p>
      <ul className="quiz-stats-mode-list">
        {summary.by_mode.map((row) => (
          <li key={row.mode}>
            <span>{modeLabel(row.mode)}</span>
            <span>
              {scoreText(row.correct, row.total_questions, row.accuracy)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// "Today" in UTC terms, same day boundary QuizHistoryCalendar already uses
// (see docs/decisions.md #088/#097) — only used to decide the day panel's
// label (not which day is requested any more; the backend resolves that
// default itself, see docs/decisions.md #102).
function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function QuizStatsSection({ isAuthenticated }: { isAuthenticated: boolean }) {
  // Shares QuizHistorySection's own `date` URL param rather than keeping a
  // second, separate notion of "which day" — picking a day on the history
  // calendar updates this section's day panel too, without any prop
  // wiring between the two sibling sections. Left unset (not defaulted to
  // today here) so the backend can resolve its own default — the most
  // recently played date — instead. See docs/decisions.md #098/#102.
  const [searchParams] = useSearchParams();
  const selectedDate = searchParams.get('date') ?? undefined;

  const statsQuery = useQuery({
    queryKey: ['quiz-attempt-stats', selectedDate ?? 'latest'],
    queryFn: () => getQuizAttemptStats(selectedDate),
    enabled: isAuthenticated,
  });

  // Only one panel shown at a time, matching every other control on this
  // page (one mode/difficulty/length picker, one selected history day) —
  // the always-both-columns layout was the one thing on /quiz that didn't
  // follow that. Day is the default/active view; not persisted to the
  // URL, since it's light, ephemeral UI state and QuizHistorySection's own
  // `date`/`month` params already own the one durable, deep-linkable
  // selection. See docs/decisions.md #102.
  const [isCareerView, setIsCareerView] = useState(false);

  // Picking a day on the history calendar below should show that day's
  // stats immediately, the same way it already updated the "Today" column
  // before this became a toggle (docs/decisions.md #098) — so a change to
  // the shared `date` param switches back to the day panel rather than
  // leaving Career showing while a different day loads silently behind it.
  // Adjusted during render (React's documented pattern for resetting state
  // when a prop/derived value changes), not in an effect, which would
  // cause an extra cascading render for the same result.
  const [prevSelectedDate, setPrevSelectedDate] = useState(selectedDate);
  if (selectedDate !== prevSelectedDate) {
    setPrevSelectedDate(selectedDate);
    setIsCareerView(false);
  }

  if (!isAuthenticated) {
    return (
      <div className="quiz-stats-section">
        <h2>Quiz stats</h2>
        <p>Log in to see your quiz stats.</p>
      </div>
    );
  }

  if (statsQuery.isLoading) {
    return (
      <div className="quiz-stats-section">
        <h2>Quiz stats</h2>
        <p>Loading...</p>
      </div>
    );
  }

  if (!statsQuery.data) {
    return (
      <div className="quiz-stats-section">
        <h2>Quiz stats</h2>
        <p>Failed to load your quiz stats.</p>
      </div>
    );
  }

  const dayLabel =
    statsQuery.data.date === currentUtcDate()
      ? 'Today'
      : formatQuizHistoryDate(statsQuery.data.date);

  return (
    <div className="quiz-stats-section">
      <h2>Quiz stats</h2>
      <div
        className="quiz-picker"
        role="radiogroup"
        aria-label="Quiz stats period"
      >
        <button
          type="button"
          role="radio"
          aria-checked={isCareerView}
          className={isCareerView ? 'active' : undefined}
          onClick={() => setIsCareerView(true)}
        >
          Career
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!isCareerView}
          className={isCareerView ? undefined : 'active'}
          onClick={() => setIsCareerView(false)}
        >
          {dayLabel}
        </button>
      </div>
      {isCareerView ? (
        <StatsPeriod summary={statsQuery.data.career} />
      ) : (
        <StatsPeriod summary={statsQuery.data.today} />
      )}
    </div>
  );
}

export default QuizStatsSection;
