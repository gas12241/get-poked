import { apiClient } from '../lib/apiClient';

export interface AuthResponse {
  access: string;
}

export const registerAccount = (email: string, password: string) =>
  apiClient<{ email: string }>('/api/v1/register/', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  });

export const login = (email: string, password: string) =>
  apiClient<AuthResponse>('/api/v1/token/', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  });

export const verifyEmail = (token: string) =>
  apiClient<AuthResponse>('/api/v1/verify-email/', {
    method: 'POST',
    body: JSON.stringify({ token }),
    skipAuth: true,
  });

export const resendVerification = (email: string) =>
  apiClient<{ detail: string }>('/api/v1/verify-email/resend/', {
    method: 'POST',
    body: JSON.stringify({ email }),
    skipAuth: true,
  });

export const logoutRequest = () =>
  apiClient<void>('/api/v1/token/logout/', {
    method: 'POST',
    skipAuth: true,
  });

export const requestPasswordReset = (email: string) =>
  apiClient<{ detail: string }>('/api/v1/password-reset/', {
    method: 'POST',
    body: JSON.stringify({ email }),
    skipAuth: true,
  });

export const confirmPasswordReset = (token: string, password: string) =>
  apiClient<AuthResponse>('/api/v1/password-reset/confirm/', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
    skipAuth: true,
  });
