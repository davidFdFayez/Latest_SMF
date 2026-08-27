import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import GovtBar from './GovtBar';
import Header from './Header';
import Footer from './Footer';
import { useScrollReveal, useCountUp } from '../../hooks/useMotion';

export default function Layout() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Site-wide motion, re-armed on every navigation.
  useScrollReveal(location.pathname);
  useCountUp(location.pathname);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <GovtBar />
      <Header />
      <main id="main-content" className="app-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
