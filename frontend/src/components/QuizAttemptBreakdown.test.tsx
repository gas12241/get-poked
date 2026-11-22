import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import QuizAttemptBreakdown from './QuizAttemptBreakdown';
import type { QuizAttemptAnswerDetail } from '../api/quiz';

function makeCardAnswer(
  overrides: Partial<QuizAttemptAnswerDetail> = {},
): QuizAttemptAnswerDetail {
  return {
    card: {
      id: 1,
      name: 'Charizard',
      number: '4',
      rarity: 'Rare Holo',
      supertype: 'Pokémon',
      image_small: 'https://example.com/small.png',
      image_large: 'https://example.com/large.png',
      artist: 'Ken Sugimori',
      set: { id: 1, name: 'Base', series: 'Base', release_date: '1999-01-09' },
      types: [{ id: 1, name: 'Fire' }],
    },
    set: null,
    guess: 'Charizard',
    correct_answer: 'Charizard',
    is_correct: true,
    time_taken_seconds: 3.5,
    order: 0,
    ...overrides,
  };
}

describe('QuizAttemptBreakdown', () => {
  it('makes the whole tile a link to the card detail page, not just its image', () => {
    renderWithProviders(<QuizAttemptBreakdown answers={[makeCardAnswer()]} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/cards/1');
    // The guess/answer/time text and the image both sit inside the same
    // link, not just the image — the whole tile is the click target.
    expect(
      within(link).getByRole('img', { name: 'Charizard' }),
    ).toBeInTheDocument();
    expect(within(link).getByText('Your guess: Charizard')).toBeInTheDocument();
  });

  it('shows a set-based row as a plain icon with no link', () => {
    renderWithProviders(
      <QuizAttemptBreakdown
        answers={[
          makeCardAnswer({
            card: null,
            set: {
              id: 7,
              tcg_id: 'swsh1',
              name: 'Sword & Shield',
              series: 'Sword & Shield',
              release_date: '2020-02-07',
              language: 'en',
              image_symbol: 'https://example.com/swsh1-symbol.png',
              image_logo: 'https://example.com/swsh1-logo.png',
            },
            guess: 'Sword & Shield',
            correct_answer: 'Sword & Shield',
          }),
        ]}
      />,
    );

    expect(screen.getByRole('img', { name: 'Sword & Shield' })).toHaveAttribute(
      'src',
      'https://example.com/swsh1-symbol.png',
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Your guess: Sword & Shield')).toBeInTheDocument();
    expect(
      screen.getByText('Correct answer: Sword & Shield'),
    ).toBeInTheDocument();
  });
});
