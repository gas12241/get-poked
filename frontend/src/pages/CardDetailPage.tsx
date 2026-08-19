import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCard } from '../api/cards';
import './pages.css';

function CardDetailPage() {
  const { id } = useParams<{ id: string }>();

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
      <Link to="/" className="back-link">
        &larr; Back to cards
      </Link>

      <div className="card-detail">
        <img src={card.image_large} alt={card.name} />

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
