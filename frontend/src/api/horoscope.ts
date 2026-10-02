import { ApiError, apiClient } from '../lib/apiClient';
import type { CardListItem } from './cards';

export type RarityTier = 'common' | 'mid' | 'chase';

export interface HoroscopeCard {
  card: CardListItem;
  supertype: string;
  rarity_tier: RarityTier;
  order: number;
}

export interface HoroscopePull {
  id: number;
  pull_date: string;
  pulled_at: string;
  cards: HoroscopeCard[];
}

// Idempotent — the first call of a UTC day creates a pull, any later call
// that same day just returns the existing one.
export const pullTodayHoroscope = () =>
  apiClient<HoroscopePull>('/api/v1/horoscope/pull/', { method: 'POST' });

export interface HoroscopePullDatesResponse {
  // "YYYY-MM-DD" — only the days within the requested month that actually
  // have a pull. Powers the calendar's "which days are clickable" check,
  // deliberately lighter than fetching full pulls for an entire month.
  dates: string[];
}

export const getHoroscopePullDates = (month: string) =>
  apiClient<HoroscopePullDatesResponse>(
    `/api/v1/horoscope-pull-dates/?month=${month}`,
  );

// A 404 here means "no pull exists yet for this date" — an expected,
// common state (checking whether today has been pulled yet, before it
// has), not a failure, so it resolves to null rather than throwing like
// every other apiClient call in this app.
export async function getHoroscopePullForDate(
  date: string,
): Promise<HoroscopePull | null> {
  try {
    return await apiClient<HoroscopePull>(`/api/v1/horoscope-pulls/${date}/`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
