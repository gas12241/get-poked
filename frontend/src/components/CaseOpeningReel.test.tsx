import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import CaseOpeningReel, {
  CROSSFADE_MS,
  FLIP_DURATION_MS,
  MIN_IDLE_DURATION_MS,
  SPIN_DURATION_MS,
  StartingReel,
} from './CaseOpeningReel';

const TOTAL_DURATION_MS = SPIN_DURATION_MS + FLIP_DURATION_MS;

describe('CaseOpeningReel', () => {
  it('does not call onFinish immediately, then calls it once after the full spin+flip sequence', async () => {
    const onFinish = vi.fn();
    render(
      <CaseOpeningReel
        rarity="Rare Holo"
        imageSrc="https://example.com/card.png"
        alt="Card to guess"
        onFinish={onFinish}
      />,
    );

    expect(onFinish).not.toHaveBeenCalled();

    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1), {
      timeout: TOTAL_DURATION_MS + 1000,
    });

    // Stays at exactly one call — a stray re-render calling the effect
    // again would be a real regression (see the ref-based guard against
    // exactly this in the component).
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('renders decoy items during the spin, then the winning slot once landed', async () => {
    render(
      <CaseOpeningReel
        rarity="Rare Holo"
        imageSrc="https://example.com/card.png"
        alt="Card to guess"
        onFinish={() => {}}
      />,
    );

    // The winning slot un-docks from the sliding track and doesn't exist
    // until the reel has landed (see docs/decisions.md #040 addendum) — so
    // its reveal image isn't in the DOM yet while still spinning.
    expect(screen.queryByAltText('Card to guess')).not.toBeInTheDocument();

    await waitFor(
      () => expect(screen.getByAltText('Card to guess')).toBeInTheDocument(),
      { timeout: SPIN_DURATION_MS + 500 },
    );
  });

  it('skips the spin animation when the user prefers reduced motion', async () => {
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

    render(
      <CaseOpeningReel
        rarity="Common"
        imageSrc="https://example.com/card.png"
        alt="Card to guess"
        onFinish={onFinish}
      />,
    );

    // Finishes well within the full spin duration — reduced motion must
    // not wait out the normal animation timeline.
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1), {
      timeout: SPIN_DURATION_MS - 200,
    });

    matchMediaSpy.mockRestore();
  });
});

describe('StartingReel', () => {
  it('shows an idle loop and does not call onFinish while not ready', async () => {
    const onFinish = vi.fn();
    render(<StartingReel ready={false} onFinish={onFinish} />);

    expect(screen.queryByAltText('Card to guess')).not.toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();

    // Give the minimum idle timer a moment to prove it alone doesn't
    // trigger anything without real question data.
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_IDLE_DURATION_MS + 100),
    );
    expect(onFinish).not.toHaveBeenCalled();
    expect(screen.queryByAltText('Card to guess')).not.toBeInTheDocument();
  });

  it('hands off to the real spin once ready, and eventually reveals it', async () => {
    const onFinish = vi.fn();
    const { rerender } = render(
      <StartingReel ready={false} onFinish={onFinish} />,
    );

    // Simulates the real question data arriving mid-idle, same as QuizPage
    // passing an updated `ready`/`rarity`/`imageSrc` once its fetch
    // resolves.
    rerender(
      <StartingReel
        ready
        rarity="Rare Holo"
        imageSrc="https://example.com/card.png"
        onFinish={onFinish}
      />,
    );

    await waitFor(
      () => expect(screen.getByAltText('Card to guess')).toBeInTheDocument(),
      {
        timeout: MIN_IDLE_DURATION_MS + CROSSFADE_MS + SPIN_DURATION_MS + 500,
      },
    );

    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1), {
      timeout: FLIP_DURATION_MS + 500,
    });
  });

  it('skips the minimum idle wait when the user prefers reduced motion', async () => {
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

    render(
      <StartingReel
        ready
        rarity="Common"
        imageSrc="https://example.com/card.png"
        onFinish={onFinish}
      />,
    );

    // No idle wait, and the underlying CaseOpeningReel also skips its own
    // animation under reduced motion (see its test above) — the whole
    // thing should finish well short of a real idle+spin timeline.
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1), {
      timeout: SPIN_DURATION_MS - 200,
    });

    matchMediaSpy.mockRestore();
  });
});
