import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { requestPasswordReset } from '../api/auth';
import { errorMessage } from '../lib/apiClient';
import './pages.css';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');

  const requestMutation = useMutation({
    mutationFn: () => requestPasswordReset(email),
  });

  if (requestMutation.isSuccess) {
    return (
      <div className="auth-page">
        <h1>Check your email</h1>
        <p>
          If an account exists for <strong>{email}</strong>, we&apos;ve sent a
          link to reset your password.
        </p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h1>Forgot your password?</h1>
      <p>Enter your email and we&apos;ll send you a link to reset it.</p>
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          requestMutation.mutate();
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
        <button type="submit" disabled={requestMutation.isPending}>
          {requestMutation.isPending ? 'Sending...' : 'Send reset link'}
        </button>
      </form>

      {requestMutation.isError && (
        <div className="auth-error">
          <p>{errorMessage(requestMutation.error)}</p>
        </div>
      )}

      <p className="auth-switch">
        Remembered it? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}

export default ForgotPasswordPage;
