import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getCards, getSets, getTypes } from '../api/cards';
import type { CardListParams } from '../api/cards';
import SeriesSidebar from '../components/SeriesSidebar';
import './pages.css';

const SUPERTYPES = ['Pokémon', 'Trainer', 'Energy'];

type SortField = 'name' | 'number';
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
  const ordering = searchParams.get('ordering') || 'name';
  const sortField: SortField = ordering.replace('-', '') as SortField;
  const sortDirection: SortDirection = ordering.startsWith('-')
    ? 'desc'
    : 'asc';
  const page = Number(searchParams.get('page') ?? '1');

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
      const next = new URLSearchParams(searchParamsRef.current);
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
  // that stops making sense outside where it was picked.
  function handleSetSelect(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set('set', value);
        } else {
          next.delete('set');
        }
        next.set('ordering', value === '' ? 'name' : 'number');
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

  const params: CardListParams = {
    search: search || undefined,
    rarity: rarity || undefined,
    supertype: supertype || undefined,
    type: type || undefined,
    set: setId ? Number(setId) : undefined,
    ordering,
    page,
  };

  const cardsQuery = useQuery({
    queryKey: ['cards', params],
    queryFn: () => getCards(params),
    placeholderData: keepPreviousData,
  });

  const setsQuery = useQuery({ queryKey: ['sets'], queryFn: getSets });
  const typesQuery = useQuery({ queryKey: ['types'], queryFn: getTypes });

  return (
    <div className="cards-layout">
      <SeriesSidebar
        sets={setsQuery.data ?? []}
        selectedSetId={setId}
        onSelect={handleSetSelect}
      />

      <div className="cards-main">
        <h1>Get Poked</h1>

        <div className="filters">
          <input
            type="text"
            placeholder="Search by name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <input
            type="text"
            placeholder="Rarity..."
            value={rarity}
            onChange={(e) => handleFilterChange('rarity', e.target.value)}
          />
          <select
            aria-label="Supertype"
            value={supertype}
            onChange={(e) => handleFilterChange('supertype', e.target.value)}
          >
            <option value="">All supertypes</option>
            {SUPERTYPES.map((s) => (
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
                  className="card-tile"
                >
                  <img src={card.image_small} alt={card.name} />
                  <div className="card-tile-text">
                    <span className="card-name">{card.name}</span>
                    <span className="card-set">{card.set.name}</span>
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
