import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addToCollection,
  getCollectionEntriesByCard,
  removeFromCollection,
  updateCollectionQuantity,
} from '../api/collection';
import { useIsAuthenticated } from '../store/authStore';

const QUERY_KEY = ['collection-entries-by-card'];

// Detail-page only (not on list tiles — a quantity stepper is too cramped
// at tile size; favoriting alone covers the tile use case, see
// FavoriteButton.tsx).
function CollectionControl({ cardId }: { cardId: number }) {
  const isAuthenticated = useIsAuthenticated();
  const queryClient = useQueryClient();

  const entriesQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getCollectionEntriesByCard,
    enabled: isAuthenticated,
  });

  const entry = entriesQuery.data?.[cardId];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const addMutation = useMutation({
    mutationFn: () => addToCollection(cardId),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: (quantity: number) =>
      updateCollectionQuantity(entry!.id, quantity),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: () => removeFromCollection(entry!.id),
    onSuccess: invalidate,
  });

  if (!isAuthenticated) return null;

  const isPending =
    addMutation.isPending ||
    updateMutation.isPending ||
    removeMutation.isPending;

  if (!entry) {
    return (
      <button
        type="button"
        className="collection-add-button"
        disabled={isPending}
        onClick={() => addMutation.mutate()}
      >
        {addMutation.isPending ? 'Adding...' : 'Add to collection'}
      </button>
    );
  }

  return (
    <div className="collection-stepper">
      <span>You own</span>
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={isPending || entry.quantity <= 1}
        onClick={() => updateMutation.mutate(entry.quantity - 1)}
      >
        −
      </button>
      <span className="collection-quantity">{entry.quantity}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={isPending}
        onClick={() => updateMutation.mutate(entry.quantity + 1)}
      >
        +
      </button>
      <button
        type="button"
        className="collection-remove-button"
        disabled={isPending}
        onClick={() => removeMutation.mutate()}
      >
        Remove
      </button>
    </div>
  );
}

export default CollectionControl;
