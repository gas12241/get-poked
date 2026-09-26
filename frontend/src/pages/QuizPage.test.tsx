import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/renderWithProviders';
import { useQuizStore } from '../store/quizStore';
import { useAuthStore } from '../store/authStore';
import QuizPage from './QuizPage';

beforeEach(() => {
  useQuizStore.setState({ session: null });
  useAuthStore.setState({ accessToken: null });
});

async function startQuiz() {
  renderWithProviders(<QuizPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Guess the Card' }));
  await screen.findByAltText('Card to guess');
}

async function completeOneQuestionQuiz() {
  await startQuiz();
  await userEvent.type(screen.getByLabelText('Your guess'), 'Charizard');
  await userEvent.click(screen.getByRole('button', { name: 'Submit guess' }));
  await screen.findByText('Correct!');
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Quiz complete!');
}

describe('QuizPage', () => {
  it('shows mode selection and starts a quiz for the selected mode', async () => {
    await startQuiz();
    expect(screen.getByText('Question 1 of 1')).toBeInTheDocument();
  });

  it('shows feedback for a guess and advances to the summary', async () => {
    await completeOneQuestionQuiz();
    expect(screen.getByText('Score: 1 / 1')).toBeInTheDocument();
  });

  it('prompts an unauthenticated user to log in instead of offering to save', async () => {
    await completeOneQuestionQuiz();
    expect(screen.getByText('Log in to save your score.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save score' }),
    ).not.toBeInTheDocument();
  });

  it('lets an authenticated user save their score', async () => {
    useAuthStore.setState({ accessToken: 'test-token' });
    await completeOneQuestionQuiz();

    await userEvent.click(screen.getByRole('button', { name: 'Save score' }));

    expect(await screen.findByText('Score saved.')).toBeInTheDocument();
  });

  it('returns to mode selection when a quiz is abandoned', async () => {
    await startQuiz();
    await userEvent.click(screen.getByRole('button', { name: 'Abandon quiz' }));

    expect(
      screen.getByRole('button', { name: 'Guess the Card' }),
    ).toBeInTheDocument();
  });

  it('resumes an in-progress quiz after remounting', async () => {
    const { unmount } = renderWithProviders(<QuizPage />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Guess the Card' }),
    );
    await screen.findByAltText('Card to guess');
    unmount();

    renderWithProviders(<QuizPage />);

    expect(await screen.findByAltText('Card to guess')).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 1')).toBeInTheDocument();
  });
});
