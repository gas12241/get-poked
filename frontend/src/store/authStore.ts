import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  clearAccessToken: () => void;
}

// In-memory only, deliberately no `persist` middleware — the access token must
// never survive a reload via localStorage/sessionStorage (limits XSS exposure).
// Losing it on refresh is expected; it's re-obtained via the refresh-cookie flow
// (see apiClient.ts's refreshAccessToken, called once on app mount).
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  setAccessToken: (token) => set({ accessToken: token }),
  clearAccessToken: () => set({ accessToken: null }),
}));

export const useIsAuthenticated = () =>
  useAuthStore((s) => s.accessToken !== null);
