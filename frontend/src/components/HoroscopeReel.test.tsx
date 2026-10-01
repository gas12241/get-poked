import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import HoroscopeReel, {
  HOROSCOPE_FLIP_DURATION_MS,
  HOROSCOPE_SPIN_DURATION_MS,
  HOROSCOPE_STAGGER_MS,
} from './HoroscopeReel';
import type { HoroscopeSlotResult } from './HoroscopeReel';

const TOTAL_DURATION_MS =
  HOROSCOPE_SPIN_DURATION_MS + HOROSCOPE_FLIP_DURATION_MS;

function makeSlots(count: number): HoroscopeSlotResult[] {
  return Array.from({ length: count }, (_, i) => ({
    supertype: i < 5 ? 'Pokémon' : i === 5 ? 'Trainer' : 'Energy',
    rarityTier: 'common',
    imageSrc: `https://example.com/card-${i}.png`,
    alt: `Card ${i}`,
  }));
}

describe('HoroscopeReel', () => {
  it('renders all 7 slots', () => {
    const { container } = render(
      <HoroscopeReel slots={makeSlots(7)} onFinish={() => {}} />,
    );

    expect(container.querySelectorAll('.horoscope-slot')).toHaveLength(7);
  });

  it('reveals reels left to right, not all at once', async () => {
    render(<HoroscopeReel slots={makeSlots(7)} onFinish={() => {}} />);

    // Shortly after mount, no reel has landed/flipped yet — each one's own
    // spin only starts after its stagger delay.
    expect(screen.queryByAltText('Card 0')).not.toBeInTheDocument();

    // After the last reel's own full timeline, every card should be
    // revealed — but the first slot's own alt text should have appeared
    // well before the last slot's, proving the stagger actually staggers
    // rather than everything landing at once.
    await waitFor(
      () => expect(screen.getByAltText('Card 0')).toBeInTheDocument(),
      {
        timeout: TOTAL_DURATION_MS + 500,
      },
    );
    // At this point (right when slot 0 has just revealed), the last slot
    // (index 6) — delayed by 6 * STAGGER_MS beyond slot 0 — should not
    // have revealed yet, since its own spin+flip timeline starts that much
    // later.
    expect(screen.queryByAltText('Card 6')).not.toBeInTheDocument();

    await waitFor(
      () => expect(screen.getByAltText('Card 6')).toBeInTheDocument(),
      {
        timeout: 6 * HOROSCOPE_STAGGER_MS + TOTAL_DURATION_MS + 500,
      },
    );
  });

  it('calls onFinish exactly once, only after every reel has completed', async () => {
    const onFinish = vi.fn();
    render(<HoroscopeReel slots={makeSlots(7)} onFinish={onFinish} />);

    expect(onFinish).not.toHaveBeenCalled();

    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1), {
      timeout: 6 * HOROSCOPE_STAGGER_MS + TOTAL_DURATION_MS + 1000,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('skips the stagger and animation entirely when the user prefers reduced motion', async () => {
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList);
    const onFinish = vi.fn();

    render(<HoroscopeReel slots={makeSlots(7)} onFinish={onFinish} />);

    // Every card should already be visible immediately — no stagger, no
    // spin/flip wait.
    for (let i = 0; i < 7; i++) {
      expect(screen.getByAltText(`Card ${i}`)).toBeInTheDocument();
    }
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1), {
      timeout: 500,
    });

    matchMediaSpy.mockRestore();
  });
});
