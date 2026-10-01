import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
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

  return (
    <>
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
        </div>
        <Link to="/" className="main-nav-brand">
          Get Poked
        </Link>
        <div className="main-nav-right">
          <ThemeToggle />
        </div>
      </nav>
      <Outlet />
      <Footer />
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
