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
  artist: string;
  set: SetNested;
  types: PokemonType[];
}

export interface CardDetail extends CardListItem {
  hp: string;
  language: string;
  image_large: string;
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
  series?: string;
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

// Types/Rarities/Supertypes all take an optional `set` or `series` to
// narrow the returned choices to what's actually present there, rather
// than every value in the whole catalog — see docs/decisions.md #034,
// #035. At most one is ever sent; `set` wins if somehow both are given.
export interface FilterOptionsParams {
  set?: number;
  series?: string;
}

function filterOptionsQueryString({ set, series }: FilterOptionsParams) {
  if (set) {
    return `?set=${set}`;
  }
  if (series) {
    // URLSearchParams (not a template string) so a series name containing
    // "&" (e.g. "Black & White") is encoded correctly.
    return `?${new URLSearchParams({ series }).toString()}`;
  }
  return '';
}

export const getTypes = (params: FilterOptionsParams = {}) =>
  apiClient<PokemonType[]>(`/api/v1/types/${filterOptionsQueryString(params)}`);

export const getRarities = (params: FilterOptionsParams = {}) =>
  apiClient<string[]>(`/api/v1/rarities/${filterOptionsQueryString(params)}`);

export const getSupertypes = (params: FilterOptionsParams = {}) =>
  apiClient<string[]>(`/api/v1/supertypes/${filterOptionsQueryString(params)}`);

export interface CardNameSuggestionsParams extends FilterOptionsParams {
  search: string;
}

// Powers search-box typeahead. Scoped to `set`/`series` on the Cards page;
// the Quiz page's guess-the-card input deliberately calls this with
// neither (see docs/decisions.md #036) — a global, answer-independent
// suggestion list can't leak which card a given question is about.
export const getCardNames = ({
  search,
  set,
  series,
}: CardNameSuggestionsParams) => {
  const params = new URLSearchParams({ search });
  if (set) {
    params.set('set', String(set));
  } else if (series) {
    params.set('series', series);
  }
  return apiClient<string[]>(`/api/v1/card-names/?${params.toString()}`);
};
