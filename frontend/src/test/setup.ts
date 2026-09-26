import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from '../mocks/server';

// jsdom doesn't implement matchMedia — ThemeToggle reads it to detect the
// system's color-scheme preference.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  // Persisted Zustand stores (e.g. quizStore) write to localStorage, which
  // otherwise leaks session state between tests.
  localStorage.clear();
  // ThemeToggle sets this on the real document, which otherwise leaks
  // between tests since cleanup() only unmounts React-rendered content.
  delete document.documentElement.dataset.theme;
  // With `globals: false`, Testing Library's automatic cleanup (which relies on
  // detecting a global `afterEach`) never registers, so it must be called explicitly.
  cleanup();
});
afterAll(() => server.close());
