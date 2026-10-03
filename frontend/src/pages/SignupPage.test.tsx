import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test/renderWithProviders';
import SignupPage from './SignupPage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function fillForm(
  email: string,
  password: string,
  confirmPassword: string,
) {
  await userEvent.type(screen.getByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.type(
    screen.getByLabelText('Confirm password'),
    confirmPassword,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
}

describe('SignupPage', () => {
  it('shows a check-your-email message on success, with no auto-login', async () => {
    renderWithProviders(<SignupPage />);
    await fillForm(
      'new@example.com',
      'a-strong-passw0rd!',
      'a-strong-passw0rd!',
    );

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
  });

  it('rejects mismatched passwords without calling the API', async () => {
    let requested = false;
    server.use(
      http.post(`${BASE_URL}/api/v1/register/`, () => {
        requested = true;
        return HttpResponse.json({ email: 'new@example.com' }, { status: 201 });
      }),
    );

    renderWithProviders(<SignupPage />);
    await fillForm('new@example.com', 'a-strong-passw0rd!', 'different!');

    expect(
      await screen.findByText("Passwords don't match."),
    ).toBeInTheDocument();
    expect(requested).toBe(false);
  });

  it('shows the backend error message on failure (e.g. duplicate email)', async () => {
    server.use(
      http.post(`${BASE_URL}/api/v1/register/`, () => {
        return HttpResponse.json(
          { email: ['This field must be unique.'] },
          { status: 400 },
        );
      }),
    );

    renderWithProviders(<SignupPage />);
    await fillForm(
      'existing@example.com',
      'a-strong-passw0rd!',
      'a-strong-passw0rd!',
    );

    expect(
      await screen.findByText('This field must be unique.'),
    ).toBeInTheDocument();
  });

  it('links to the login page', () => {
    renderWithProviders(<SignupPage />);

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});
