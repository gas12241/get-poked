import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { CardBack } from './CaseOpeningReel';
import type { Tier } from './CaseOpeningReel';

// Shorter than the quiz's single-reel constants (SPIN_DURATION_MS=3500,
// FLIP_DURATION_MS=1000 in CaseOpeningReel.tsx) — there are 7 of these
// reels, so the same durations would make the full reveal take far too
// long. Tuned by eye against the real 7-reel layout, same as the quiz
// reel's own constants were (docs/decisions.md #053, #055).
export const HOROSCOPE_SPIN_DURATION_MS = 1300;
export const HOROSCOPE_FLIP_DURATION_MS = 600;
// Delay between each reel's own spin starting, so they stop left to right
// in a cascade rather than all at once or one at a time. Fixed per-reel
// delay (index * STAGGER_MS), not "wait for the previous reel to finish" —
// simpler to reason about and test, since each reel's own timers are
// entirely self-contained. See docs/decisions.md #061.
export const HOROSCOPE_STAGGER_MS = 200;

const FLICKER_INTERVAL_MS = 90;
const FLICKER_TIERS: Tier[] = ['common', 'mid', 'chase'];

export interface HoroscopeSlotResult {
  supertype: string;
  rarityTier: Tier;
  imageSrc: string;
  alt: string;
}

interface HoroscopeSlotReelProps extends HoroscopeSlotResult {
  startDelayMs: number;
  skipAnimation: boolean;
  onDone: () => void;
}

type SlotPhase = 'waiting' | 'spinning' | 'landed' | 'done';

function HoroscopeSlotReel({
  rarityTier,
  imageSrc,
  alt,
  startDelayMs,
  skipAnimation,
  onDone,
}: HoroscopeSlotReelProps) {
  const [phase, setPhase] = useState<SlotPhase>(
    skipAnimation ? 'done' : 'waiting',
  );
  // Cycles through random tiers while spinning, purely cosmetic — the
  // actual result (rarityTier) is already decided by the backend.
  const [flickerTier, setFlickerTier] = useState<Tier>(rarityTier);
  const [revealed, setRevealed] = useState(skipAnimation);

  // Mirrors the pattern CaseOpeningReel/NameAutocomplete already use:
  // onDone is a fresh function every parent render, but this must fire
  // exactly once per phase transition, not once per parent re-render.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (skipAnimation) return;
    const timer = setTimeout(() => setPhase('spinning'), startDelayMs);
    return () => clearTimeout(timer);
  }, [startDelayMs, skipAnimation]);

  useEffect(() => {
    if (phase !== 'spinning') return;
    const interval = setInterval(() => {
      setFlickerTier(
        FLICKER_TIERS[Math.floor(Math.random() * FLICKER_TIERS.length)],
      );
    }, FLICKER_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [phase]);

  // One frame after landing before flipping, same rAF-after-mount
  // technique CaseOpeningReel uses — otherwise there's no prior frame for
  // the flip transition to animate from.
  useEffect(() => {
    if (phase !== 'landed') return;
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase === 'spinning') {
      const timer = setTimeout(
        () => setPhase('landed'),
        HOROSCOPE_SPIN_DURATION_MS,
      );
      return () => clearTimeout(timer);
    }
    if (phase === 'landed') {
      const timer = setTimeout(
        () => setPhase('done'),
        HOROSCOPE_FLIP_DURATION_MS,
      );
      return () => clearTimeout(timer);
    }
    if (phase === 'done') {
      onDoneRef.current();
    }
  }, [phase]);

  const displayTier =
    phase === 'spinning' || phase === 'waiting' ? flickerTier : rarityTier;

  // The reveal <img> (and the flip wrapper around it) only mounts once this
  // slot has landed — same reasoning as CaseOpeningReel's own winner
  // overlay: nothing to flip to yet while still spinning, and it keeps the
  // image out of the DOM (so e.g. queryByAltText correctly reports "not
  // revealed yet") until this slot has actually finished.
  if (phase === 'waiting' || phase === 'spinning') {
    return (
      <div className="horoscope-slot">
        <CardBack tier={displayTier} />
      </div>
    );
  }

  return (
    <div className="horoscope-slot">
      <div
        className={
          revealed ? 'horoscope-slot-card flipped' : 'horoscope-slot-card'
        }
        style={{
          transitionDuration: skipAnimation
            ? '0ms'
            : `${HOROSCOPE_FLIP_DURATION_MS}ms`,
        }}
      >
        <div className="case-opening-face">
          <CardBack tier={displayTier} />
        </div>
        <img
          className="case-opening-face case-opening-face-reveal"
          src={imageSrc}
          alt={alt}
        />
      </div>
    </div>
  );
}

interface HoroscopeReelProps {
  slots: HoroscopeSlotResult[]; // exactly 7, in order
  onFinish: () => void; // fires once, after every reel has finished
}

// 7 reels side by side, stopping left to right in sequence — the daily
// horoscope's reveal. Reuses CardBack (rarity-tinted card-back visual) and
// the flip-reveal mechanic from CaseOpeningReel.tsx, but is otherwise a new
// component: the quiz's single-reel sliding-track-and-landing-math doesn't
// generalize to 7 simultaneous, staggered reels. See docs/decisions.md #061.
function HoroscopeReel({ slots, onFinish }: HoroscopeReelProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [completedCount, setCompletedCount] = useState(0);

  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    if (completedCount === slots.length) onFinishRef.current();
  }, [completedCount, slots.length]);

  return (
    <div className="horoscope-reels">
      {slots.map((slot, index) => (
        <HoroscopeSlotReel
          key={index}
          supertype={slot.supertype}
          rarityTier={slot.rarityTier}
          imageSrc={slot.imageSrc}
          alt={slot.alt}
          startDelayMs={index * HOROSCOPE_STAGGER_MS}
          skipAnimation={prefersReducedMotion}
          onDone={() => setCompletedCount((c) => c + 1)}
        />
      ))}
    </div>
  );
}

export default HoroscopeReel;
