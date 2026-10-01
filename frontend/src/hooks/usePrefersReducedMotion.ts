import { useMemo } from 'react';

// Shared by every animated component (CaseOpeningReel, HoroscopeReel) that
// needs to skip its own motion for a user who's asked for less of it.
export function usePrefersReducedMotion(): boolean {
  return useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    [],
  );
}
