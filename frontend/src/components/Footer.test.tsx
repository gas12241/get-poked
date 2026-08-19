import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Footer from './Footer';

describe('Footer', () => {
  it('renders the non-affiliation disclaimer', () => {
    render(<Footer />);

    expect(screen.getByText(/unofficial fan project/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /not affiliated with or endorsed by The Pokémon Company/i,
      ),
    ).toBeInTheDocument();
  });
});
