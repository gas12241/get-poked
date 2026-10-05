import { apiClient } from '../lib/apiClient';

export interface AuthResponse {
  access: string;
}

export const registerAccount = (
  email: string,
  username: string,
  password: string,
) =>
  apiClient<{ email: string }>('/api/v1/register/', {
    method: 'POST',
    body: JSON.stringify({ email, username, password }),
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

export const googleLogin = (credential: string) =>
  apiClient<AuthResponse>('/api/v1/google/', {
    method: 'POST',
    body: JSON.stringify({ credential }),
    skipAuth: true,
  });

export interface Profile {
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  is_verified: boolean;
  date_joined: string;
  has_usable_password: boolean;
}

export const getProfile = () => apiClient<Profile>('/api/v1/me/');

export const updateProfile = (
  data: Partial<Pick<Profile, 'username' | 'first_name' | 'last_name'>>,
) =>
  apiClient<Profile>('/api/v1/me/', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const changePassword = (currentPassword: string, newPassword: string) =>
  apiClient<{ detail: string }>('/api/v1/me/change-password/', {
    method: 'POST',
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
