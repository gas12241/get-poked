import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCollection,
  getFavorites,
  removeFavorite,
  removeFromCollection,
  updateCollectionQuantity,
} from '../api/collection';
import { useIsAuthenticated } from '../store/authStore';
import './pages.css';

type Tab = 'owned' | 'favorites';

function OwnedTab() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const collectionQuery = useQuery({
    queryKey: ['collection', page],
    queryFn: () => getCollection({ page }),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['collection'] });
    queryClient.invalidateQueries({ queryKey: ['collection-entries-by-card'] });
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, quantity }: { id: number; quantity: number }) =>
      updateCollectionQuantity(id, quantity),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: removeFromCollection,
    onSuccess: invalidate,
  });

  if (collectionQuery.isLoading) return <p>Loading...</p>;
  if (!collectionQuery.data) return null;

  if (collectionQuery.data.count === 0) {
    return <p>You haven&apos;t added any cards to your collection yet.</p>;
  }

  return (
    <>
      <div className="card-grid">
        {collectionQuery.data.results.map((entry) => (
          <div key={entry.id} className="card-tile collection-tile">
            <Link to={`/cards/${entry.card.id}`} state={{ from: 'collection' }}>
              {entry.card.image_small ? (
                <img src={entry.card.image_small} alt={entry.card.name} />
              ) : (
                <div className="no-image-placeholder">No image available</div>
              )}
              <div className="card-tile-text">
                <span className="card-name">{entry.card.name}</span>
                <span className="card-set">{entry.card.set.name}</span>
              </div>
            </Link>
            <div className="collection-stepper">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={entry.quantity <= 1 || updateMutation.isPending}
                onClick={() =>
                  updateMutation.mutate({
                    id: entry.id,
                    quantity: entry.quantity - 1,
                  })
                }
              >
                −
              </button>
              <span className="collection-quantity">{entry.quantity}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={updateMutation.isPending}
                onClick={() =>
                  updateMutation.mutate({
                    id: entry.id,
                    quantity: entry.quantity + 1,
                  })
                }
              >
                +
              </button>
              <button
                type="button"
                className="collection-remove-button"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate(entry.id)}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="pagination">
        <button
          onClick={() => setPage((p) => p - 1)}
          disabled={!collectionQuery.data.previous}
        >
          Previous
        </button>
        <span>
          Page {page} &middot; {collectionQuery.data.count} cards
        </span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={!collectionQuery.data.next}
        >
          Next
        </button>
      </div>
    </>
  );
}

function FavoritesTab() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const favoritesQuery = useQuery({
    queryKey: ['favorites', page],
    queryFn: () => getFavorites({ page }),
  });

  const removeMutation = useMutation({
    mutationFn: removeFavorite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      queryClient.invalidateQueries({ queryKey: ['favorite-ids-by-card'] });
    },
  });

  if (favoritesQuery.isLoading) return <p>Loading...</p>;
  if (!favoritesQuery.data) return null;

  if (favoritesQuery.data.count === 0) {
    return <p>You haven&apos;t favorited any cards yet.</p>;
  }

  return (
    <>
      <div className="card-grid">
        {favoritesQuery.data.results.map((favorite) => (
          <div key={favorite.id} className="card-tile collection-tile">
            <Link
              to={`/cards/${favorite.card.id}`}
              state={{ from: 'collection' }}
            >
              {favorite.card.image_small ? (
                <img src={favorite.card.image_small} alt={favorite.card.name} />
              ) : (
                <div className="no-image-placeholder">No image available</div>
              )}
              <div className="card-tile-text">
                <span className="card-name">{favorite.card.name}</span>
                <span className="card-set">{favorite.card.set.name}</span>
              </div>
            </Link>
            <button
              type="button"
              className="collection-remove-button"
              disabled={removeMutation.isPending}
              onClick={() => removeMutation.mutate(favorite.id)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="pagination">
        <button
          onClick={() => setPage((p) => p - 1)}
          disabled={!favoritesQuery.data.previous}
        >
          Previous
        </button>
        <span>
          Page {page} &middot; {favoritesQuery.data.count} cards
        </span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={!favoritesQuery.data.next}
        >
          Next
        </button>
      </div>
    </>
  );
}

function CollectionPage() {
  const isAuthenticated = useIsAuthenticated();
  const [tab, setTab] = useState<Tab>('owned');

  if (!isAuthenticated) {
    return (
      <div className="auth-page">
        <h1>Your collection</h1>
        <p>
          <Link to="/login">Log in</Link> to view your collection.
        </p>
      </div>
    );
  }

  return (
    <div className="cards-main">
      <h1>Your collection</h1>
      <div className="collection-tabs">
        <button
          type="button"
          className={tab === 'owned' ? 'active' : undefined}
          onClick={() => setTab('owned')}
        >
          Owned
        </button>
        <button
          type="button"
          className={tab === 'favorites' ? 'active' : undefined}
          onClick={() => setTab('favorites')}
        >
          Favorites
        </button>
      </div>
      {tab === 'owned' ? <OwnedTab /> : <FavoritesTab />}
    </div>
  );
}

export default CollectionPage;
