import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCard } from '../api/cards';
import { getCollectionEntriesByCard } from '../api/collection';
import CollectionQuickControl from '../components/CollectionQuickControl';
import FavoriteButton from '../components/FavoriteButton';
import { useIsAuthenticated } from '../store/authStore';
import './pages.css';

// Where the user navigated here from, so the back link can read "Back to
// cards" or "Back to Horoscope" rather than always assuming Cards — pages
// that link to a card's detail page pass this via the Link's `state` prop
// (see HoroscopePage.tsx, CardListPage.tsx). Defaults to "cards" when
// absent, preserving the original behavior for any entry point that
// doesn't pass it.
const BACK_LABELS: Record<string, string> = {
  cards: 'Back to cards',
  horoscope: 'Back to Horoscope',
};

function CardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const backLabel = BACK_LABELS[from ?? 'cards'] ?? BACK_LABELS.cards;
  const isAuthenticated = useIsAuthenticated();

  const cardQuery = useQuery({
    queryKey: ['card', id],
    queryFn: () => getCard(id as string),
    enabled: Boolean(id),
  });

  // Same query key CollectionQuickControl itself uses internally — used
  // here purely to render the "Owned ×N" text next to it, which lives
  // outside that component's own render. See docs/decisions.md #082.
  const collectionEntriesQuery = useQuery({
    queryKey: ['collection-entries-by-card'],
    queryFn: getCollectionEntriesByCard,
    enabled: isAuthenticated,
  });

  if (cardQuery.isLoading) return <p>Loading card...</p>;
  if (cardQuery.isError) {
    return <p>Failed to load card: {(cardQuery.error as Error).message}</p>;
  }
  if (!cardQuery.data) return null;

  const card = cardQuery.data;

  return (
    <>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="back-link back-button"
      >
        &larr; {backLabel}
      </button>

      <div className="card-detail">
        {card.image_large ? (
          <img src={card.image_large} alt={card.name} />
        ) : (
          // Neither image_small nor image_large has a working URL for
          // this card — see docs/decisions.md #039.
          <div className="no-image-placeholder no-image-placeholder-detail">
            No image available
          </div>
        )}

        <div className="info">
          <h1>
            <FavoriteButton
              cardId={card.id}
              className="favorite-button-large"
            />{' '}
            {card.name}
          </h1>
          <p>
            {card.set.name} &middot; #{card.number}
          </p>

          {isAuthenticated && (
            <div className="collection-quick-row">
              <CollectionQuickControl
                cardId={card.id}
                className="collection-quick-control-large"
              />
              <span className="card-owned-badge">
                Owned ×{collectionEntriesQuery.data?.[card.id]?.quantity ?? 0}
              </span>
            </div>
          )}

          <dl>
            <dt>Supertype</dt>
            <dd>{card.supertype}</dd>
            <dt>Rarity</dt>
            <dd>{card.rarity || '—'}</dd>
            {card.hp && (
              <>
                <dt>HP</dt>
                <dd>{card.hp}</dd>
              </>
            )}
            <dt>Types</dt>
            <dd>{card.types.map((t) => t.name).join(', ') || '—'}</dd>
            <dt>Subtypes</dt>
            <dd>{card.subtypes.join(', ') || '—'}</dd>
            {card.artist && (
              <>
                <dt>Artist</dt>
                <dd>{card.artist}</dd>
              </>
            )}
            {card.evolves_from && (
              <>
                <dt>Evolves from</dt>
                <dd>{card.evolves_from}</dd>
              </>
            )}
            {card.evolves_to.length > 0 && (
              <>
                <dt>Evolves to</dt>
                <dd>{card.evolves_to.join(', ')}</dd>
              </>
            )}
          </dl>

          {card.attacks.length > 0 && (
            <>
              <h2>Attacks</h2>
              <ul className="attack-list">
                {card.attacks.map((attack) => (
                  <li key={attack.name}>
                    <strong>{attack.name}</strong>
                    {attack.damage && ` — ${attack.damage}`}
                    {attack.text && <p>{attack.text}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}

          {card.weaknesses.length > 0 && (
            <>
              <h2>Weaknesses</h2>
              <p>
                {card.weaknesses
                  .map((w) => `${w.type.name} (${w.value})`)
                  .join(', ')}
              </p>
            </>
          )}

          {card.resistances.length > 0 && (
            <>
              <h2>Resistances</h2>
              <p>
                {card.resistances
                  .map((r) => `${r.type.name} (${r.value})`)
                  .join(', ')}
              </p>
            </>
          )}

          <div className="card-external-links">
            {card.tcgplayer_url && (
              <a
                href={card.tcgplayer_url}
                target="_blank"
                rel="noreferrer"
                className="card-external-link"
              >
                <img
                  src="https://www.google.com/s2/favicons?domain=tcgplayer.com&sz=64"
                  alt=""
                />
                View on TCGplayer
              </a>
            )}
            {card.cardmarket_url && (
              <a
                href={card.cardmarket_url}
                target="_blank"
                rel="noreferrer"
                className="card-external-link"
              >
                <img
                  src="https://www.google.com/s2/favicons?domain=cardmarket.com&sz=64"
                  alt=""
                />
                View on Cardmarket
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default CardDetailPage;
