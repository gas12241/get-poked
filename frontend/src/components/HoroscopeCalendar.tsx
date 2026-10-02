// Hand-rolled month-grid math, no date library — consistent with
// HoroscopePage.tsx's own formatHoroscopeDate/nextResetInfo, which already
// hand-roll UTC-safe date logic rather than reaching for one. Every
// computation here goes through Date.UTC/getUTC* specifically so it never
// depends on the viewer's local timezone — a calendar grid for "which UTC
// day did I pull on" would otherwise risk drifting a day for some viewers.
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
  // Day 0 of next month is the last day of this one.
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

interface HoroscopeCalendarProps {
  month: string; // "YYYY-MM", the currently-viewed month
  onMonthChange: (month: string) => void;
  datesWithPulls: Set<string>; // "YYYY-MM-DD"
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

// A normal month grid, but only days with a saved pull are actually
// clickable — every other day renders as plain, non-interactive text, kept
// in the grid (not hidden) so the month still reads correctly (right
// weekday alignment) without inviting a click that goes nowhere.
function HoroscopeCalendar({
  month,
  onMonthChange,
  datesWithPulls,
  selectedDate,
  onSelectDate,
}: HoroscopeCalendarProps) {
  const { year, month: monthNum } = parseMonth(month);
  const totalDays = daysInMonth(year, monthNum);
  const leadingBlanks = firstWeekday(year, monthNum);
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);

  return (
    <div className="horoscope-calendar">
      <div className="horoscope-calendar-header">
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, -1))}
          aria-label="Previous month"
        >
          &larr;
        </button>
        <p className="horoscope-calendar-month-label">
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

      <div className="horoscope-calendar-weekdays">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="horoscope-calendar-grid">
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} className="horoscope-calendar-cell" />
        ))}
        {days.map((day) => {
          const dateStr = `${month}-${String(day).padStart(2, '0')}`;
          if (!datesWithPulls.has(dateStr)) {
            return (
              <span
                key={dateStr}
                className="horoscope-calendar-cell horoscope-calendar-day-empty"
              >
                {day}
              </span>
            );
          }
          const className =
            dateStr === selectedDate
              ? 'horoscope-calendar-cell horoscope-calendar-day horoscope-calendar-day-selected'
              : 'horoscope-calendar-cell horoscope-calendar-day';
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

export default HoroscopeCalendar;
