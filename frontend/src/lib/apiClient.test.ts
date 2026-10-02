import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { ApiError, apiClient } from './apiClient';
import { useAuthStore } from '../store/authStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

describe('apiClient', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAccessToken();
  });

  it('sends the Authorization header and credentials when an access token is present', async () => {
    useAuthStore.getState().setAccessToken('test-token-123');
    let capturedAuth: string | null = null;
    let capturedCredentials: RequestCredentials | null = null;

    server.use(
      http.get(`${BASE_URL}/api/v1/ping/`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        capturedCredentials = request.credentials;
        return HttpResponse.json({ ok: true });
      }),
    );

    await apiClient('/api/v1/ping/');

    expect(capturedAuth).toBe('Bearer test-token-123');
    expect(capturedCredentials).toBe('include');
  });

  it('omits the Authorization header when no access token is present', async () => {
    let capturedAuth: string | null = 'unset';
    server.use(
      http.get(`${BASE_URL}/api/v1/ping/`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ ok: true });
      }),
    );

    await apiClient('/api/v1/ping/');

    expect(capturedAuth).toBeNull();
  });

  it('throws when the response is not ok', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/broken/`, () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(apiClient('/api/v1/broken/')).rejects.toThrow('API error 500');
  });

  it('throws an ApiError carrying the numeric status', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/missing/`, () => {
        return new HttpResponse(null, { status: 404 });
      }),
    );

    const error = await apiClient('/api/v1/missing/').catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
  });
});
