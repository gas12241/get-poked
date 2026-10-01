import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  getCardNames,
  getCards,
  getRarities,
  getSets,
  getSupertypes,
  getTypes,
} from '../api/cards';
import type { CardListParams } from '../api/cards';
import NameAutocomplete from '../components/NameAutocomplete';
import SeriesSidebar from '../components/SeriesSidebar';
import './pages.css';

type SortField = 'name' | 'number' | 'release_date';
type SortDirection = 'asc' | 'desc';

// Filters/sort/page live in the URL (not component state) so that
// navigating to a card's detail page and back restores the exact view you
// were looking at, rather than resetting to the unfiltered default — see
// docs/decisions.md #033. Every change uses `replace` (not the default
// `push`) so adjusting a filter updates the current history entry instead
// of stacking a new one for every keystroke/click.
function CardListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const rarity = searchParams.get('rarity') ?? '';
  const supertype = searchParams.get('supertype') ?? '';
  const type = searchParams.get('type') ?? '';
  const setId = searchParams.get('set') ?? '';
  const series = searchParams.get('series') ?? '';
  const ordering = searchParams.get('ordering') || 'name';
  const sortField: SortField = ordering.replace('-', '') as SortField;
  const sortDirection: SortDirection = ordering.startsWith('-')
    ? 'desc'
    : 'asc';
  const page = Number(searchParams.get('page') ?? '1');
  // Only meaningful for Name/Number sorts — it decides which way ties
  // (e.g. every "Abra", or every "#1" across sets) break by release date.
  // See docs/decisions.md #038.
  const newestFirst = searchParams.get('newest_first') === 'true';

  const [searchInput, setSearchInput] = useState(search);

  // Always mirrors the latest searchParams, for the debounce timeout below
  // to read — a standard pattern for giving an async callback access to the
  // latest value without going stale. `window.location.search` was tried
  // first and rejected: it only reflects a real BrowserRouter, not
  // MemoryRouter (used in tests), so it silently broke in the test
  // environment.
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      // Reads the ref rather than closing over `searchParams` directly —
      // this effect's dependency array only includes `searchInput`, so a
      // direct closure over `searchParams` would go stale between when the
      // timer is scheduled and when it fires, clobbering any filter changes
      // made in between (e.g. picking a set) back to whatever the URL was
      // at the moment typing started.
      const current = searchParamsRef.current;
      // `setSearchParams`'s identity changes on every URL update (react-
      // router ties it to `location.search`), and it's a dependency here,
      // so this effect re-arms on unrelated changes too — e.g. clicking
      // "Next". Bail out when the committed search already matches
      // `searchInput`: that means this fire wasn't triggered by a new
      // keystroke, so there's nothing to commit and paging must be left
      // alone instead of being reset back to page 1.
      if ((current.get('search') ?? '') === searchInput) {
        return;
      }
      const next = new URLSearchParams(current);
      if (searchInput) {
        next.set('search', searchInput);
      } else {
        next.delete('search');
      }
      next.set('page', '1');
      setSearchParams(next, { replace: true });
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchInput, setSearchParams]);

  function handleFilterChange(key: string, value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        next.set('page', '1');
        return next;
      },
      { replace: true },
    );
  }

  // Number-sort only means "checklist order within a set" — across the
  // whole catalog every set has its own #1, so the field/direction reset to
  // this context's sensible default (Number for a set, Name for All Sets)
  // whenever the set filter changes, rather than carrying over a choice
  // that stops making sense outside where it was picked. A series spans
  // multiple sets too (see docs/decisions.md #035), so it gets the same
  // "All Sets" treatment as far as sort defaults go, not "a set."
  function handleSetSelect(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set('set', value);
        } else {
          next.delete('set');
        }
        next.delete('series');
        next.set('ordering', value === '' ? 'name' : 'number');
        next.set('page', '1');
        return next;
      },
      { replace: true },
    );
  }

  function handleSeriesSelect(seriesName: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('set');
        next.set('series', seriesName);
        next.set('ordering', 'name');
        next.set('page', '1');
        return next;
      },
      { replace: true },
    );
  }

  function handlePageChange(newPage: number) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('page', String(newPage));
        return next;
      },
      { replace: true },
    );
  }

  // Clears search/rarity/supertype/type only — deliberately leaves the
  // current set/series selection alone. That's a separate, deliberate
  // navigational choice (the sidebar's own "All Sets" already resets it),
  // not something someone narrowing down within a set they picked on
  // purpose would expect a "reset filters" button to also undo. Sort is
  // left alone for the same reason — it's a view preference, not a filter.
  function handleResetFilters() {
    setSearchInput('');
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('search');
        next.delete('rarity');
        next.delete('supertype');
        next.delete('type');
        next.set('page', '1');
        return next;
      },
      { replace: true },
    );
  }

  const params: CardListParams = {
    search: search || undefined,
    rarity: rarity || undefined,
    supertype: supertype || undefined,
    type: type || undefined,
    set: setId ? Number(setId) : undefined,
    series: series || undefined,
    ordering,
    page,
    newest_first:
      (sortField === 'name' || sortField === 'number') && newestFirst
        ? true
        : undefined,
  };

  const cardsQuery = useQuery({
    queryKey: ['cards', params],
    queryFn: () => getCards(params),
    placeholderData: keepPreviousData,
  });

  const setsQuery = useQuery({ queryKey: ['sets'], queryFn: getSets });

  // Scoped to the current set or series (neither = every value in the
  // catalog) so these dropdowns never offer a choice that can't match
  // anything within what you're actually looking at — see
  // docs/decisions.md #034, #035.
  const setNumber = setId ? Number(setId) : undefined;
  const seriesName = series || undefined;
  const typesQuery = useQuery({
    queryKey: ['types', setNumber, seriesName],
    queryFn: () => getTypes({ set: setNumber, series: seriesName }),
  });
  const raritiesQuery = useQuery({
    queryKey: ['rarities', setNumber, seriesName],
    queryFn: () => getRarities({ set: setNumber, series: seriesName }),
  });
  const supertypesQuery = useQuery({
    queryKey: ['supertypes', setNumber, seriesName],
    queryFn: () => getSupertypes({ set: setNumber, series: seriesName }),
  });

  // If switching sets makes the current rarity/supertype/type selection
  // impossible (that set has no cards matching it), fall back to "All
  // ___" rather than silently filtering to a combination that can never
  // return a result.
  useEffect(() => {
    if (rarity && raritiesQuery.data && !raritiesQuery.data.includes(rarity)) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('rarity');
          next.set('page', '1');
          return next;
        },
        { replace: true },
      );
    }
  }, [rarity, raritiesQuery.data, setSearchParams]);

  useEffect(() => {
    if (
      supertype &&
      supertypesQuery.data &&
      !supertypesQuery.data.includes(supertype)
    ) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('supertype');
          next.set('page', '1');
          return next;
        },
        { replace: true },
      );
    }
  }, [supertype, supertypesQuery.data, setSearchParams]);

  useEffect(() => {
    if (
      type &&
      typesQuery.data &&
      !typesQuery.data.some((t) => t.name === type)
    ) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('type');
          next.set('page', '1');
          return next;
        },
        { replace: true },
      );
    }
  }, [type, typesQuery.data, setSearchParams]);

  return (
    <div className="cards-layout">
      <SeriesSidebar
        sets={setsQuery.data ?? []}
        selectedSetId={setId}
        selectedSeries={series}
        onSelect={handleSetSelect}
        onSelectSeries={handleSeriesSelect}
      />

      <div className="cards-main">
        <div className="filters">
          <NameAutocomplete
            value={searchInput}
            onChange={setSearchInput}
            fetchSuggestions={(text) =>
              getCardNames({ search: text, set: setNumber, series: seriesName })
            }
            ariaLabel="Search by name"
            placeholder="Search by name..."
          />
          <select
            aria-label="Rarity"
            value={rarity}
            onChange={(e) => handleFilterChange('rarity', e.target.value)}
          >
            <option value="">All rarities</option>
            {raritiesQuery.data?.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            aria-label="Supertype"
            value={supertype}
            onChange={(e) => handleFilterChange('supertype', e.target.value)}
          >
            <option value="">All supertypes</option>
            {supertypesQuery.data?.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            aria-label="Type"
            value={type}
            onChange={(e) => handleFilterChange('type', e.target.value)}
          >
            <option value="">All types</option>
            {typesQuery.data?.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort by"
            value={sortField}
            onChange={(e) =>
              handleFilterChange(
                'ordering',
                `${sortDirection === 'desc' ? '-' : ''}${e.target.value}`,
              )
            }
          >
            <option value="name">Sort: Name</option>
            <option value="number">Sort: Number</option>
            <option value="release_date">Sort: Release date</option>
          </select>
          <select
            aria-label="Sort direction"
            value={sortDirection}
            onChange={(e) =>
              handleFilterChange(
                'ordering',
                `${e.target.value === 'desc' ? '-' : ''}${sortField}`,
              )
            }
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
          {(sortField === 'name' || sortField === 'number') && (
            <label className="newest-first-toggle">
              <input
                type="checkbox"
                checked={newestFirst}
                onChange={(e) =>
                  handleFilterChange(
                    'newest_first',
                    e.target.checked ? 'true' : '',
                  )
                }
              />
              Newest print first
            </label>
          )}
          <button
            type="button"
            onClick={handleResetFilters}
            disabled={!searchInput && !rarity && !supertype && !type}
          >
            Reset filters
          </button>
        </div>

        {cardsQuery.isLoading && <p>Loading cards...</p>}
        {cardsQuery.isError && (
          <p>Failed to load cards: {(cardsQuery.error as Error).message}</p>
        )}

        {cardsQuery.data && (
          <>
            <div className="card-grid">
              {cardsQuery.data.results.map((card) => (
                <Link
                  key={card.id}
                  to={`/cards/${card.id}`}
                  state={{ from: 'cards' }}
                  className="card-tile"
                >
                  {card.image_small ? (
                    <img
                      src={card.image_small}
                      alt={card.name}
                      onError={(e) => {
                        // `image_small` occasionally 404s on the upstream
                        // image host for older cards — falls back to
                        // `image_large` once, guarded so a failure of the
                        // fallback itself doesn't loop. See
                        // docs/decisions.md #039.
                        const img = e.currentTarget;
                        if (img.src !== card.image_large) {
                          img.src = card.image_large;
                        }
                      }}
                    />
                  ) : (
                    // Neither image_small nor image_large has a working
                    // URL for this card — see docs/decisions.md #039.
                    <div className="no-image-placeholder">
                      No image available
                    </div>
                  )}
                  <div className="card-tile-text">
                    <span className="card-name">{card.name}</span>
                    <span className="card-set">
                      {card.set.name}
                      {card.rarity && ` · ${card.rarity}`}
                    </span>
                    <span className="card-meta">
                      #{card.number}
                      {card.artist && ` · ${card.artist}`}
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            <div className="pagination">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={!cardsQuery.data.previous}
              >
                Previous
              </button>
              <span>
                Page {page} &middot; {cardsQuery.data.count} cards
              </span>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={!cardsQuery.data.next}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default CardListPage;
