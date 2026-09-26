import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from '../mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  // Persisted Zustand stores (e.g. quizStore) write to localStorage, which
  // otherwise leaks session state between tests.
  localStorage.clear();
  // With `globals: false`, Testing Library's automatic cleanup (which relies on
  // detecting a global `afterEach`) never registers, so it must be called explicitly.
  cleanup();
});
afterAll(() => server.close());
