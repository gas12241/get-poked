import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addToCollection,
  getCollectionEntriesByCard,
  removeFromCollection,
  updateCollectionQuantity,
} from '../api/collection';
import { useIsAuthenticated } from '../store/authStore';

const QUERY_KEY = ['collection-entries-by-card'];

interface CollectionQuickControlProps {
  cardId: number;
  className?: string;
}

// A compact +/- for the Cards page tile overlay — same data and mutations
// as CollectionControl.tsx's detail-page stepper (same query key too, so
// the two stay in sync without a page reload), just condensed to fit a
// tile rather than a full pill button + "Remove". Reused as an overlay on
// a CardListPage tile (whole tile is a <Link> — preventDefault/
// stopPropagation keep a click here from also navigating), same pattern
// as FavoriteButton.tsx's star. See docs/decisions.md #081.
function CollectionQuickControl({
  cardId,
  className,
}: CollectionQuickControlProps) {
  const isAuthenticated = useIsAuthenticated();
  const queryClient = useQueryClient();

  const entriesQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getCollectionEntriesByCard,
    enabled: isAuthenticated,
  });

  const entry = entriesQuery.data?.[cardId];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    // The Cards page's Owned/Favorites view filters its own ['cards', ...]
    // query server-side — removing a card here has to refetch that list
    // too, or it keeps showing a card that no longer belongs in that view
    // until the page is refreshed.
    queryClient.invalidateQueries({ queryKey: ['cards'] });
  };

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
  const classes = ['collection-quick-control', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {entry && (
        <button
          type="button"
          className="collection-quick-button collection-quick-decrease"
          aria-label="Remove one from collection"
          disabled={isPending}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // No separate "Remove" button in this compact control — going
            // below 1 removes the entry entirely, same end state as the
            // detail page's own Remove button.
            if (entry.quantity <= 1) {
              removeMutation.mutate();
            } else {
              updateMutation.mutate(entry.quantity - 1);
            }
          }}
        >
          −
        </button>
      )}
      <button
        type="button"
        className="collection-quick-button collection-quick-increase"
        aria-label="Add one to collection"
        disabled={isPending}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (entry) {
            updateMutation.mutate(entry.quantity + 1);
          } else {
            addMutation.mutate();
          }
        }}
      >
        +
      </button>
    </div>
  );
}

export default CollectionQuickControl;
