import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getCards, getSets, getTypes } from '../api/cards';
import type { CardListParams } from '../api/cards';
import SeriesSidebar from '../components/SeriesSidebar';
import './pages.css';

const SUPERTYPES = ['Pokémon', 'Trainer', 'Energy'];

function CardListPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [rarity, setRarity] = useState('');
  const [supertype, setSupertype] = useState('');
  const [type, setType] = useState('');
  const [setId, setSetId] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  function handleFilterChange(
    setFilter: (value: string) => void,
    value: string,
  ) {
    setFilter(value);
    setPage(1);
  }

  const params: CardListParams = {
    search: search || undefined,
    rarity: rarity || undefined,
    supertype: supertype || undefined,
    type: type || undefined,
    set: setId ? Number(setId) : undefined,
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
        onSelect={(value) => handleFilterChange(setSetId, value)}
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
            onChange={(e) => handleFilterChange(setRarity, e.target.value)}
          />
          <select
            aria-label="Supertype"
            value={supertype}
            onChange={(e) => handleFilterChange(setSupertype, e.target.value)}
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
            onChange={(e) => handleFilterChange(setType, e.target.value)}
          >
            <option value="">All types</option>
            {typesQuery.data?.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
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
                  <span className="card-name">{card.name}</span>
                  <span className="card-set">{card.set.name}</span>
                </Link>
              ))}
            </div>

            <div className="pagination">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={!cardsQuery.data.previous}
              >
                Previous
              </button>
              <span>
                Page {page} &middot; {cardsQuery.data.count} cards
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
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
