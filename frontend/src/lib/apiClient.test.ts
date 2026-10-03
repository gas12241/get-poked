import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { ApiError, apiClient, errorMessage } from './apiClient';
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

  it('returns undefined without parsing a body for a 204/205 response', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/logout/`, () => {
        return new HttpResponse(null, { status: 205 });
      }),
    );

    await expect(
      apiClient('/api/v1/logout/', { method: 'POST' }),
    ).resolves.toBeUndefined();
  });

  it('derives a readable message from a `detail` error body', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/thing/`, () => {
        return HttpResponse.json(
          { detail: 'Please verify your email.' },
          { status: 400 },
        );
      }),
    );

    const error = (await apiClient('/api/v1/thing/', {
      method: 'POST',
    }).catch((e) => e)) as ApiError;

    expect(error.message).toBe('Please verify your email.');
    expect(error.body).toEqual({ detail: 'Please verify your email.' });
  });

  it('derives a readable message from a field-error-shaped body', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/thing/`, () => {
        return HttpResponse.json(
          { email: ['This field must be unique.'] },
          { status: 400 },
        );
      }),
    );

    const error = (await apiClient('/api/v1/thing/', {
      method: 'POST',
    }).catch((e) => e)) as ApiError;

    expect(error.message).toBe('This field must be unique.');
  });

  it('falls back to the generic message when the error body is not JSON', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/broken/`, () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const error = (await apiClient('/api/v1/broken/').catch(
      (e) => e,
    )) as ApiError;

    expect(error.message).toContain('API error 500');
  });

  it('on a 401, silently refreshes and retries the request once', async () => {
    useAuthStore.getState().setAccessToken('expired-token');
    let callCount = 0;
    server.use(
      http.get(`${BASE_URL}/api/v1/thing/`, ({ request }) => {
        callCount += 1;
        const auth = request.headers.get('Authorization');
        if (auth === 'Bearer expired-token') {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json({ ok: true });
      }),
      http.post(`${BASE_URL}/api/v1/token/refresh/`, () => {
        return HttpResponse.json({ access: 'fresh-token' });
      }),
    );

    const result = await apiClient('/api/v1/thing/');

    expect(result).toEqual({ ok: true });
    expect(callCount).toBe(2);
    expect(useAuthStore.getState().accessToken).toBe('fresh-token');
  });

  it('on a 401 with a failed refresh, clears the token and throws', async () => {
    useAuthStore.getState().setAccessToken('expired-token');
    server.use(
      http.get(`${BASE_URL}/api/v1/thing/`, () => {
        return new HttpResponse(null, { status: 401 });
      }),
      http.post(`${BASE_URL}/api/v1/token/refresh/`, () => {
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(apiClient('/api/v1/thing/')).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});

describe('errorMessage', () => {
  it('returns the ApiError message', () => {
    expect(
      errorMessage(new ApiError(400, 'Something specific went wrong')),
    ).toBe('Something specific went wrong');
  });

  it('falls back to a generic message for a non-ApiError', () => {
    expect(errorMessage(new Error('boom'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
