import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getQuizAttemptDates, getQuizAttemptsByDate } from '../api/quiz';
import type { QuizAttemptSummary } from '../api/quiz';
import {
  difficultyLabel,
  formatQuizAttemptTime,
  formatQuizHistoryDate,
  modeLabel,
} from '../lib/quizAttemptFormatting';
import QuizHistoryCalendar, { currentUtcMonth } from './QuizHistoryCalendar';

// Matches .quiz-attempt-list's own max-height (pages.css) — past this many
// attempts in one day, the list scrolls internally instead of growing the
// whole page, so a prolific quiz-taking day doesn't make /quiz unbounded.
const VISIBLE_ATTEMPT_ROWS = 4;

function AttemptRow({ attempt }: { attempt: QuizAttemptSummary }) {
  return (
    <li>
      <Link
        to={`/quiz-history/${attempt.id}`}
        state={{ from: 'quiz' }}
        className="quiz-attempt-row-summary"
      >
        <span>{modeLabel(attempt.quiz_mode)}</span>
        <span>{difficultyLabel(attempt.difficulty)}</span>
        <span>{attempt.total_questions} questions</span>
        <span>{formatQuizAttemptTime(attempt.completed_at)}</span>
        <span>
          {attempt.score} / {attempt.total_questions}
        </span>
        <span aria-hidden="true">›</span>
      </Link>
    </li>
  );
}

function QuizHistorySection({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get('month') ?? currentUtcMonth();
  const selectedDate = searchParams.get('date');

  const datesQuery = useQuery({
    queryKey: ['quiz-attempt-dates', month],
    queryFn: () => getQuizAttemptDates(month),
    enabled: isAuthenticated,
  });

  const byDateQuery = useQuery({
    queryKey: ['quiz-attempts-by-date', selectedDate],
    queryFn: () => getQuizAttemptsByDate(selectedDate as string),
    enabled: isAuthenticated && selectedDate !== null,
  });

  if (!isAuthenticated) {
    return (
      <div className="quiz-history-section">
        <h2>Quiz history</h2>
        <p>Log in to see your quiz history.</p>
      </div>
    );
  }

  return (
    <div className="quiz-history-section">
      <h2>Quiz history</h2>
      <QuizHistoryCalendar
        month={month}
        onMonthChange={(newMonth) =>
          setSearchParams(
            selectedDate
              ? { month: newMonth, date: selectedDate }
              : { month: newMonth },
            { replace: true },
          )
        }
        datesWithAttempts={new Set(datesQuery.data?.dates ?? [])}
        selectedDate={selectedDate}
        onSelectDate={(date) =>
          setSearchParams({ month, date }, { replace: true })
        }
      />
      {selectedDate && (
        <div className="quiz-history-day">
          <h3>{formatQuizHistoryDate(selectedDate)}</h3>
          {byDateQuery.isLoading ? (
            <p>Loading...</p>
          ) : byDateQuery.data && byDateQuery.data.length > 0 ? (
            <>
              <ul className="quiz-attempt-list">
                {byDateQuery.data.map((attempt) => (
                  <AttemptRow key={attempt.id} attempt={attempt} />
                ))}
              </ul>
              {byDateQuery.data.length > VISIBLE_ATTEMPT_ROWS && (
                <p className="quiz-attempt-list-scroll-hint">
                  ↓ Scroll to see all {byDateQuery.data.length} quizzes
                </p>
              )}
            </>
          ) : (
            <p>No quizzes taken this day.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default QuizHistorySection;
