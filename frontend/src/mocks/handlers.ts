import { http, HttpResponse } from 'msw';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const handlers = [
  http.get(`${BASE_URL}/api/v1/health/`, () => {
    return HttpResponse.json({ status: 'ok' });
  }),
];
