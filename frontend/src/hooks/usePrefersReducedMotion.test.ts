import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

function mockMatchMedia(matches: boolean) {
  return vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as MediaQueryList);
}

describe('usePrefersReducedMotion', () => {
  it('returns true when the user prefers reduced motion', () => {
    const matchMediaSpy = mockMatchMedia(true);

    const { result } = renderHook(() => usePrefersReducedMotion());

    expect(result.current).toBe(true);
    matchMediaSpy.mockRestore();
  });

  it('returns false when the user has no such preference', () => {
    const matchMediaSpy = mockMatchMedia(false);

    const { result } = renderHook(() => usePrefersReducedMotion());

    expect(result.current).toBe(false);
    matchMediaSpy.mockRestore();
  });
});
