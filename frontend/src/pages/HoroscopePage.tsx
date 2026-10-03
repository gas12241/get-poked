import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getHoroscopePullDates,
  getHoroscopePullForDate,
  pullTodayHoroscope,
} from '../api/horoscope';
import type { HoroscopeCard, HoroscopePull } from '../api/horoscope';
import { useIsAuthenticated } from '../store/authStore';
import HoroscopeReel from '../components/HoroscopeReel';
import type { HoroscopeSlotResult } from '../components/HoroscopeReel';
import HoroscopeCalendar, {
  currentUtcMonth,
} from '../components/HoroscopeCalendar';
import './pages.css';

// The fixed slot layout backend/horoscope/selection.py always produces:
// indices 0-4 are the 5 Pokémon, 5 is Trainer, 6 is Energy. Splitting on
// this fixed boundary (not by each card's own supertype) keeps the
// Pokémon row and the Trainer+Energy row deliberate regardless of flex-wrap
// — at 7 cards per row they don't all fit on one line anyway, and letting
// the browser wrap wherever it happens to fit stranded Energy alone on its
// own row. See docs/decisions.md #062.
const POKEMON_ROW_SIZE = 5;

function splitIntoRows<T>(items: T[]): [T[], T[]] {
  return [items.slice(0, POKEMON_ROW_SIZE), items.slice(POKEMON_ROW_SIZE)];
}

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

// pull_date is a plain "YYYY-MM-DD" UTC calendar-date string with no
// time-of-day meaning — parsed by splitting the string directly rather
// than via `new Date(dateStr)` + local getters, which would risk rolling
// back to the previous day for a viewer west of UTC (the classic
// UTC-midnight-parsed-then-read-in-local-time gotcha). This is a display
// format for "which day," not a moment in time to convert to the viewer's
// own timezone the way the reset countdown above is.
export function formatHoroscopeDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${ordinal(day)}, ${year}`;
}

function toSlots(pull: HoroscopePull): HoroscopeSlotResult[] {
  return pull.cards.map((c) => ({
    supertype: c.supertype,
    rarityTier: c.rarity_tier,
    imageSrc: c.card.image_small,
    // The real card name, not a generic placeholder — unlike the quiz's
    // reel (docs/decisions.md #040), there's no answer to guess here, so
    // nothing is spoiled by announcing it.
    alt: c.card.name,
  }));
}

// Shared by the "today" result grid and the selected-calendar-day panel
// below — same image + clickable, pill-styled name treatment in both
// places. alt="" on the image is deliberate, not an oversight: the label
// right below already gives the name as real text, both visually and to a
// screen reader, so a non-empty alt would announce the same name twice.
function HoroscopeCardTile({
  card,
  className,
}: {
  card: HoroscopeCard;
  className: string;
}) {
  return (
    <Link
      to={`/cards/${card.card.id}`}
      state={{ from: 'horoscope' }}
      className={`horoscope-card-tile ${className}`}
    >
      <img src={card.card.image_small} alt="" />
      <p className="horoscope-card-tile-label">{card.card.name}</p>
    </Link>
  );
}

function HoroscopeResultGrid({ pull }: { pull: HoroscopePull }) {
  const [pokemonRow, trainerEnergyRow] = splitIntoRows(pull.cards);
  return (
    <div className="horoscope-result-grid">
      {[pokemonRow, trainerEnergyRow].map((row, i) => (
        <div key={i} className="horoscope-row">
          {row.map((c) => (
            <HoroscopeCardTile
              key={c.order}
              card={c}
              className="horoscope-result-card"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function HoroscopePage() {
  const isAuthenticated = useIsAuthenticated();
  const queryClient = useQueryClient();
  // Only ever set by a successful pull in *this* page session — the signal
  // that the reveal animation should play. A pull already on the server
  // from before this mount (reload, or a previous visit today) is never
  // assigned here, so it never replays.
  const [freshPull, setFreshPull] = useState<HoroscopePull | null>(null);
  const [revealDone, setRevealDone] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // A UTC calendar-date string ("YYYY-MM-DD") — toISOString() always
  // returns UTC regardless of the viewer's local timezone, so this matches
  // the backend's own pull_date exactly with no conversion needed.
  const todayUtc = new Date().toISOString().slice(0, 10);
  // The calendar's visible month lives in the URL (?month=YYYY-MM), same
  // reasoning as CardListPage's own filters: navigating away and back (or
  // reloading) restores the month you were looking at, instead of always
  // resetting to the current one.
  const month = searchParams.get('month') ?? currentUtcMonth();

  // Checked read-only via the detail-by-date endpoint, not the idempotent
  // POST — that one must stay reserved for the deliberate "Pull" button
  // click (see docs/decisions.md #061), not fired as a side effect of just
  // loading the page.
  const todayPullQuery = useQuery({
    queryKey: ['horoscope-pull', todayUtc],
    queryFn: () => getHoroscopePullForDate(todayUtc),
    enabled: isAuthenticated,
  });

  const datesQuery = useQuery({
    queryKey: ['horoscope-pull-dates', month],
    queryFn: () => getHoroscopePullDates(month),
    enabled: isAuthenticated,
  });

  const selectedPullQuery = useQuery({
    queryKey: ['horoscope-pull', selectedDate],
    queryFn: () => getHoroscopePullForDate(selectedDate as string),
    enabled: selectedDate !== null,
  });

  const pullMutation = useMutation({
    mutationFn: pullTodayHoroscope,
    onSuccess: (pull) => {
      // Broad invalidation (every cached month, not just the current one)
      // — simpler than figuring out which month today belongs to, and
      // harmless: an invalidated query just refetches next time it's shown.
      queryClient.invalidateQueries({ queryKey: ['horoscope-pull-dates'] });
      queryClient.setQueryData(['horoscope-pull', todayUtc], pull);
      setFreshPull(pull);
      setRevealDone(false);
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="horoscope-page">
        <h1>Horoscope</h1>
        <p>Log in to pull your daily horoscope.</p>
      </div>
    );
  }

  if (todayPullQuery.isLoading) {
    return (
      <div className="horoscope-page">
        <h1>Horoscope</h1>
        <p>Loading...</p>
      </div>
    );
  }

  const pullForToday = freshPull ?? todayPullQuery.data ?? null;
  const showReveal = freshPull !== null && !revealDone;
  const datesWithPulls = new Set(datesQuery.data?.dates ?? []);

  const resetInfo = nextResetInfo();

  return (
    <div className="horoscope-page">
      <h1>Horoscope</h1>
      {pullForToday && (
        <p className="horoscope-reset-notice">
          Here are your 5 Pokémon, 1 Trainer, and 1 Energy for the day!
        </p>
      )}
      <p className="horoscope-reset-notice">
        Resets daily at midnight UTC — {resetInfo.localTime} your time, in{' '}
        {resetInfo.hoursRemaining}.
      </p>

      {showReveal && freshPull && (
        <HoroscopeReel
          slots={toSlots(freshPull)}
          onFinish={() => setRevealDone(true)}
        />
      )}
      {!showReveal && pullForToday && (
        <HoroscopeResultGrid pull={pullForToday} />
      )}
      {!showReveal && !pullForToday && (
        <>
          <button
            className="horoscope-pull-button"
            onClick={() => pullMutation.mutate()}
            disabled={pullMutation.isPending}
          >
            {pullMutation.isPending ? 'Pulling...' : "Pull today's horoscope"}
          </button>
          {pullMutation.isError && (
            <p>Failed to pull your horoscope. Try again.</p>
          )}
        </>
      )}

      <h2 className="horoscope-calendar-heading">Past horoscopes</h2>
      <HoroscopeCalendar
        month={month}
        onMonthChange={(newMonth) =>
          setSearchParams({ month: newMonth }, { replace: true })
        }
        datesWithPulls={datesWithPulls}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
      {selectedDate && selectedPullQuery.isLoading && <p>Loading...</p>}
      {selectedDate && selectedPullQuery.data && (
        <>
          <p className="horoscope-selected-date">
            {formatHoroscopeDate(selectedDate)}
          </p>
          <HoroscopeResultGrid pull={selectedPullQuery.data} />
        </>
      )}
    </div>
  );
}

// The user explicitly asked for both pieces: when the daily reset happens
// (stated in UTC, since that's what actually governs it) and how long that
// is from now in terms relevant to them — their own local clock time, not
// just a UTC timestamp they'd have to convert themselves.
function nextResetInfo() {
  const now = new Date();
  const nextUtcMidnightMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  const nextReset = new Date(nextUtcMidnightMs);

  const minutesRemaining = Math.max(
    0,
    Math.round((nextUtcMidnightMs - now.getTime()) / (1000 * 60)),
  );
  const hours = Math.floor(minutesRemaining / 60);
  const minutes = minutesRemaining % 60;

  return {
    // Rendered in the viewer's own local timezone automatically — toLocaleTimeString()
    // (unlike toISOString()) uses the browser's locale/timezone, not UTC.
    localTime: nextReset.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }),
    hoursRemaining: `${hours}h ${minutes}m`,
  };
}

export default HoroscopePage;
