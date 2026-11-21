import type { QuizAttemptSummary } from '../api/quiz';
import { DIFFICULTIES, MODES } from './quizOptions';

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

export function formatQuizHistoryDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${ordinal(day)}, ${year}`;
}

// The viewer's own local time, not UTC — toLocaleTimeString() (unlike
// toISOString()) already converts for us, same approach as
// HoroscopePage's reset-time display.
export function formatQuizAttemptTime(completedAt: string): string {
  return new Date(completedAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function modeLabel(mode: QuizAttemptSummary['quiz_mode']) {
  return MODES.find((m) => m.value === mode)?.label ?? mode;
}

export function difficultyLabel(difficulty: QuizAttemptSummary['difficulty']) {
  return DIFFICULTIES.find((d) => d.value === difficulty)?.label ?? difficulty;
}
