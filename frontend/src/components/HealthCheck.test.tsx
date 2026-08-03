import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import HealthCheck from './HealthCheck';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

describe('HealthCheck', () => {
  it('shows loading, then success status once the backend responds', async () => {
    renderWithProviders(<HealthCheck />);

    expect(
      screen.getByText('Checking backend connection...'),
    ).toBeInTheDocument();

    expect(await screen.findByText('Backend status: ok')).toBeInTheDocument();
  });

  it('shows an error message when the backend is unreachable', async () => {
    server.use(
      http.get(`${BASE_URL}/api/v1/health/`, () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    renderWithProviders(<HealthCheck />);

    expect(await screen.findByText(/Backend unreachable:/)).toBeInTheDocument();
  });
});
