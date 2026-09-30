import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import ConfirmDialog from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('shows the message and confirm label, and focuses Cancel by default', () => {
    renderWithProviders(
      <ConfirmDialog
        message="Abandon this quiz? Your progress will be lost."
        confirmLabel="Abandon quiz"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Abandon this quiz? Your progress will be lost.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Abandon quiz' }),
    ).toBeInTheDocument();
    // Matches window.confirm()'s own default of cancelling, not confirming,
    // on a stray Enter — the safer default for a destructive action.
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        message="Abandon this quiz?"
        confirmLabel="Abandon quiz"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Abandon quiz' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the cancel button is clicked', async () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        message="Abandon this quiz?"
        confirmLabel="Abandon quiz"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onCancel for a key other than Escape', async () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        message="Abandon this quiz?"
        confirmLabel="Abandon quiz"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await userEvent.keyboard('a');

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when Escape is pressed', async () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        message="Abandon this quiz?"
        confirmLabel="Abandon quiz"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when clicking the backdrop outside the dialog panel', async () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        message="Abandon this quiz?"
        confirmLabel="Abandon quiz"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByRole('alertdialog').parentElement!);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onCancel when clicking inside the dialog panel itself', async () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        message="Abandon this quiz?"
        confirmLabel="Abandon quiz"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByText('Abandon this quiz?'));

    expect(onCancel).not.toHaveBeenCalled();
  });
});
