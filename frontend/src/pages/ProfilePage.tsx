import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  changePassword,
  getProfile,
  logoutRequest,
  updateProfile,
  type Profile,
} from '../api/auth';
import { errorMessage } from '../lib/apiClient';
import { useAuthStore, useIsAuthenticated } from '../store/authStore';
import ConfirmDialog from '../components/ConfirmDialog';
import './pages.css';

function formatMemberSince(dateJoined: string): string {
  return new Date(dateJoined).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

type ProfileFieldName = 'username' | 'first_name' | 'last_name';

// One row of "label: value [Edit]", or — when this is the field currently
// being edited — a small inline label+input+Save/Cancel form. Which field
// (if any) is open lives in the parent (ProfileFields below), not here, so
// opening one field closes whichever other one was open — the user
// explicitly didn't want every field editable at once.
function ProfileFieldRow({
  label,
  value,
  fieldName,
  isEditing,
  onStartEdit,
  onStopEdit,
  required,
  hint,
}: {
  label: string;
  value: string;
  fieldName: ProfileFieldName;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  required?: boolean;
  hint?: string;
}) {
  const [draft, setDraft] = useState(value);
  const queryClient = useQueryClient();
  const hintId = useId();

  const updateMutation = useMutation({
    mutationFn: () => updateProfile({ [fieldName]: draft }),
    onSuccess: (data) => {
      queryClient.setQueryData(['profile'], data);
      onStopEdit();
    },
  });

  if (!isEditing) {
    return (
      <div className="profile-field-row">
        <span className="profile-field-label">{label}</span>
        <span className="profile-field-value">{value || '—'}</span>
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            updateMutation.reset();
            onStartEdit();
          }}
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form
      className="profile-field-row profile-field-row-editing"
      onSubmit={(e) => {
        e.preventDefault();
        updateMutation.mutate();
      }}
    >
      <label>
        {label}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-describedby={hint ? hintId : undefined}
          required={required}
        />
      </label>
      {hint && (
        <span id={hintId} className="auth-hint">
          {hint}
        </span>
      )}
      <div className="profile-field-actions">
        <button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onStopEdit}
          disabled={updateMutation.isPending}
        >
          Cancel
        </button>
      </div>
      {updateMutation.isError && (
        <div className="auth-error">
          <p>{errorMessage(updateMutation.error)}</p>
        </div>
      )}
    </form>
  );
}

function ProfileFields({ profile }: { profile: Profile }) {
  const [editingField, setEditingField] = useState<ProfileFieldName | null>(
    null,
  );

  return (
    <div className="profile-fields">
      <ProfileFieldRow
        label="Username"
        fieldName="username"
        value={profile.username}
        isEditing={editingField === 'username'}
        onStartEdit={() => setEditingField('username')}
        onStopEdit={() => setEditingField(null)}
        required
        hint="Letters, numbers, and . + - _ only."
      />
      <ProfileFieldRow
        label="First name"
        fieldName="first_name"
        value={profile.first_name}
        isEditing={editingField === 'first_name'}
        onStartEdit={() => setEditingField('first_name')}
        onStopEdit={() => setEditingField(null)}
      />
      <ProfileFieldRow
        label="Last name"
        fieldName="last_name"
        value={profile.last_name}
        isEditing={editingField === 'last_name'}
        onStartEdit={() => setEditingField('last_name')}
        onStopEdit={() => setEditingField(null)}
      />
    </div>
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
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const navigate = useNavigate();

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
    enabled: isAuthenticated,
  });

  const handleLogout = () => {
    // Best-effort — the access token is cleared client-side either way, so a
    // failed request (already-expired cookie, network hiccup) doesn't leave
    // the user stuck looking logged in.
    logoutRequest().finally(() => {
      useAuthStore.getState().clearAccessToken();
      navigate('/');
    });
  };

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
      <h1>Welcome, {profile.first_name || profile.username}</h1>
      <p>{profile.email}</p>
      <p className="auth-switch">
        Member since {formatMemberSince(profile.date_joined)}
      </p>

      <h2>Profile</h2>
      <ProfileFields profile={profile} />

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

      <button
        type="button"
        className="profile-logout-button"
        onClick={() => setConfirmingLogout(true)}
      >
        Log out
      </button>
      {confirmingLogout && (
        <ConfirmDialog
          message="Log out of your account?"
          confirmLabel="Log out"
          onConfirm={handleLogout}
          onCancel={() => setConfirmingLogout(false)}
        />
      )}
    </div>
  );
}

export default ProfilePage;
