import { Link, Outlet } from 'react-router-dom';
import Footer from './Footer';

function Layout() {
  return (
    <>
      <nav className="main-nav">
        <Link to="/">Cards</Link>
        <Link to="/quiz">Quiz</Link>
      </nav>
      <Outlet />
      <Footer />
    </>
  );
}

export default Layout;
