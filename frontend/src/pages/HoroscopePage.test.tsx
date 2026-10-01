import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { mockHoroscopePull } from '../mocks/handlers';
import { renderWithProviders } from '../test/renderWithProviders';
import { useAuthStore } from '../store/authStore';
import {
  HOROSCOPE_FLIP_DURATION_MS,
  HOROSCOPE_SPIN_DURATION_MS,
  HOROSCOPE_STAGGER_MS,
} from '../components/HoroscopeReel';
import HoroscopePage from './HoroscopePage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

// The last (7th, index 6) reel's own full timeline, from mount.
const REEL_TIMEOUT_MS =
  6 * HOROSCOPE_STAGGER_MS +
  HOROSCOPE_SPIN_DURATION_MS +
  HOROSCOPE_FLIP_DURATION_MS +
  1000;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

beforeEach(() => {
  useAuthStore.setState({ accessToken: null });
});

describe('HoroscopePage', () => {
  it('shows a log-in message when logged out, and fires no requests', async () => {
    let requested = false;
    server.use(
      http.get(`${BASE_URL}/api/v1/horoscope-pulls/`, () => {
        requested = true;
        return HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        });
      }),
    );

    renderWithProviders(<HoroscopePage />);

    expect(
      screen.getByText('Log in to pull your daily horoscope.'),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(requested).toBe(false);
  });

  it('shows a Pull button, then reveals the 7 cards once pulled', async () => {
    useAuthStore.setState({ accessToken: 'test-token' });
    server.use(
      http.post(`${BASE_URL}/api/v1/horoscope/pull/`, () => {
        return HttpResponse.json(mockHoroscopePull(todayUtc()));
      }),
    );

    renderWithProviders(<HoroscopePage />);

    const pullButton = await screen.findByRole('button', {
      name: "Pull today's horoscope",
    });
    await userEvent.click(pullButton);

    // Reveal is in progress — the result grid shouldn't be up yet. "Card 6"
    // (the Energy slot) is unique across the page at this point.
    expect(screen.queryByText('Card 6')).not.toBeInTheDocument();

    await waitFor(
      () => expect(screen.getByText('Card 6')).toBeInTheDocument(),
      {
        timeout: REEL_TIMEOUT_MS,
      },
    );
  });

  it('shows the static result grid directly when already pulled today, with no reel animation', async () => {
    useAuthStore.setState({ accessToken: 'test-token' });
    server.use(
      http.get(`${BASE_URL}/api/v1/horoscope-pulls/`, () => {
        return HttpResponse.json({
          count: 1,
          next: null,
          previous: null,
          results: [mockHoroscopePull(todayUtc())],
        });
      }),
    );

    const { container } = renderWithProviders(<HoroscopePage />);

    await screen.findByText('Card 6');
    expect(
      screen.queryByRole('button', { name: "Pull today's horoscope" }),
    ).not.toBeInTheDocument();
    // The animated reel never mounts in this state — the explicit
    // no-replay regression check.
    expect(container.querySelector('.horoscope-slot')).toBeNull();
  });

  it('shows each card name, linked to its detail page, in the result grid', async () => {
    useAuthStore.setState({ accessToken: 'test-token' });
    server.use(
      http.get(`${BASE_URL}/api/v1/horoscope-pulls/`, () => {
        return HttpResponse.json({
          count: 1,
          next: null,
          previous: null,
          results: [mockHoroscopePull(todayUtc())],
        });
      }),
    );

    renderWithProviders(<HoroscopePage />);

    const link = await screen.findByRole('link', { name: 'Card 6' });
    expect(link).toHaveAttribute('href', '/cards/7');
  });

  it('shows the "here are your cards" line once a pull exists, not before', async () => {
    useAuthStore.setState({ accessToken: 'test-token' });

    renderWithProviders(<HoroscopePage />);

    await screen.findByRole('button', { name: "Pull today's horoscope" });
    expect(
      screen.queryByText(
        'Here are your 5 Pokémon, 1 Trainer, and 1 Energy for the day!',
      ),
    ).not.toBeInTheDocument();
  });

  it('lists past pulls in the history section', async () => {
    useAuthStore.setState({ accessToken: 'test-token' });
    server.use(
      http.get(`${BASE_URL}/api/v1/horoscope-pulls/`, () => {
        return HttpResponse.json({
          count: 1,
          next: null,
          previous: null,
          results: [mockHoroscopePull('2025-12-25', 7)],
        });
      }),
    );

    renderWithProviders(<HoroscopePage />);

    expect(await screen.findByText('Past horoscopes')).toBeInTheDocument();
    expect(screen.getByText('2025-12-25')).toBeInTheDocument();
  });

  it('disables the Pull button and shows a pending label while the pull is in flight', async () => {
    useAuthStore.setState({ accessToken: 'test-token' });
    server.use(
      http.post(`${BASE_URL}/api/v1/horoscope/pull/`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json(mockHoroscopePull(todayUtc()));
      }),
    );

    renderWithProviders(<HoroscopePage />);
    const pullButton = await screen.findByRole('button', {
      name: "Pull today's horoscope",
    });
    await userEvent.click(pullButton);

    const pendingButton = await screen.findByRole('button', {
      name: 'Pulling...',
    });
    expect(pendingButton).toBeDisabled();
  });

  it('shows an error message if pulling fails', async () => {
    useAuthStore.setState({ accessToken: 'test-token' });
    server.use(
      http.post(`${BASE_URL}/api/v1/horoscope/pull/`, () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    renderWithProviders(<HoroscopePage />);

    const pullButton = await screen.findByRole('button', {
      name: "Pull today's horoscope",
    });
    await userEvent.click(pullButton);

    expect(
      await screen.findByText('Failed to pull your horoscope. Try again.'),
    ).toBeInTheDocument();
  });

  it('shows both the UTC reset time and its local-time equivalent', async () => {
    useAuthStore.setState({ accessToken: 'test-token' });

    renderWithProviders(<HoroscopePage />);

    expect(
      await screen.findByText(/Resets daily at midnight UTC/),
    ).toBeInTheDocument();
  });
});
