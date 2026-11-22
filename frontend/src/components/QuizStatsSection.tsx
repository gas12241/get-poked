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

function StatsPeriod({
  title,
  summary,
}: {
  title: string;
  summary: QuizAttemptStatsSummary;
}) {
  return (
    <div className="quiz-stats-period">
      <h3>{title}</h3>
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
// (see docs/decisions.md #088/#097) — computed once per mount, not
// re-derived on every render, since re-running it mid-session would
// silently roll "today" over to a new day under the viewer without a
// refetch ever being triggered.
function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function QuizStatsSection({ isAuthenticated }: { isAuthenticated: boolean }) {
  const today = currentUtcDate();
  // Shares QuizHistorySection's own `date` URL param rather than keeping a
  // second, separate notion of "which day" — picking a day on the history
  // calendar makes this column's "Today" become that day's own stats
  // instead, without any prop wiring between the two sibling sections.
  // Falls back to the real UTC today when nothing's been selected yet (or
  // once a selection is cleared). See docs/decisions.md #098.
  const [searchParams] = useSearchParams();
  const selectedDate = searchParams.get('date') ?? today;

  const statsQuery = useQuery({
    queryKey: ['quiz-attempt-stats', selectedDate],
    queryFn: () => getQuizAttemptStats(selectedDate),
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="quiz-stats-section">
        <h2>Quiz stats</h2>
        <p>Log in to see your quiz stats.</p>
      </div>
    );
  }

  const periodTitle =
    selectedDate === today ? 'Today' : formatQuizHistoryDate(selectedDate);

  return (
    <div className="quiz-stats-section">
      <h2>Quiz stats</h2>
      {statsQuery.isLoading ? (
        <p>Loading...</p>
      ) : statsQuery.data ? (
        <div className="quiz-stats-columns">
          <StatsPeriod title={periodTitle} summary={statsQuery.data.today} />
          <StatsPeriod title="Career" summary={statsQuery.data.career} />
        </div>
      ) : (
        <p>Failed to load your quiz stats.</p>
      )}
    </div>
  );
}

export default QuizStatsSection;
