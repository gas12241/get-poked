import { Link, Outlet } from 'react-router-dom';
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
    </>
  );
}

export default Layout;
