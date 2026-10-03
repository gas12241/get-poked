import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { googleLogin, registerAccount } from '../api/auth';
import { errorMessage } from '../lib/apiClient';
import { useAuthStore } from '../store/authStore';
import GoogleSignInButton from '../components/GoogleSignInButton';
import './pages.css';

function SignupPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mismatchError, setMismatchError] = useState(false);
  const navigate = useNavigate();
  const usernameHintId = useId();

  const registerMutation = useMutation({
    mutationFn: () => registerAccount(email, username, password),
  });

  const googleLoginMutation = useMutation({
    mutationFn: (credential: string) => googleLogin(credential),
    onSuccess: (data) => {
      useAuthStore.getState().setAccessToken(data.access);
      navigate('/');
    },
  });

  if (registerMutation.isSuccess) {
    return (
      <div className="auth-page">
        <h1>Check your email</h1>
        <p>
          We sent a verification link to <strong>{email}</strong>. Click it to
          finish creating your account.
        </p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h1>Sign up</h1>
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (password !== confirmPassword) {
            setMismatchError(true);
            return;
          }
          setMismatchError(false);
          registerMutation.mutate();
        }}
      >
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <div className="auth-field">
          <label>
            Username
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-describedby={usernameHintId}
              required
            />
          </label>
          <span id={usernameHintId} className="auth-hint">
            Letters, numbers, and . + - _ only.
          </span>
        </div>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={registerMutation.isPending}>
          {registerMutation.isPending ? 'Signing up...' : 'Sign up'}
        </button>
      </form>

      <div className="auth-divider">or</div>

      <GoogleSignInButton
        onCredential={(credential) => googleLoginMutation.mutate(credential)}
      />

      {mismatchError && (
        <div className="auth-error">
          <p>Passwords don&apos;t match.</p>
        </div>
      )}
      {registerMutation.isError && (
        <div className="auth-error">
          <p>{errorMessage(registerMutation.error)}</p>
        </div>
      )}
      {googleLoginMutation.isError && (
        <div className="auth-error">
          <p>{errorMessage(googleLoginMutation.error)}</p>
        </div>
      )}

      <p className="auth-switch">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}

export default SignupPage;
