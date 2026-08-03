import { useAuthStore } from '../store/authStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface ApiClientOptions extends RequestInit {
  skipAuth?: boolean;
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
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}
