import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="8" y1="0.5" x2="8" y2="2.5" />
        <line x1="8" y1="13.5" x2="8" y2="15.5" />
        <line x1="0.5" y1="8" x2="2.5" y2="8" />
        <line x1="13.5" y1="8" x2="15.5" y2="8" />
        <line x1="2.6" y1="2.6" x2="4" y2="4" />
        <line x1="12" y1="12" x2="13.4" y2="13.4" />
        <line x1="2.6" y1="13.4" x2="4" y2="12" />
        <line x1="12" y1="4" x2="13.4" y2="2.6" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M13.5 9.5A6 6 0 1 1 6.5 2.5a5 5 0 0 0 7 7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggle() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label={
        theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
      }
    >
      {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

export default ThemeToggle;
