import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { googleLogin, login, resendVerification } from '../api/auth';
import { errorMessage } from '../lib/apiClient';
import { useAuthStore } from '../store/authStore';
import GoogleSignInButton from '../components/GoogleSignInButton';
import './pages.css';

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const loginMutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: (data) => {
      useAuthStore.getState().setAccessToken(data.access);
      navigate('/');
    },
  });

  const googleLoginMutation = useMutation({
    mutationFn: (credential: string) => googleLogin(credential),
    onSuccess: (data) => {
      useAuthStore.getState().setAccessToken(data.access);
      navigate('/');
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => resendVerification(email),
  });

  const message = loginMutation.isError
    ? errorMessage(loginMutation.error)
    : googleLoginMutation.isError
      ? errorMessage(googleLoginMutation.error)
      : null;
  const isUnverified = message?.toLowerCase().includes('verify') ?? false;

  return (
    <div className="auth-page">
      <h1>Log in</h1>
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          loginMutation.mutate();
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
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={loginMutation.isPending}>
          {loginMutation.isPending ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      <GoogleSignInButton
        onCredential={(credential) => googleLoginMutation.mutate(credential)}
      />

      {message && (
        <div className="auth-error">
          <p>{message}</p>
          {isUnverified && (
            <button
              type="button"
              onClick={() => resendMutation.mutate()}
              disabled={resendMutation.isPending || resendMutation.isSuccess}
            >
              {resendMutation.isSuccess
                ? 'Verification email sent'
                : 'Resend verification email'}
            </button>
          )}
        </div>
      )}

      <p className="auth-switch">
        <Link to="/forgot-password">Forgot your password?</Link>
      </p>
      <p className="auth-switch">
        Don&apos;t have an account? <Link to="/signup">Sign up</Link>
      </p>
    </div>
  );
}

export default LoginPage;
