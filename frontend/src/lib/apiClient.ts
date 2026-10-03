import { useAuthStore } from '../store/authStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface ApiClientOptions extends RequestInit {
  skipAuth?: boolean;
}

// Carries the numeric HTTP status alongside the message, so a caller that
// needs to tell one failure apart from another (e.g. "404 means no
// horoscope pull exists yet for this date" vs. a real error) doesn't have
// to string-match `.message`. Every existing caller already just treats
// any thrown error as "the request failed," so this is purely additive.
//
// `body` carries the parsed JSON error body (when there is one), so a
// caller that needs more than the derived `.message` — e.g. LoginPage
// detecting the specific "unverified account" case to offer a resend
// action — can inspect it directly instead of string-matching the message.
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof ApiError
    ? err.message
    : 'Something went wrong. Please try again.';
}

function messageFromErrorBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.detail === 'string') return record.detail;
    const firstFieldError = Object.values(record).find(
      (v) => Array.isArray(v) && typeof v[0] === 'string',
    ) as string[] | undefined;
    if (firstFieldError) return firstFieldError[0];
  }
  return fallback;
}

// Dedupes concurrent refresh attempts — several queries 401ing around the
// same moment (the access token's 15-minute expiry) would otherwise each
// fire their own refresh request.
let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/v1/token/refresh/`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!response.ok) return null;
        const data = (await response.json()) as { access: string };
        useAuthStore.getState().setAccessToken(data.access);
        return data.access;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function doFetch(
  path: string,
  options: ApiClientOptions,
): Promise<Response> {
  const { skipAuth, headers, ...rest } = options;
  const accessToken = useAuthStore.getState().accessToken;

  return fetch(`${BASE_URL}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken && !skipAuth
        ? { Authorization: `Bearer ${accessToken}` }
        : {}),
      ...headers,
    },
  });
}

export async function apiClient<T>(
  path: string,
  options: ApiClientOptions = {},
  isRetry = false,
): Promise<T> {
  const response = await doFetch(path, options);

  if (!response.ok) {
    // A 401 on anything other than the refresh call itself: try one silent
    // refresh (via the httpOnly cookie) and retry the original request once.
    const isRefreshCall = path === '/api/v1/token/refresh/';
    if (response.status === 401 && !isRetry && !isRefreshCall) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        return apiClient<T>(path, options, true);
      }
      useAuthStore.getState().clearAccessToken();
    }

    const fallbackMessage = `API error ${response.status}: ${response.statusText}`;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    throw new ApiError(
      response.status,
      messageFromErrorBody(body, fallbackMessage),
      body,
    );
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
