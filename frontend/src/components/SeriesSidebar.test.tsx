import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import SeriesSidebar from './SeriesSidebar';
import type { Set as CardSet } from '../api/cards';

const baseSet = (overrides: Partial<CardSet>): CardSet => ({
  id: 1,
  tcg_id: 'x',
  name: 'Set',
  series: 'Series',
  release_date: null,
  language: 'en',
  image_symbol: '',
  image_logo: '',
  ...overrides,
});

const SETS: CardSet[] = [
  baseSet({
    id: 1,
    name: 'Pitch Black',
    series: 'Mega Evolution',
    release_date: '2025-06-01',
  }),
  baseSet({
    id: 2,
    name: 'Chaos Rising',
    series: 'Mega Evolution',
    release_date: '2025-09-01',
  }),
  baseSet({ id: 3, name: 'Base', series: 'Base', release_date: '1999-01-09' }),
];

describe('SeriesSidebar', () => {
  it('groups sets under their series, newest series and newest set first', () => {
    renderWithProviders(
      <SeriesSidebar sets={SETS} selectedSetId="" onSelect={() => {}} />,
    );

    const seriesHeaders = screen
      .getAllByRole('button')
      .map((el) => el.textContent)
      .filter((text) => text === 'Mega Evolution' || text === 'Base');

    expect(seriesHeaders).toEqual(['Mega Evolution', 'Base']);
  });

  it('lists sets within a series newest release first once expanded', async () => {
    renderWithProviders(
      <SeriesSidebar sets={SETS} selectedSetId="" onSelect={() => {}} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Expand Mega Evolution' }),
    );

    const setButtons = screen
      .getAllByRole('button')
      .map((el) => el.textContent)
      .filter((text) => text === 'Pitch Black' || text === 'Chaos Rising');

    expect(setButtons).toEqual(['Chaos Rising', 'Pitch Black']);
  });

  it('calls onSelect with the set id when a set is clicked', async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <SeriesSidebar sets={SETS} selectedSetId="" onSelect={onSelect} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Expand Mega Evolution' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Chaos Rising' }));

    expect(onSelect).toHaveBeenCalledWith('2');
  });

  it('calls onSelect with an empty string when "All Sets" is clicked', async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <SeriesSidebar sets={SETS} selectedSetId="3" onSelect={onSelect} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'All Sets' }));

    expect(onSelect).toHaveBeenCalledWith('');
  });

  it('starts with the series containing the selected set already expanded', () => {
    renderWithProviders(
      <SeriesSidebar sets={SETS} selectedSetId="2" onSelect={() => {}} />,
    );

    expect(
      screen.getByRole('button', { name: 'Collapse Mega Evolution' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Chaos Rising' }),
    ).not.toHaveAttribute('tabindex', '-1');
  });

  it('keeps a collapsed series in the DOM (for the slide animation) but out of the tab order and accessibility tree', () => {
    renderWithProviders(
      <SeriesSidebar sets={SETS} selectedSetId="" onSelect={() => {}} />,
    );

    expect(
      screen.queryByRole('button', { name: 'Chaos Rising' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Chaos Rising', hidden: true }),
    ).toHaveAttribute('tabindex', '-1');
  });

  it('marks the selected set as active', () => {
    renderWithProviders(
      <SeriesSidebar sets={SETS} selectedSetId="2" onSelect={() => {}} />,
    );

    const activeSet = within(
      screen.getByRole('button', { name: 'Chaos Rising' }).closest('ul')!,
    ).getByRole('button', { name: 'Chaos Rising' });
    expect(activeSet).toHaveClass('active');
  });
});
