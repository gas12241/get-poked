import { useEffect, useMemo, useRef, useState } from 'react';

// Real timers, not CSS transitionend — transitionend is unreliable in tests
// (jsdom) and can double-fire across browsers. CSS just needs to match
// these durations for the visuals to line up (the flip's duration is set
// inline from FLIP_DURATION_MS below; the spin's likewise).
export const SPIN_DURATION_MS = 3500;
export const FLIP_DURATION_MS = 1000;

// How long StartingReel's idle loop stays up before it's allowed to hand
// off to the real spin, and how long the two crossfade for — see
// StartingReel below and docs/decisions.md #044.
export const MIN_IDLE_DURATION_MS = 700;
export const CROSSFADE_MS = 250;

function usePrefersReducedMotion(): boolean {
  return useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    [],
  );
}

// Decoys before the winning slot — enough to feel like a real spinning reel
// over SPIN_DURATION_MS without an excessive number of DOM nodes.
const DECOY_COUNT = 20;

// Decoys *after* the winning slot too — without these, the moment it lands
// there'd be nothing to the pointer's right but empty viewport, unlike a
// real case-opening reel where a few more items are still visible past the
// one that landed. Purely cosmetic: doesn't factor into the landing math
// at all, since that only cares about what comes before the winner.
const TRAILING_DECOY_COUNT = 6;

const TIERS = ['common', 'mid', 'chase'] as const;
type Tier = (typeof TIERS)[number];

// Cosmetic only — buckets the ~38 real rarity strings into a handful of
// tint tiers for the reel. Deliberately looser than
// `quiz/eligibility.py`'s SPECIAL_TIER_RARITIES (which has to be exact,
// since it decides real quiz eligibility); getting a tint "close enough"
// here has no functional consequence.
function tierForRarity(rarity: string): Tier {
  const lower = rarity.toLowerCase();
  if (!lower || lower === 'common' || lower === 'uncommon') return 'common';
  const chaseKeywords = [
    'ultra',
    'secret',
    'rainbow',
    'illustration',
    'hyper',
    'vmax',
    'vstar',
    'radiant',
    'shining',
    'prism',
    'legend',
  ];
  if (chaseKeywords.some((keyword) => lower.includes(keyword))) return 'chase';
  return 'mid';
}

function randomTier(): Tier {
  return TIERS[Math.floor(Math.random() * TIERS.length)];
}

// A stylized, original card-back look — a rarity-tinted panel with an
// inset frame and a centered ring emblem. Deliberately not a reproduction
// of the real Pokémon TCG card back or the Poké Ball mark (no red/white
// split, no seam): the app already drew that line for the header icon
// (docs/decisions.md #018), and this follows the same rule. Shared by
// every decoy and the winning slot's pre-flip face, so there's exactly
// one place that defines "what a card back looks like" here.
function CardBack({ tier }: { tier: Tier }) {
  return (
    <div className={`case-opening-back case-opening-back-${tier}`}>
      <div className="case-opening-back-corner" />
      <div className="case-opening-back-ring" />
    </div>
  );
}

interface CaseOpeningReelProps {
  rarity: string;
  imageSrc: string;
  alt: string;
  onFinish: () => void;
}

// A CS:GO-style "case opening" reel: small card-back-styled decoys (no
// real card art, so nothing about a later question can leak early) spin
// past and land on a pointer with neighbors still peeking at either edge,
// then the winning slot un-docks from the track and grows into a
// full-size card as it flips to reveal the actual (already-masked) card
// for this question. See docs/decisions.md #040.
function CaseOpeningReel({
  rarity,
  imageSrc,
  alt,
  onFinish,
}: CaseOpeningReelProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  // Randomized once per mount, not on every render.
  const decoyTiers = useMemo(
    () => Array.from({ length: DECOY_COUNT }, randomTier),
    [],
  );
  const trailingDecoyTiers = useMemo(
    () => Array.from({ length: TRAILING_DECOY_COUNT }, randomTier),
    [],
  );

  const [phase, setPhase] = useState<'spinning' | 'landed' | 'done'>(
    prefersReducedMotion ? 'landed' : 'spinning',
  );

  // Separate from `phase` on purpose: the track's `transform` must still
  // read `translateX(0px)` on the very first paint (nothing to visually
  // transition *from* otherwise), then switch to the landing offset one
  // frame later so the browser treats it as a real style change and
  // actually animates it, matching the timer below.
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion) return;
    const frame = requestAnimationFrame(() => setStarted(true));
    return () => cancelAnimationFrame(frame);
  }, [prefersReducedMotion]);

  // Same reasoning, one step later: the winner overlay (below) is only
  // mounted once `phase` leaves 'spinning', so it too needs one frame at
  // its small, unflipped starting size/rotation before switching to
  // "grown and flipped" — otherwise there's no prior frame for the width
  // and transform transitions to animate from.
  const [revealed, setRevealed] = useState(prefersReducedMotion);
  useEffect(() => {
    if (phase !== 'landed' || prefersReducedMotion) return;
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, [phase, prefersReducedMotion]);

  // Mirrors the pattern already used in NameAutocomplete for the same
  // reason: `onFinish` is a fresh function on every parent render, but
  // this effect must fire exactly once per phase transition, not once per
  // parent re-render.
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    if (phase === 'spinning') {
      // Matches the track's own transitionDuration below — this is when
      // the slide should have visually finished, not when it starts.
      const timer = setTimeout(() => setPhase('landed'), SPIN_DURATION_MS);
      return () => clearTimeout(timer);
    }
    if (phase === 'landed') {
      const timer = setTimeout(() => setPhase('done'), FLIP_DURATION_MS);
      return () => clearTimeout(timer);
    }
    if (phase === 'done') {
      onFinishRef.current();
    }
  }, [phase]);

  // Full landing-position formula (viewport width no longer equals item
  // width now that items are shrunk for the CS:GO-style multi-item view):
  // slide left by every decoy's full width, then re-center by half a
  // viewport and back off by half an item. Expressed as a calc() over the
  // shared CSS variables (see pages.css), not JS pixel values, so this
  // keeps landing correctly if either size changes later.
  const finalOffset =
    `calc(-1 * ${DECOY_COUNT} * (var(--reel-item-width) + var(--reel-gap))` +
    ' + var(--quiz-card-width) / 2 - var(--reel-item-width) / 2)';

  return (
    <div className="case-opening">
      <div className="case-opening-pointer" />
      {phase === 'spinning' && (
        <div
          className="case-opening-track"
          style={{
            transform: `translateX(${started ? finalOffset : '0px'})`,
            transitionDuration: `${SPIN_DURATION_MS}ms`,
          }}
        >
          {decoyTiers.map((tier, index) => (
            <div key={`leading-${index}`} className="case-opening-item">
              <CardBack tier={tier} />
            </div>
          ))}
          <div className="case-opening-item">
            <CardBack tier={tierForRarity(rarity)} />
          </div>
          {trailingDecoyTiers.map((tier, index) => (
            <div key={`trailing-${index}`} className="case-opening-item">
              <CardBack tier={tier} />
            </div>
          ))}
        </div>
      )}
      {phase !== 'spinning' && (
        <div
          className={
            revealed
              ? 'case-opening-winner grown flipped'
              : 'case-opening-winner'
          }
          style={{
            transitionDuration: prefersReducedMotion
              ? '0ms'
              : `${FLIP_DURATION_MS}ms`,
          }}
        >
          <div className="case-opening-face">
            <CardBack tier={tierForRarity(rarity)} />
          </div>
          <img
            className="case-opening-face case-opening-face-reveal"
            src={imageSrc}
            alt={alt}
          />
        </div>
      )}
    </div>
  );
}

// Fades freshly-mounted `children` in from opacity 0 — same rAF-after-mount
// trick used above (`started`/`revealed`), needed because a fresh mount and
// its "real" opacity would otherwise land in the same paint, giving CSS
// nothing to transition from.
function RevealFadeIn({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      className={`case-opening-reveal-fade${visible ? ' visible' : ''}`}
      style={{ transitionDuration: `${CROSSFADE_MS}ms` }}
    >
      {children}
    </div>
  );
}

interface StartingReelProps {
  // Whether the real first question has arrived yet — until it has, this
  // renders an idle loop instead of the real spin (there's nothing to spin
  // toward yet). See docs/decisions.md #044.
  ready: boolean;
  rarity?: string;
  imageSrc?: string;
  onFinish: () => void;
}

// Sits in front of CaseOpeningReel while the very first question is still
// being fetched, so there's something to look at (a slow, idling loop of
// generic card backs — no real data needed) instead of a dead pause between
// picking a mode and the reel actually starting. Once the real question
// arrives, it hands off to the unmodified CaseOpeningReel for the actual
// fast spin-and-reveal, crossfading the two so the speed-up reads as a
// "pull the lever" moment rather than a jump cut. See docs/decisions.md
// #044 — only ever used for the first question of a quiz; every later
// question already has its data on hand (decisions.md #040), so there's no
// pause left to fill.
export function StartingReel({
  ready,
  rarity,
  imageSrc,
  onFinish,
}: StartingReelProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  // Same idle decoy count as the real spin, just for visual density — the
  // idle loop has no landing math to keep in sync with, unlike DECOY_COUNT
  // elsewhere in this file.
  const idleTiers = useMemo(
    () => Array.from({ length: DECOY_COUNT }, randomTier),
    [],
  );

  // Keeps the idle loop up for at least this long even if the real data
  // arrives instantly, so it always reads as a deliberate "idling, then
  // pulled" beat rather than a flicker. Skipped under reduced motion — an
  // artificial wait has no upside for a user who's asked for less motion.
  const [minIdleElapsed, setMinIdleElapsed] = useState(prefersReducedMotion);
  useEffect(() => {
    if (prefersReducedMotion) return;
    const timer = setTimeout(
      () => setMinIdleElapsed(true),
      MIN_IDLE_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [prefersReducedMotion]);

  const revealing =
    ready && minIdleElapsed && rarity !== undefined && imageSrc !== undefined;

  // Kept mounted for one crossfade beyond the moment `revealing` flips true,
  // so the idle loop and the real spin briefly overlap instead of hard-
  // cutting. Only meaningful without reduced motion (which skips
  // transitions entirely, so there's nothing to keep overlapping for) —
  // that case is handled below without a timer.
  const [crossfadeElapsed, setCrossfadeElapsed] = useState(false);
  useEffect(() => {
    if (!revealing || prefersReducedMotion) return;
    const timer = setTimeout(() => setCrossfadeElapsed(true), CROSSFADE_MS);
    return () => clearTimeout(timer);
  }, [revealing, prefersReducedMotion]);

  const showIdle = prefersReducedMotion
    ? !revealing
    : !(revealing && crossfadeElapsed);

  const idleView = (
    <div
      className={`case-opening${revealing ? ' fading-out' : ''}`}
      style={
        revealing ? { transitionDuration: `${CROSSFADE_MS}ms` } : undefined
      }
    >
      <div className="case-opening-pointer" />
      <div className="case-opening-idle-track">
        {[...idleTiers, ...idleTiers].map((tier, index) => (
          <div key={index} className="case-opening-item">
            <CardBack tier={tier} />
          </div>
        ))}
      </div>
    </div>
  );

  if (!revealing) return idleView;

  return (
    <div className="case-opening-handoff">
      {showIdle && idleView}
      <RevealFadeIn>
        <CaseOpeningReel
          rarity={rarity}
          imageSrc={imageSrc}
          alt="Card to guess"
          onFinish={onFinish}
        />
      </RevealFadeIn>
    </div>
  );
}

export default CaseOpeningReel;
