import { apiClient } from '../lib/apiClient';

export interface HealthResponse {
  status: string;
}

export const getHealth = () => apiClient<HealthResponse>('/api/v1/health/');
