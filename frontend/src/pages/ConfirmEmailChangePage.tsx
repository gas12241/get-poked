import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { confirmEmailChange } from '../api/auth';
import { errorMessage } from '../lib/apiClient';
import './pages.css';

function ConfirmEmailChangePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const queryClient = useQueryClient();

  const confirmQuery = useQuery({
    queryKey: ['confirm-email-change', token],
    queryFn: async () => {
      const result = await confirmEmailChange(token);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      return result;
    },
    enabled: token !== '',
    retry: false,
  });

  if (token === '') {
    return (
      <div className="auth-page">
        <h1>Confirm your new email</h1>
        <p>This link is missing its confirmation token.</p>
      </div>
    );
  }

  if (confirmQuery.isLoading) {
    return (
      <div className="auth-page">
        <h1>Confirm your new email</h1>
        <p>Confirming...</p>
      </div>
    );
  }

  if (confirmQuery.isSuccess) {
    return (
      <div className="auth-page">
        <h1>Email updated</h1>
        <p>Your new email address is confirmed.</p>
        <p className="auth-switch">
          <Link to="/profile">Back to your profile</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h1>Confirm your new email</h1>
      <div className="auth-error">
        <p>{errorMessage(confirmQuery.error)}</p>
      </div>
    </div>
  );
}

export default ConfirmEmailChangePage;
