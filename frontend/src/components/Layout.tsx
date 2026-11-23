import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getProfile } from '../api/auth';
import { useIsAuthenticated } from '../store/authStore';
import { useIsMobileNav } from '../hooks/useIsMobileNav';
import Footer from './Footer';
import ThemeToggle from './ThemeToggle';

// Exported for testing. Only the Cards list route needs page-awareness — its
// filters/sort/page live in the query string (docs/decisions.md #033), and
// the query string otherwise carries no information relevant to scroll
// restoration for any other route.
export function getScrollRestorationKey(location: {
  pathname: string;
  search: string;
}) {
  if (location.pathname !== '/') {
    return location.pathname;
  }
  const page = new URLSearchParams(location.search).get('page') ?? '1';
  return `${location.pathname}?page=${page}`;
}

// The "Profile" link (or "Log in"/"Sign up" when logged out) — shared as-is
// between the desktop nav's own right-hand column and the mobile top bar,
// rather than duplicating this branch in two places.
function AccountLinks({
  isAuthenticated,
  isProfileActive,
  isLoginActive,
  isSignupActive,
  username,
}: {
  isAuthenticated: boolean;
  isProfileActive: boolean;
  isLoginActive: boolean;
  isSignupActive: boolean;
  username?: string;
}) {
  if (isAuthenticated) {
    return (
      <Link
        to="/profile"
        className={
          isProfileActive ? 'main-nav-auth-link active' : 'main-nav-auth-link'
        }
      >
        {username ?? 'Profile'}
      </Link>
    );
  }
  return (
    <>
      <Link
        to="/login"
        className={
          isLoginActive ? 'main-nav-auth-link active' : 'main-nav-auth-link'
        }
      >
        Log in
      </Link>
      <Link
        to="/signup"
        className={
          isSignupActive ? 'main-nav-auth-link active' : 'main-nav-auth-link'
        }
      >
        Sign up
      </Link>
    </>
  );
}

// Four small original icons for the mobile tab bar — same minimal
// currentColor-stroke style as ThemeToggle's own Sun/MoonIcon, not a
// reproduction of any real logo or card back (same non-affiliation
// reasoning as decisions #018/#040).
function CardsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <rect
        x="2.5"
        y="5.5"
        width="11"
        height="13"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        transform="rotate(-10 8 12)"
      />
      <rect
        x="6.5"
        y="2.5"
        width="11"
        height="13"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function QuizIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M7.6 7.9a2.4 2.4 0 1 1 3.4 2.2c-.7.35-1 .75-1 1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="10" cy="14.2" r="0.9" fill="currentColor" />
    </svg>
  );
}

function HoroscopeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 1.8 11.7 7.3 17.5 7.3 12.9 10.7 14.6 16.2 10 12.8 5.4 16.2 7.1 10.7 2.5 7.3 8.3 7.3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollectionIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <rect
        x="2"
        y="2"
        width="6.5"
        height="6.5"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="11.5"
        y="2"
        width="6.5"
        height="6.5"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="2"
        y="11.5"
        width="6.5"
        height="6.5"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <rect
        x="11.5"
        y="11.5"
        width="6.5"
        height="6.5"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function Layout() {
  // Not <NavLink> — its default (non-`end`) matching would mark "Cards"
  // active on every route, since `to="/"` is a prefix of every pathname.
  // "Cards" covers both the list ("/") and a card's detail page
  // ("/cards/:id"), which NavLink's own matching can't express without
  // also matching "/quiz".
  const { pathname } = useLocation();
  const isCardsActive = pathname === '/' || pathname.startsWith('/cards/');
  const isQuizActive = pathname.startsWith('/quiz');
  const isHoroscopeActive = pathname.startsWith('/horoscope');
  const isCollectionActive = pathname.startsWith('/collection');
  const isLoginActive = pathname.startsWith('/login');
  const isSignupActive = pathname.startsWith('/signup');
  const isProfileActive = pathname.startsWith('/profile');
  const isAuthenticated = useIsAuthenticated();
  // Below this, the top nav's own min-width:auto grid floor (~660-680px)
  // would force the whole page into a horizontal scrollbar — swapped for a
  // bottom tab bar + slim top bar instead, the pattern real mobile apps use
  // for this many top-level destinations. See docs/decisions.md #103.
  const isMobileNav = useIsMobileNav();

  // Same query key ProfilePage.tsx uses for its own `getProfile` call, so
  // React Query serves both from one shared cache entry instead of fetching
  // twice — whichever mounts first fetches it, the other reads the cache.
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
    enabled: isAuthenticated,
  });

  const accountLinks = (
    <AccountLinks
      isAuthenticated={isAuthenticated}
      isProfileActive={isProfileActive}
      isLoginActive={isLoginActive}
      isSignupActive={isSignupActive}
      username={profileQuery.data?.username}
    />
  );

  return (
    <>
      {isMobileNav ? (
        <>
          <header className="mobile-top-bar">
            <Link to="/" className="main-nav-brand">
              Get Poked
            </Link>
            <div className="mobile-top-bar-right">
              {accountLinks}
              <ThemeToggle />
            </div>
          </header>
          <nav className="mobile-tab-bar" aria-label="Primary">
            <Link to="/" className={isCardsActive ? 'active' : undefined}>
              <CardsIcon />
              <span>Cards</span>
            </Link>
            <Link to="/quiz" className={isQuizActive ? 'active' : undefined}>
              <QuizIcon />
              <span>Quiz</span>
            </Link>
            <Link
              to="/horoscope"
              className={isHoroscopeActive ? 'active' : undefined}
            >
              <HoroscopeIcon />
              <span>Horoscope</span>
            </Link>
            {isAuthenticated && (
              <Link
                to="/collection"
                className={isCollectionActive ? 'active' : undefined}
              >
                <CollectionIcon />
                <span>Collection</span>
              </Link>
            )}
          </nav>
        </>
      ) : (
        <nav className="main-nav">
          <div className="main-nav-links">
            <Link to="/" className={isCardsActive ? 'active' : undefined}>
              Cards
            </Link>
            <Link to="/quiz" className={isQuizActive ? 'active' : undefined}>
              Quiz
            </Link>
            <Link
              to="/horoscope"
              className={isHoroscopeActive ? 'active' : undefined}
            >
              Horoscope
            </Link>
            {isAuthenticated && (
              <Link
                to="/collection"
                className={isCollectionActive ? 'active' : undefined}
              >
                Collection
              </Link>
            )}
          </div>
          <Link to="/" className="main-nav-brand">
            Get Poked
          </Link>
          <div className="main-nav-right">
            {accountLinks}
            <ThemeToggle />
          </div>
        </nav>
      )}
      <Outlet />
      <Footer />
      {/* Reserves room at the bottom of the page so the fixed tab bar
          never covers the last bit of real content (the disclaimer
          footer) — a plain sibling rather than wrapping Outlet/Footer in
          a new container, so ScrollRestoration and the existing
          flex-column footer-push-down behavior aren't disturbed. */}
      {isMobileNav && (
        <div className="mobile-tab-bar-spacer" aria-hidden="true" />
      )}
      {/* Keyed by pathname (+ page number for the Cards list), not the
          default per-navigation location.key — the Cards page's
          filters/sort/page live in the query string (docs/decisions.md
          #033), which would otherwise mint a new restoration key on every
          filter change instead of treating it as the same page. Including
          the page number means Next/Previous land on a key with no saved
          position yet (scrolls to top), while going back to a card detail
          page still restores the exact position on the page you left. See
          docs/decisions.md #033. */}
      <ScrollRestoration getKey={getScrollRestorationKey} />
    </>
  );
}

export default Layout;
