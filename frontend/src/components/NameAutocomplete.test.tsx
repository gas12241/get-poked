import { useState } from 'react';
import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import NameAutocomplete from './NameAutocomplete';

// A small controlled wrapper — NameAutocomplete itself takes value/onChange
// from its caller rather than owning its own state.
function ControlledAutocomplete({
  fetchSuggestions,
  onSelect,
}: {
  fetchSuggestions: (search: string) => Promise<string[]>;
  onSelect?: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <NameAutocomplete
      value={value}
      onChange={(next) => {
        setValue(next);
        onSelect?.(next);
      }}
      fetchSuggestions={fetchSuggestions}
      ariaLabel="Search by name"
    />
  );
}

describe('NameAutocomplete', () => {
  it('does not fetch suggestions until the minimum character count is reached', async () => {
    const fetchSuggestions = vi.fn().mockResolvedValue(['Pikachu']);
    renderWithProviders(
      <ControlledAutocomplete fetchSuggestions={fetchSuggestions} />,
    );

    await userEvent.type(screen.getByLabelText('Search by name'), 'p');

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(fetchSuggestions).not.toHaveBeenCalled();
  });

  it('shows fetched suggestions once enough characters are typed', async () => {
    const fetchSuggestions = vi
      .fn()
      .mockResolvedValue(['Pidgey', 'Pikachu', 'Piplup']);
    renderWithProviders(
      <ControlledAutocomplete fetchSuggestions={fetchSuggestions} />,
    );

    await userEvent.type(screen.getByLabelText('Search by name'), 'pi');

    await waitFor(() => expect(fetchSuggestions).toHaveBeenCalledWith('pi'));
    expect(
      await screen.findByRole('option', { name: 'Piplup' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Pidgey' })).toBeInTheDocument();
  });

  it('selects a suggestion on click, filling the input and closing the dropdown', async () => {
    const fetchSuggestions = vi.fn().mockResolvedValue(['Piplup']);
    const onSelect = vi.fn();
    renderWithProviders(
      <ControlledAutocomplete
        fetchSuggestions={fetchSuggestions}
        onSelect={onSelect}
      />,
    );

    const input = screen.getByLabelText('Search by name');
    await userEvent.type(input, 'pi');
    await userEvent.click(
      await screen.findByRole('option', { name: 'Piplup' }),
    );

    expect(input).toHaveValue('Piplup');
    expect(onSelect).toHaveBeenCalledWith('Piplup');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('does not reopen the dropdown after a suggestion is selected, even though selecting changes the value and would otherwise re-trigger a fetch', async () => {
    // Deliberately resolves to the same match for any search, including
    // "Piplup" itself once selected — the real API would do the same here,
    // since "Piplup" starts with "Piplup".
    const fetchSuggestions = vi.fn().mockResolvedValue(['Piplup']);
    renderWithProviders(
      <ControlledAutocomplete fetchSuggestions={fetchSuggestions} />,
    );

    const input = screen.getByLabelText('Search by name');
    await userEvent.type(input, 'pi');
    await userEvent.click(
      await screen.findByRole('option', { name: 'Piplup' }),
    );
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Past the debounce window the selection's own value change would have
    // re-armed, plus a margin.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('supports keyboard navigation: ArrowDown highlights, Enter selects', async () => {
    const fetchSuggestions = vi.fn().mockResolvedValue(['Pidgey', 'Piplup']);
    renderWithProviders(
      <ControlledAutocomplete fetchSuggestions={fetchSuggestions} />,
    );

    const input = screen.getByLabelText('Search by name');
    await userEvent.type(input, 'pi');
    await screen.findByRole('option', { name: 'Pidgey' });

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Pidgey' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Piplup' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await userEvent.keyboard('{Enter}');
    expect(input).toHaveValue('Piplup');
  });

  it('closes the dropdown on Escape without changing the value', async () => {
    const fetchSuggestions = vi.fn().mockResolvedValue(['Piplup']);
    renderWithProviders(
      <ControlledAutocomplete fetchSuggestions={fetchSuggestions} />,
    );

    const input = screen.getByLabelText('Search by name');
    await userEvent.type(input, 'pi');
    await screen.findByRole('option', { name: 'Piplup' });

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('pi');
  });

  it('lets Enter fall through to submit the form when no suggestion is highlighted', async () => {
    const fetchSuggestions = vi.fn().mockResolvedValue(['Piplup']);
    const handleSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    renderWithProviders(
      <form onSubmit={handleSubmit}>
        <ControlledAutocomplete fetchSuggestions={fetchSuggestions} />
        <button type="submit">Go</button>
      </form>,
    );

    const input = screen.getByLabelText('Search by name');
    await userEvent.type(input, 'pi');
    await screen.findByRole('option', { name: 'Piplup' });

    await userEvent.keyboard('{Enter}');

    expect(handleSubmit).toHaveBeenCalled();
  });
});
