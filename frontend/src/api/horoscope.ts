import { apiClient } from '../lib/apiClient';
import type { CardListItem, PaginatedResponse } from './cards';

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
// that same day just returns the existing one. The frontend decides
// whether to play the reveal animation itself (see HoroscopePage.tsx),
// by comparing today's UTC date against the history list's most recent
// pull_date before ever calling this — not from this response — so this
// stays a plain wrapper like every other endpoint in this file.
export const pullTodayHoroscope = () =>
  apiClient<HoroscopePull>('/api/v1/horoscope/pull/', { method: 'POST' });

export const getHoroscopeHistory = () =>
  apiClient<PaginatedResponse<HoroscopePull>>('/api/v1/horoscope-pulls/');
