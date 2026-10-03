import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { confirmPasswordReset } from '../api/auth';
import { errorMessage } from '../lib/apiClient';
import { useAuthStore } from '../store/authStore';
import './pages.css';

function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mismatchError, setMismatchError] = useState(false);
  const navigate = useNavigate();

  const resetMutation = useMutation({
    mutationFn: () => confirmPasswordReset(token, password),
    onSuccess: (data) => {
      useAuthStore.getState().setAccessToken(data.access);
      navigate('/');
    },
  });

  if (token === '') {
    return (
      <div className="auth-page">
        <h1>Reset your password</h1>
        <p>This link is missing its reset token.</p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h1>Reset your password</h1>
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (password !== confirmPassword) {
            setMismatchError(true);
            return;
          }
          setMismatchError(false);
          resetMutation.mutate();
        }}
      >
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={resetMutation.isPending}>
          {resetMutation.isPending ? 'Resetting...' : 'Reset password'}
        </button>
      </form>

      {mismatchError && (
        <div className="auth-error">
          <p>Passwords don&apos;t match.</p>
        </div>
      )}
      {resetMutation.isError && (
        <div className="auth-error">
          <p>{errorMessage(resetMutation.error)}</p>
          <Link to="/forgot-password">Request a new reset link</Link>
        </div>
      )}
    </div>
  );
}

export default ResetPasswordPage;
