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
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiClient<T>(
  path: string,
  options: ApiClientOptions = {},
): Promise<T> {
  const { skipAuth, headers, ...rest } = options;
  const accessToken = useAuthStore.getState().accessToken;

  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    // Needed once the refresh-token httpOnly cookie is wired up (later phase).
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken && !skipAuth
        ? { Authorization: `Bearer ${accessToken}` }
        : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `API error ${response.status}: ${response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
}
