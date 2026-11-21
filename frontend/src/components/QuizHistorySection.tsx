import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  getQuizAttemptDates,
  getQuizAttemptDetail,
  getQuizAttemptsByDate,
} from '../api/quiz';
import type { QuizAttemptSummary } from '../api/quiz';
import { DIFFICULTIES, MODES } from '../lib/quizOptions';
import QuizHistoryCalendar, { currentUtcMonth } from './QuizHistoryCalendar';
import QuizAttemptBreakdown from './QuizAttemptBreakdown';

// Same formatting (and the same UTC-safe split-the-string-directly
// parsing, not `new Date(dateStr)` + local getters) as Horoscope's own
// formatHoroscopeDate — duplicated rather than imported, consistent with
// QuizHistoryCalendar's own date-math being a deliberate near-duplicate of
// HoroscopeCalendar's (see docs/decisions.md #090): a "component" file
// reaching into a "page" file for a few lines is a worse trade than a
// small, stable, already-tested function copied once.
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function ordinal(day: number): string {
  if (day % 10 === 1 && day % 100 !== 11) return `${day}st`;
  if (day % 10 === 2 && day % 100 !== 12) return `${day}nd`;
  if (day % 10 === 3 && day % 100 !== 13) return `${day}rd`;
  return `${day}th`;
}

function formatQuizHistoryDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${ordinal(day)}, ${year}`;
}

// The viewer's own local time, not UTC — toLocaleTimeString() (unlike
// toISOString()) already converts for us, same approach as
// HoroscopePage's reset-time display.
function formatQuizAttemptTime(completedAt: string): string {
  return new Date(completedAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function modeLabel(mode: QuizAttemptSummary['quiz_mode']) {
  return MODES.find((m) => m.value === mode)?.label ?? mode;
}

function difficultyLabel(difficulty: QuizAttemptSummary['difficulty']) {
  return DIFFICULTIES.find((d) => d.value === difficulty)?.label ?? difficulty;
}

function AttemptRow({ attempt }: { attempt: QuizAttemptSummary }) {
  const [expanded, setExpanded] = useState(false);
  const detailQuery = useQuery({
    queryKey: ['quiz-attempt-detail', attempt.id],
    queryFn: () => getQuizAttemptDetail(attempt.id),
    enabled: expanded,
  });

  return (
    <li className="quiz-attempt-row">
      <button
        type="button"
        className="quiz-attempt-row-summary"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        <span>{modeLabel(attempt.quiz_mode)}</span>
        <span>{difficultyLabel(attempt.difficulty)}</span>
        <span>{attempt.total_questions} questions</span>
        <span>{formatQuizAttemptTime(attempt.completed_at)}</span>
        <span>
          {attempt.score} / {attempt.total_questions}
        </span>
        <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded &&
        (detailQuery.isLoading ? (
          <p>Loading...</p>
        ) : detailQuery.data ? (
          <QuizAttemptBreakdown answers={detailQuery.data.answers} />
        ) : null)}
    </li>
  );
}

function QuizHistorySection({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const month = searchParams.get('month') ?? currentUtcMonth();

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
          setSearchParams({ month: newMonth }, { replace: true })
        }
        datesWithAttempts={new Set(datesQuery.data?.dates ?? [])}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
      {selectedDate && (
        <div className="quiz-history-day">
          <h3>{formatQuizHistoryDate(selectedDate)}</h3>
          {byDateQuery.isLoading ? (
            <p>Loading...</p>
          ) : byDateQuery.data && byDateQuery.data.length > 0 ? (
            <ul className="quiz-attempt-list">
              {byDateQuery.data.map((attempt) => (
                <AttemptRow key={attempt.id} attempt={attempt} />
              ))}
            </ul>
          ) : (
            <p>No quizzes taken this day.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default QuizHistorySection;
