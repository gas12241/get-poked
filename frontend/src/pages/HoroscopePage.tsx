import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getHoroscopeHistory, pullTodayHoroscope } from '../api/horoscope';
import type { HoroscopeCard, HoroscopePull } from '../api/horoscope';
import { useAuthStore } from '../store/authStore';
import HoroscopeReel from '../components/HoroscopeReel';
import type { HoroscopeSlotResult } from '../components/HoroscopeReel';
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

// Shared by the "today" result grid and the history list below — same
// image + clickable, pill-styled name treatment in both places, just at a
// different size (controlled by `className`, which sets --horoscope-card-width
// locally). alt="" on the image is deliberate, not an oversight: the label
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

function HoroscopeHistory({ pulls }: { pulls: HoroscopePull[] }) {
  return (
    <div className="horoscope-history">
      <h2>Past horoscopes</h2>
      {pulls.length === 0 && <p>No past horoscopes yet.</p>}
      {pulls.map((pull) => (
        <div key={pull.id} className="horoscope-history-entry">
          <p className="horoscope-history-entry-date">
            {formatHoroscopeDate(pull.pull_date)}
          </p>
          <div className="horoscope-history-entry-cards">
            {pull.cards.map((c) => (
              <HoroscopeCardTile
                key={c.order}
                card={c}
                className="horoscope-history-card"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HoroscopePage() {
  const isAuthenticated = useAuthStore((s) => s.accessToken !== null);
  const queryClient = useQueryClient();
  // Only ever set by a successful pull in *this* page session — the signal
  // that the reveal animation should play. A pull already on the server
  // from before this mount (reload, or a previous visit today) is never
  // assigned here, so it never replays.
  const [freshPull, setFreshPull] = useState<HoroscopePull | null>(null);
  const [revealDone, setRevealDone] = useState(false);

  const historyQuery = useQuery({
    queryKey: ['horoscope-history'],
    queryFn: getHoroscopeHistory,
    enabled: isAuthenticated,
  });

  const pullMutation = useMutation({
    mutationFn: pullTodayHoroscope,
    onSuccess: (pull) => {
      queryClient.invalidateQueries({ queryKey: ['horoscope-history'] });
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

  if (historyQuery.isLoading) {
    return (
      <div className="horoscope-page">
        <h1>Horoscope</h1>
        <p>Loading...</p>
      </div>
    );
  }

  // A UTC calendar-date string ("YYYY-MM-DD") — toISOString() always
  // returns UTC regardless of the viewer's local timezone, so this matches
  // the backend's own pull_date exactly with no conversion needed.
  const todayUtc = new Date().toISOString().slice(0, 10);
  const pulls = historyQuery.data?.results ?? [];
  const todaysPullFromHistory = pulls.find((p) => p.pull_date === todayUtc);
  const pullForToday = freshPull ?? todaysPullFromHistory;
  const showReveal = freshPull !== null && !revealDone;
  // Today's pull is shown above as "today's horoscope," not as history —
  // it isn't part of the *past* until the day it belongs to has actually
  // passed. The common case this produces "No past horoscopes yet" for is
  // exactly the first pull ever, before there's a second day to compare it
  // to.
  const pastPulls = pulls.filter((p) => p.pull_date !== todayUtc);

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

      <HoroscopeHistory pulls={pastPulls} />
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
