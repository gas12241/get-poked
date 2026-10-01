import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getHoroscopeHistory, pullTodayHoroscope } from '../api/horoscope';
import type { HoroscopePull } from '../api/horoscope';
import { useAuthStore } from '../store/authStore';
import HoroscopeReel from '../components/HoroscopeReel';
import type { HoroscopeSlotResult } from '../components/HoroscopeReel';
import './pages.css';

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

function HoroscopeResultGrid({ pull }: { pull: HoroscopePull }) {
  return (
    <div className="horoscope-result-grid">
      {pull.cards.map((c) => (
        <div key={c.order} className="horoscope-result-card">
          <img src={c.card.image_small} alt={c.card.name} />
          <p className="horoscope-result-card-label">{`${c.supertype} · ${c.rarity_tier}`}</p>
        </div>
      ))}
    </div>
  );
}

function HoroscopeHistory({ pulls }: { pulls: HoroscopePull[] }) {
  if (pulls.length === 0) return null;
  return (
    <div className="horoscope-history">
      <h2>Past horoscopes</h2>
      {pulls.map((pull) => (
        <div key={pull.id} className="horoscope-history-entry">
          <p className="horoscope-history-entry-date">{pull.pull_date}</p>
          <div className="horoscope-history-entry-cards">
            {pull.cards.map((c) => (
              <img key={c.order} src={c.card.image_small} alt={c.card.name} />
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

  const resetInfo = nextResetInfo();

  return (
    <div className="horoscope-page">
      <h1>Horoscope</h1>
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

      <HoroscopeHistory pulls={pulls} />
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
