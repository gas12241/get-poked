import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  changePassword,
  getProfile,
  updateProfile,
  type Profile,
} from '../api/auth';
import { errorMessage } from '../lib/apiClient';
import { useIsAuthenticated } from '../store/authStore';
import './pages.css';

function formatMemberSince(dateJoined: string): string {
  return new Date(dateJoined).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
  });
}

function NameForm({ profile }: { profile: Profile }) {
  const [firstName, setFirstName] = useState(profile.first_name);
  const [lastName, setLastName] = useState(profile.last_name);
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: () =>
      updateProfile({ first_name: firstName, last_name: lastName }),
    onSuccess: (data) => {
      queryClient.setQueryData(['profile'], data);
    },
  });

  return (
    <form
      className="auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        updateMutation.mutate();
      }}
    >
      <label>
        First name
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
      </label>
      <label>
        Last name
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </label>
      <button type="submit" disabled={updateMutation.isPending}>
        {updateMutation.isPending ? 'Saving...' : 'Save'}
      </button>
      {updateMutation.isSuccess && <p>Saved.</p>}
      {updateMutation.isError && (
        <div className="auth-error">
          <p>{errorMessage(updateMutation.error)}</p>
        </div>
      )}
    </form>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mismatchError, setMismatchError] = useState(false);

  const changePasswordMutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
  });

  return (
    <form
      className="auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
          setMismatchError(true);
          return;
        }
        setMismatchError(false);
        changePasswordMutation.mutate();
      }}
    >
      <label>
        Current password
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </label>
      <label>
        New password
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
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
      <button type="submit" disabled={changePasswordMutation.isPending}>
        {changePasswordMutation.isPending ? 'Changing...' : 'Change password'}
      </button>
      {changePasswordMutation.isSuccess && <p>Password changed.</p>}
      {mismatchError && (
        <div className="auth-error">
          <p>Passwords don&apos;t match.</p>
        </div>
      )}
      {changePasswordMutation.isError && (
        <div className="auth-error">
          <p>{errorMessage(changePasswordMutation.error)}</p>
        </div>
      )}
    </form>
  );
}

function ProfilePage() {
  const isAuthenticated = useIsAuthenticated();

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="auth-page">
        <h1>Your profile</h1>
        <p>
          <Link to="/login">Log in</Link> to view your profile.
        </p>
      </div>
    );
  }

  if (profileQuery.isLoading) {
    return (
      <div className="auth-page">
        <h1>Your profile</h1>
        <p>Loading...</p>
      </div>
    );
  }

  if (!profileQuery.data) {
    return null;
  }

  const profile = profileQuery.data;

  return (
    <div className="auth-page">
      <h1>Your profile</h1>
      <p>{profile.email}</p>
      <p className="auth-switch">
        Member since {formatMemberSince(profile.date_joined)}
      </p>

      <h2>Name</h2>
      <NameForm profile={profile} />

      <h2>Password</h2>
      {profile.has_usable_password ? (
        <ChangePasswordForm />
      ) : (
        <p>
          You signed in with Google, so there&apos;s no password on this account
          yet. <Link to="/forgot-password">Set a password</Link> to also enable
          email/password login.
        </p>
      )}
    </div>
  );
}

export default ProfilePage;
