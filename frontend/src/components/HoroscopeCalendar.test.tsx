import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HoroscopeCalendar, {
  addMonths,
  currentUtcMonth,
} from './HoroscopeCalendar';

describe('addMonths', () => {
  it('steps forward within a year', () => {
    expect(addMonths('2026-09', 1)).toBe('2026-10');
  });

  it('steps backward within a year', () => {
    expect(addMonths('2026-09', -1)).toBe('2026-08');
  });

  it('rolls forward across a year boundary', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });

  it('rolls backward across a year boundary', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
});

describe('currentUtcMonth', () => {
  it('returns a "YYYY-MM" string matching the real current UTC month', () => {
    const now = new Date();
    const expected = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    expect(currentUtcMonth()).toBe(expected);
  });
});

describe('HoroscopeCalendar', () => {
  it('only renders days with a pull as clickable buttons, others as plain text', () => {
    render(
      <HoroscopeCalendar
        month="2026-09"
        onMonthChange={() => {}}
        datesWithPulls={new Set(['2026-09-05', '2026-09-20'])}
        selectedDate={null}
        onSelectDate={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '20' })).toBeInTheDocument();
    // September has 30 days — day 1 (no pull) must still appear, just as
    // plain text, so the grid's weekday alignment stays correct.
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1' })).not.toBeInTheDocument();
  });

  it('shows the correct month/year label', () => {
    render(
      <HoroscopeCalendar
        month="2026-09"
        onMonthChange={() => {}}
        datesWithPulls={new Set()}
        selectedDate={null}
        onSelectDate={() => {}}
      />,
    );

    expect(screen.getByText('September 2026')).toBeInTheDocument();
  });

  it('calls onSelectDate with the full date when an enabled day is clicked', async () => {
    const onSelectDate = vi.fn();
    render(
      <HoroscopeCalendar
        month="2026-09"
        onMonthChange={() => {}}
        datesWithPulls={new Set(['2026-09-05'])}
        selectedDate={null}
        onSelectDate={onSelectDate}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '5' }));

    expect(onSelectDate).toHaveBeenCalledWith('2026-09-05');
  });

  it('marks the selected date distinctly from the other clickable days', () => {
    const { container } = render(
      <HoroscopeCalendar
        month="2026-09"
        onMonthChange={() => {}}
        datesWithPulls={new Set(['2026-09-05', '2026-09-20'])}
        selectedDate="2026-09-05"
        onSelectDate={() => {}}
      />,
    );

    expect(
      container.querySelector('.horoscope-calendar-day-selected'),
    ).toHaveTextContent('5');
  });

  it('calls onMonthChange with the adjacent month when the nav buttons are clicked', async () => {
    const onMonthChange = vi.fn();
    render(
      <HoroscopeCalendar
        month="2026-09"
        onMonthChange={onMonthChange}
        datesWithPulls={new Set()}
        selectedDate={null}
        onSelectDate={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-10');

    await userEvent.click(
      screen.getByRole('button', { name: 'Previous month' }),
    );
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-08');
  });
});
