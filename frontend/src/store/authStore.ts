import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  clearAccessToken: () => void;
}

// In-memory only, deliberately no `persist` middleware — the access token must
// never survive a reload via localStorage/sessionStorage (limits XSS exposure).
// Losing it on refresh is expected; it's re-obtained via the refresh-cookie flow.
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  setAccessToken: (token) => set({ accessToken: token }),
  clearAccessToken: () => set({ accessToken: null }),
}));

// Dev-only escape hatch for manually (or via Playwright) simulating a logged-in
// session before the real login UI exists — e.g. in a browser devtools console:
// window.__authStore.getState().setAccessToken('<a real access token>'). Never
// built into a production bundle (import.meta.env.DEV is statically false
// there, so this branch is dead-code-eliminated).
if (import.meta.env.DEV) {
  (window as unknown as { __authStore: typeof useAuthStore }).__authStore =
    useAuthStore;
}
