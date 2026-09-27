import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import Footer from './Footer';
import ThemeToggle from './ThemeToggle';

function Layout() {
  // Not <NavLink> — its default (non-`end`) matching would mark "Cards"
  // active on every route, since `to="/"` is a prefix of every pathname.
  // "Cards" covers both the list ("/") and a card's detail page
  // ("/cards/:id"), which NavLink's own matching can't express without
  // also matching "/quiz".
  const { pathname } = useLocation();
  const isCardsActive = pathname === '/' || pathname.startsWith('/cards/');
  const isQuizActive = pathname.startsWith('/quiz');

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
      {/* Keyed by pathname, not the default per-navigation location.key —
          the Cards page's filters/sort/page live in the query string
          (docs/decisions.md #033), which would otherwise mint a new
          restoration key on every filter change instead of treating it as
          the same page. See docs/decisions.md #033. */}
      <ScrollRestoration getKey={(location) => location.pathname} />
    </>
  );
}

export default Layout;
