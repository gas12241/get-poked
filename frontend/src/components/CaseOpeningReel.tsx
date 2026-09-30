import { useEffect, useMemo, useRef, useState } from 'react';
import type { QuizDifficulty } from '../api/quiz';

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

type Tier = 'common' | 'mid' | 'chase';

// Exact rarity sets, mirroring `quiz/eligibility.py`'s EASY_RARITIES (=
// SPECIAL_TIER_RARITIES) and HARD_RARITIES precisely — not a loose keyword
// guess. This has to be exact (docs/decisions.md #049): the winning card's
// own tint must land in exactly the bucket its real rarity belongs to, or
// "the reel lands on a color matching the card" breaks for any rarity a
// keyword heuristic would misclassify (e.g.
// "ACE SPEC Rare" contains no "ultra"/"secret"/etc. substring). Keep in
// sync with the backend if those sets ever change.
const EASY_RARITIES = new Set([
  'Rare Ultra',
  'Ultra Rare',
  'Rare Secret',
  'Rare Rainbow',
  'Special Illustration Rare',
  'Illustration Rare',
  'Hyper Rare',
  'ACE SPEC Rare',
  'Rare ACE',
  'Rare Prism Star',
  'Classic Collection',
]);
const HARD_RARITIES = new Set(['Common', 'Uncommon', 'Rare']);

function tierForRarity(rarity: string): Tier {
  if (EASY_RARITIES.has(rarity)) return 'chase';
  if (HARD_RARITIES.has(rarity)) return 'common';
  return 'mid';
}

// Which tiers a quiz's decoys are drawn from — a graduated palette that
// widens with difficulty (Easy: chase only; Medium: chase and mid; Hard:
// all three), signifying the range of possible outcomes at each level.
// Deliberately not restricted to only the tiers that difficulty's real
// rarity pool could produce (Hard's real cards are always 'common', never
// 'chase'/'mid') — a per-user request to show the visual range across
// difficulties rather than strict per-question accuracy. See
// docs/decisions.md #050. The winning slot's own tint (tierForRarity,
// above) always reflects the real card regardless of this palette.
function tiersForDifficulty(difficulty: QuizDifficulty): Tier[] {
  if (difficulty === 'easy') return ['chase'];
  if (difficulty === 'medium') return ['chase', 'mid'];
  return ['chase', 'mid', 'common'];
}

function randomTierFrom(tiers: Tier[]): Tier {
  return tiers[Math.floor(Math.random() * tiers.length)];
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
  difficulty: QuizDifficulty;
  onFinish: () => void;
}

// A CS:GO-style "case opening" reel: small card-back-styled decoys (no
// real card art, so nothing about a later question can leak early) spin
// past and land on a pointer with neighbors still peeking at either edge,
// then the winning slot un-docks from the track and grows into a
// full-size card as it flips to reveal the actual (already-masked) card
// for this question. See docs/decisions.md #040. Decoy tints are drawn
// from the current difficulty's palette (docs/decisions.md #050) — a wider
// mix of colors at higher difficulties.
function CaseOpeningReel({
  rarity,
  imageSrc,
  alt,
  difficulty,
  onFinish,
}: CaseOpeningReelProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  // Randomized once per mount, not on every render.
  const decoyTiers = useMemo(() => {
    const tiers = tiersForDifficulty(difficulty);
    return Array.from({ length: DECOY_COUNT }, () => randomTierFrom(tiers));
  }, [difficulty]);
  const trailingDecoyTiers = useMemo(() => {
    const tiers = tiersForDifficulty(difficulty);
    return Array.from({ length: TRAILING_DECOY_COUNT }, () =>
      randomTierFrom(tiers),
    );
  }, [difficulty]);

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
  difficulty: QuizDifficulty;
  onFinish: () => void;
}

// Sits in front of CaseOpeningReel so there's always a brief idling loop of
// generic card backs before the real spin-and-reveal, crossfading the two
// so the speed-up reads as a "pull the lever" moment rather than a jump
// cut. For the very first question of a quiz, `ready` starts false and
// this idle loop also genuinely fills the wait for that question's data to
// arrive (docs/decisions.md #044). For every later question, the data is
// already on hand (decisions.md #040) and `ready` is true from the first
// render — the idle loop still holds for at least MIN_IDLE_DURATION_MS
// before handing off, purely for the wind-up, since without it "Next"
// jump-cut straight into a full-speed 3.5s spin, which read as rushed. See
// docs/decisions.md #057.
export function StartingReel({
  ready,
  rarity,
  imageSrc,
  difficulty,
  onFinish,
}: StartingReelProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  // Same palette the real spin's decoys draw from once it takes over — see
  // docs/decisions.md #050 — so the idle loop and the real spin feel like
  // one continuous reel at the handoff.
  const idleTiers = useMemo(() => {
    const tiers = tiersForDifficulty(difficulty);
    return Array.from({ length: DECOY_COUNT * 2 }, () => randomTierFrom(tiers));
  }, [difficulty]);

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
        {idleTiers.map((tier, index) => (
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
          difficulty={difficulty}
          onFinish={onFinish}
        />
      </RevealFadeIn>
    </div>
  );
}

export default CaseOpeningReel;
