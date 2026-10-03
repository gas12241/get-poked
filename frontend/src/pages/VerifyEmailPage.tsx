import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { resendVerification, verifyEmail } from '../api/auth';
import { errorMessage } from '../lib/apiClient';
import { useAuthStore } from '../store/authStore';
import './pages.css';

function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [resendEmail, setResendEmail] = useState('');

  const verifyQuery = useQuery({
    queryKey: ['verify-email', token],
    queryFn: () => verifyEmail(token),
    enabled: token !== '',
    retry: false,
  });

  useEffect(() => {
    if (verifyQuery.data) {
      useAuthStore.getState().setAccessToken(verifyQuery.data.access);
    }
  }, [verifyQuery.data]);

  const resendMutation = useMutation({
    mutationFn: () => resendVerification(resendEmail),
  });

  if (token === '') {
    return (
      <div className="auth-page">
        <h1>Verify your email</h1>
        <p>This link is missing its verification token.</p>
      </div>
    );
  }

  if (verifyQuery.isLoading) {
    return (
      <div className="auth-page">
        <h1>Verify your email</h1>
        <p>Verifying...</p>
      </div>
    );
  }

  if (verifyQuery.isSuccess) {
    return (
      <div className="auth-page">
        <h1>You&apos;re verified!</h1>
        <p>Your account is confirmed and you&apos;re now logged in.</p>
        <p>
          <Link to="/">Go to the homepage</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h1>Verify your email</h1>
      <p>{errorMessage(verifyQuery.error)}</p>
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          resendMutation.mutate();
        }}
      >
        <label>
          Email
          <input
            type="email"
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
            required
          />
        </label>
        <button
          type="submit"
          disabled={resendMutation.isPending || resendMutation.isSuccess}
        >
          {resendMutation.isSuccess
            ? 'Verification email sent'
            : 'Send a new link'}
        </button>
      </form>
    </div>
  );
}

export default VerifyEmailPage;
