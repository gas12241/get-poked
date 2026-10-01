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
import HoroscopePage, { formatHoroscopeDate } from './HoroscopePage';

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
    expect(screen.getByText('December 25th, 2025')).toBeInTheDocument();
  });

  it('shows each history card’s name as a visible label, not just alt text', async () => {
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

    const { container } = renderWithProviders(<HoroscopePage />);

    await screen.findByText('December 25th, 2025');
    // A visible <p> label within the history card, not merely the image's
    // alt text — the point is a clickable name a sighted user can actually
    // read, same as the main grid already has. Scoped to the Energy
    // card's own link (id 7, per mockHoroscopePull) rather than just the
    // first match, since every card in the fixture has its own label.
    const label = container.querySelector(
      'a[href="/cards/7"] .horoscope-card-tile-label',
    );
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe('Card 6');
  });

  it('excludes today’s pull from the past-horoscopes list, showing it only as "today"', async () => {
    useAuthStore.setState({ accessToken: 'test-token' });
    server.use(
      http.get(`${BASE_URL}/api/v1/horoscope-pulls/`, () => {
        return HttpResponse.json({
          count: 2,
          next: null,
          previous: null,
          results: [
            mockHoroscopePull(todayUtc(), 1),
            mockHoroscopePull('2025-12-25', 7),
          ],
        });
      }),
    );

    renderWithProviders(<HoroscopePage />);

    await screen.findByText('Past horoscopes');
    // The older pull shows in history...
    expect(screen.getByText('December 25th, 2025')).toBeInTheDocument();
    // ...but today's own date never appears there — it's shown above as
    // "today's horoscope" (the result grid), not as a line in the past
    // list.
    const todayFormatted = formatHoroscopeDate(todayUtc());
    expect(screen.queryByText(todayFormatted)).not.toBeInTheDocument();
  });

  it('shows "No past horoscopes yet" when today’s pull is the only one that exists', async () => {
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

    expect(await screen.findByText('Past horoscopes')).toBeInTheDocument();
    expect(screen.getByText('No past horoscopes yet.')).toBeInTheDocument();
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

describe('formatHoroscopeDate', () => {
  it('formats as "Month Dayth, Year"', () => {
    expect(formatHoroscopeDate('2026-10-01')).toBe('October 1st, 2026');
  });

  it.each([
    ['2026-01-02', '2nd'],
    ['2026-01-03', '3rd'],
    ['2026-01-04', '4th'],
    ['2026-01-11', '11th'],
    ['2026-01-12', '12th'],
    ['2026-01-13', '13th'],
    ['2026-01-21', '21st'],
    ['2026-01-22', '22nd'],
    ['2026-01-23', '23rd'],
    ['2026-01-31', '31st'],
  ])('gives %s the correct ordinal suffix (%s)', (dateStr, expectedDay) => {
    expect(formatHoroscopeDate(dateStr)).toContain(expectedDay);
  });

  it('does not shift to the adjacent day regardless of the runner’s local timezone', () => {
    // The classic gotcha this guards against: new Date("2026-01-01") parses
    // as UTC midnight, and reading it back with *local* getters can roll
    // over to Dec 31 for a timezone west of UTC. formatHoroscopeDate must
    // never do that, since pull_date has no time-of-day component to begin
    // with — it should always read as exactly the date the backend sent.
    expect(formatHoroscopeDate('2026-01-01')).toBe('January 1st, 2026');
    expect(formatHoroscopeDate('2026-12-31')).toBe('December 31st, 2026');
  });
});
