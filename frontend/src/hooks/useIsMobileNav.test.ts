import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useIsMobileNav } from './useIsMobileNav';

function mockMatchMedia(matches: boolean) {
  let changeListener: ((e: MediaQueryListEvent) => void) | null = null;
  const mql = {
    matches,
    media: '(max-width: 768px)',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (
      _event: string,
      listener: (e: MediaQueryListEvent) => void,
    ) => {
      changeListener = listener;
    },
    removeEventListener: () => {
      changeListener = null;
    },
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;

  const spy = vi.spyOn(window, 'matchMedia').mockReturnValue(mql);
  return {
    spy,
    fireChange: (newMatches: boolean) => {
      changeListener?.({ matches: newMatches } as MediaQueryListEvent);
    },
  };
}

describe('useIsMobileNav', () => {
  it('returns true when the viewport is at or below the mobile breakpoint', () => {
    const { spy } = mockMatchMedia(true);

    const { result } = renderHook(() => useIsMobileNav());

    expect(result.current).toBe(true);
    spy.mockRestore();
  });

  it('returns false when the viewport is above the mobile breakpoint', () => {
    const { spy } = mockMatchMedia(false);

    const { result } = renderHook(() => useIsMobileNav());

    expect(result.current).toBe(false);
    spy.mockRestore();
  });

  it('updates live when the media query change event fires, e.g. a resize or rotation', () => {
    const { spy, fireChange } = mockMatchMedia(false);

    const { result } = renderHook(() => useIsMobileNav());
    expect(result.current).toBe(false);

    act(() => {
      fireChange(true);
    });

    expect(result.current).toBe(true);
    spy.mockRestore();
  });
});
