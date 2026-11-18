import { apiClient } from '../lib/apiClient';
import type { CardListItem, PaginatedResponse } from './cards';

export interface Favorite {
  id: number;
  card: CardListItem;
  date_added: string;
}

export interface CollectionEntry {
  id: number;
  card: CardListItem;
  quantity: number;
  date_added: string;
}

export interface PageParams {
  page?: number;
}

function toQueryString(params: PageParams) {
  const searchParams = new URLSearchParams();
  if (params.page) {
    searchParams.set('page', String(params.page));
  }
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

// Every favorited card id, unpaginated — for rendering per-tile state while
// browsing the full card catalog (not for the dedicated Favorites tab,
// which uses getFavorites below instead). See docs/decisions.md #077.
export const getFavoriteCardIds = () =>
  apiClient<number[]>('/api/v1/favorites/card-ids/');

export const getFavorites = (params: PageParams = {}) =>
  apiClient<PaginatedResponse<Favorite>>(
    `/api/v1/favorites/${toQueryString(params)}`,
  );

export const addFavorite = (cardId: number) =>
  apiClient<Favorite>('/api/v1/favorites/', {
    method: 'POST',
    body: JSON.stringify({ card_id: cardId }),
  });

export const removeFavorite = (id: number) =>
  apiClient<void>(`/api/v1/favorites/${id}/`, { method: 'DELETE' });

// {card_id: quantity} for every card the user owns, unpaginated — same
// reasoning as getFavoriteCardIds above.
export const getCollectionQuantities = () =>
  apiClient<Record<number, number>>('/api/v1/collections/quantities/');

export const getCollection = (params: PageParams = {}) =>
  apiClient<PaginatedResponse<CollectionEntry>>(
    `/api/v1/collections/${toQueryString(params)}`,
  );

export const addToCollection = (cardId: number, quantity = 1) =>
  apiClient<CollectionEntry>('/api/v1/collections/', {
    method: 'POST',
    body: JSON.stringify({ card_id: cardId, quantity }),
  });

export const updateCollectionQuantity = (id: number, quantity: number) =>
  apiClient<CollectionEntry>(`/api/v1/collections/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity }),
  });

export const removeFromCollection = (id: number) =>
  apiClient<void>(`/api/v1/collections/${id}/`, { method: 'DELETE' });
