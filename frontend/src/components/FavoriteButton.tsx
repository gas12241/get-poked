import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addFavorite,
  getFavoriteIdsByCard,
  removeFavorite,
} from '../api/collection';
import { useIsAuthenticated } from '../store/authStore';

interface FavoriteButtonProps {
  cardId: number;
  className?: string;
}

// Reused in two contexts: as an overlay on a CardListPage tile (where the
// whole tile is a <Link> — preventDefault/stopPropagation keep a click here
// from also navigating) and inline on CardDetailPage (no wrapping link
// there, so the same two calls are harmless no-ops).
function FavoriteButton({ cardId, className }: FavoriteButtonProps) {
  const isAuthenticated = useIsAuthenticated();
  const queryClient = useQueryClient();

  const favoritesQuery = useQuery({
    queryKey: ['favorite-ids-by-card'],
    queryFn: getFavoriteIdsByCard,
    enabled: isAuthenticated,
  });

  const favoriteId = favoritesQuery.data?.[cardId];
  const isFavorited = favoriteId !== undefined;

  const addMutation = useMutation({
    mutationFn: () => addFavorite(cardId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['favorite-ids-by-card'] }),
  });

  const removeMutation = useMutation({
    mutationFn: () => removeFavorite(favoriteId as number),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['favorite-ids-by-card'] }),
  });

  if (!isAuthenticated) return null;

  const isPending = addMutation.isPending || removeMutation.isPending;
  const classes = [
    'favorite-button',
    isFavorited && 'favorite-button-active',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      aria-pressed={isFavorited}
      aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      disabled={isPending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isFavorited) {
          removeMutation.mutate();
        } else {
          addMutation.mutate();
        }
      }}
    >
      {isFavorited ? '★' : '☆'}
    </button>
  );
}

export default FavoriteButton;
