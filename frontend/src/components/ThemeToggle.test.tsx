import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import ThemeToggle from './ThemeToggle';

function mockSystemPrefersDark(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as MediaQueryList,
  );
}

describe('ThemeToggle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to the system color-scheme preference when nothing is stored', () => {
    mockSystemPrefersDark(true);
    renderWithProviders(<ThemeToggle />);

    expect(
      screen.getByRole('button', { name: 'Switch to light mode' }),
    ).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('toggles the theme and persists the choice', async () => {
    mockSystemPrefersDark(false);
    renderWithProviders(<ThemeToggle />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Switch to dark mode' }),
    );

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(
      screen.getByRole('button', { name: 'Switch to light mode' }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Switch to light mode' }),
    );

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('prefers a stored choice over the system preference', () => {
    mockSystemPrefersDark(true);
    localStorage.setItem('theme', 'light');

    renderWithProviders(<ThemeToggle />);

    expect(
      screen.getByRole('button', { name: 'Switch to dark mode' }),
    ).toBeInTheDocument();
  });
});
