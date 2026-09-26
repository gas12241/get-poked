import { Link, Outlet, ScrollRestoration } from 'react-router-dom';
import Footer from './Footer';
import ThemeToggle from './ThemeToggle';

function Layout() {
  return (
    <>
      <nav className="main-nav">
        <Link to="/">Cards</Link>
        <Link to="/quiz">Quiz</Link>
        <ThemeToggle />
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
