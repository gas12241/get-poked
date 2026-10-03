import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GoogleSignInButton from './GoogleSignInButton';

// @react-oauth/google's real <GoogleLogin> renders Google's own iframe-based
// button and needs a real browser — stubbed here as a plain button that
// invokes onSuccess with a fake credential, so these tests exercise
// GoogleSignInButton's own logic (the env-var gate, the credential
// extraction) without needing Google's script to load.
vi.mock('@react-oauth/google', () => ({
  GoogleLogin: ({
    onSuccess,
  }: {
    onSuccess: (response: { credential?: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onSuccess({ credential: 'fake-google-credential' })}
    >
      Sign in with Google
    </button>
  ),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GoogleSignInButton', () => {
  it('renders nothing when VITE_GOOGLE_CLIENT_ID is unset', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    const { container } = render(<GoogleSignInButton onCredential={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('calls onCredential with the credential on success', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
    const onCredential = vi.fn();
    render(<GoogleSignInButton onCredential={onCredential} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Sign in with Google' }),
    );

    expect(onCredential).toHaveBeenCalledWith('fake-google-credential');
  });
});
