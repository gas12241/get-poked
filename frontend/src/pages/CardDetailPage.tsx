import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCard } from '../api/cards';
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

  const cardQuery = useQuery({
    queryKey: ['card', id],
    queryFn: () => getCard(id as string),
    enabled: Boolean(id),
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
          <h1>{card.name}</h1>
          <p>
            {card.set.name} &middot; #{card.number}
          </p>

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

          <p>
            {card.tcgplayer_url && (
              <a href={card.tcgplayer_url} target="_blank" rel="noreferrer">
                View on TCGplayer
              </a>
            )}
            {card.tcgplayer_url && card.cardmarket_url && ' · '}
            {card.cardmarket_url && (
              <a href={card.cardmarket_url} target="_blank" rel="noreferrer">
                View on Cardmarket
              </a>
            )}
          </p>
        </div>
      </div>
    </>
  );
}

export default CardDetailPage;
