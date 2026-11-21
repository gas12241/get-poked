// Hand-rolled month-grid math, no date library — same reasoning and the
// same UTC-only approach as HoroscopeCalendar.tsx (every computation goes
// through Date.UTC/getUTC* so it never drifts a day for some viewers).
// Not a shared component with HoroscopeCalendar — selecting a day here
// opens a *list* of that day's attempts (possibly several), not a single
// item, so the two widgets diverge enough below this point to not be
// worth forcing together. See docs/decisions.md #088.
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseMonth(month: string): { year: number; month: number } {
  const [year, monthNum] = month.split('-').map(Number);
  return { year, month: monthNum };
}

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function currentUtcMonth(): string {
  const now = new Date();
  return formatMonth(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

export function addMonths(month: string, delta: number): string {
  const { year, month: monthNum } = parseMonth(month);
  const total = year * 12 + (monthNum - 1) + delta;
  return formatMonth(Math.floor(total / 12), (((total % 12) + 12) % 12) + 1);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function firstWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

function monthLabel(year: number, month: number): string {
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
    'en-US',
    {
      month: 'long',
      timeZone: 'UTC',
    },
  );
  return `${name} ${year}`;
}

interface QuizHistoryCalendarProps {
  month: string; // "YYYY-MM", the currently-viewed month
  onMonthChange: (month: string) => void;
  datesWithAttempts: Set<string>; // "YYYY-MM-DD"
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

// A normal month grid, but only days with a saved attempt are actually
// clickable — every other day renders as plain, non-interactive text, kept
// in the grid (not hidden) so the month still reads correctly (right
// weekday alignment) without inviting a click that goes nowhere.
function QuizHistoryCalendar({
  month,
  onMonthChange,
  datesWithAttempts,
  selectedDate,
  onSelectDate,
}: QuizHistoryCalendarProps) {
  const { year, month: monthNum } = parseMonth(month);
  const totalDays = daysInMonth(year, monthNum);
  const leadingBlanks = firstWeekday(year, monthNum);
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);

  return (
    <div className="quiz-history-calendar">
      <div className="quiz-history-calendar-header">
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, -1))}
          aria-label="Previous month"
        >
          &larr;
        </button>
        <p className="quiz-history-calendar-month-label">
          {monthLabel(year, monthNum)}
        </p>
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, 1))}
          aria-label="Next month"
        >
          &rarr;
        </button>
      </div>

      <div className="quiz-history-calendar-weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="quiz-history-calendar-grid">
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} className="quiz-history-calendar-cell" />
        ))}
        {days.map((day) => {
          const dateStr = `${month}-${String(day).padStart(2, '0')}`;
          if (!datesWithAttempts.has(dateStr)) {
            return (
              <span
                key={dateStr}
                className="quiz-history-calendar-cell quiz-history-calendar-day-empty"
              >
                {day}
              </span>
            );
          }
          const className =
            dateStr === selectedDate
              ? 'quiz-history-calendar-cell quiz-history-calendar-day quiz-history-calendar-day-selected'
              : 'quiz-history-calendar-cell quiz-history-calendar-day';
          return (
            <button
              key={dateStr}
              type="button"
              className={className}
              onClick={() => onSelectDate(dateStr)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default QuizHistoryCalendar;
