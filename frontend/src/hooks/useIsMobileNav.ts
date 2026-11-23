import { useEffect, useState } from 'react';

const MOBILE_NAV_QUERY = '(max-width: 768px)';

// Unlike usePrefersReducedMotion's one-shot check, this subscribes to the
// query's own change event — a viewport-width breakpoint can genuinely
// change mid-session (resizing the window, rotating a tablet/phone),
// unlike a system preference that's effectively fixed for the session.
export function useIsMobileNav(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(MOBILE_NAV_QUERY).matches,
  );

  useEffect(() => {
    // No need to resync here — the lazy useState initializer above already
    // computed the current match state as of mount; this effect's only job
    // is subscribing to future changes (a resize or rotation).
    const mql = window.matchMedia(MOBILE_NAV_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
