import { apiClient } from '../lib/apiClient';

export interface PokemonType {
  id: number;
  name: string;
}

export interface SetNested {
  id: number;
  name: string;
  series: string;
}

export interface Set {
  id: number;
  tcg_id: string;
  name: string;
  series: string;
  release_date: string | null;
  language: string;
  image_symbol: string;
  image_logo: string;
}

export interface Attack {
  name: string;
  cost: string[];
  converted_energy_cost: number | null;
  damage: string;
  text: string;
  order: number;
}

export interface Weakness {
  type: PokemonType;
  value: string;
}

export interface Resistance {
  type: PokemonType;
  value: string;
}

export interface CardListItem {
  id: number;
  name: string;
  number: string;
  rarity: string;
  supertype: string;
  image_small: string;
  set: SetNested;
  types: PokemonType[];
}

export interface CardDetail extends CardListItem {
  hp: string;
  language: string;
  image_large: string;
  artist: string;
  national_pokedex_numbers: number[];
  subtypes: string[];
  evolves_from: string;
  evolves_to: string[];
  tcgplayer_url: string;
  cardmarket_url: string;
  details: Record<string, unknown>;
  attacks: Attack[];
  weaknesses: Weakness[];
  resistances: Resistance[];
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface CardListParams {
  search?: string;
  rarity?: string;
  supertype?: string;
  set?: number;
  type?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

function toQueryString(params: CardListParams) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  }
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export const getCards = (params: CardListParams = {}) =>
  apiClient<PaginatedResponse<CardListItem>>(
    `/api/v1/cards/${toQueryString(params)}`,
  );

export const getCard = (id: string | number) =>
  apiClient<CardDetail>(`/api/v1/cards/${id}/`);

export const getSets = () => apiClient<Set[]>('/api/v1/sets/');

export const getTypes = () => apiClient<PokemonType[]>('/api/v1/types/');
