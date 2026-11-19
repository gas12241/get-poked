import { useId, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  changePassword,
  deleteAccount,
  getProfile,
  logoutRequest,
  removeAvatar,
  requestEmailChange,
  updateProfile,
  uploadAvatar,
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

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Picture + an "upload"/"remove" control. With no picture set, falls back to
// a plain initial-letter circle — generated purely on the frontend (nothing
// to store or serve for the common case of "hasn't uploaded one yet").
function Avatar({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (data) => {
      queryClient.setQueryData(['profile'], data);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const removeMutation = useMutation({
    mutationFn: removeAvatar,
    onSuccess: (data) => queryClient.setQueryData(['profile'], data),
  });

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > MAX_AVATAR_BYTES) {
      setError('Image must be 5MB or smaller.');
      return;
    }
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setError('Please upload a JPEG, PNG, or WebP image.');
      return;
    }
    setError(null);
    uploadMutation.mutate(file);
  }

  const initial = (profile.first_name || profile.username)
    .charAt(0)
    .toUpperCase();
  const isPending = uploadMutation.isPending || removeMutation.isPending;

  return (
    <div className="profile-avatar-section">
      {profile.avatar ? (
        <img src={profile.avatar} alt="" className="profile-avatar-image" />
      ) : (
        <div className="profile-avatar-placeholder" aria-hidden="true">
          {initial}
        </div>
      )}
      <div className="profile-avatar-actions">
        <label className="profile-avatar-upload-button">
          {uploadMutation.isPending ? 'Uploading...' : 'Upload picture'}
          <input
            type="file"
            accept={ALLOWED_AVATAR_TYPES.join(',')}
            onChange={handleFileChange}
            disabled={isPending}
            hidden
          />
        </label>
        {profile.avatar && (
          <button
            type="button"
            onClick={() => removeMutation.mutate()}
            disabled={isPending}
          >
            Remove
          </button>
        )}
      </div>
      {error && (
        <div className="auth-error">
          <p>{error}</p>
        </div>
      )}
    </div>
  );
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

// Unlike ProfileFieldRow's edit/save/cancel dance (built for text fields),
// a checkbox doesn't need a draft state. Turning it on routes through
// ConfirmDialog first — it has a real, immediate side effect (deleting any
// Favorites that are already owned, see docs/decisions.md #084) — while
// turning it off is non-destructive and fires directly, the same way
// Avatar's own removeMutation does above.
function CollectionPreferences({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const [confirmingEnable, setConfirmingEnable] = useState(false);

  const mutation = useMutation({
    mutationFn: (checked: boolean) =>
      updateProfile({ auto_remove_favorite_on_collect: checked }),
    onSuccess: (data) => queryClient.setQueryData(['profile'], data),
  });

  return (
    <>
      <label className="profile-checkbox-row">
        <input
          type="checkbox"
          checked={profile.auto_remove_favorite_on_collect}
          disabled={mutation.isPending}
          onChange={(e) => {
            if (e.target.checked) {
              setConfirmingEnable(true);
            } else {
              mutation.mutate(false);
            }
          }}
        />
        Remove a card from Favorites automatically once you add it to your
        collection
      </label>
      {confirmingEnable && (
        <ConfirmDialog
          message="Turning this on will remove any cards you already own from your Favorites, and do the same automatically for anything you add from now on. Continue?"
          confirmLabel="Turn on"
          onConfirm={() => {
            mutation.mutate(true);
            setConfirmingEnable(false);
          }}
          onCancel={() => setConfirmingEnable(false)}
        />
      )}
    </>
  );
}

function ChangeEmailForm({ profile }: { profile: Profile }) {
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');

  const requestMutation = useMutation({
    mutationFn: () =>
      requestEmailChange(newEmail, currentPassword || undefined),
  });

  if (requestMutation.isSuccess) {
    return (
      <p>
        Check <strong>{newEmail}</strong> for a link to confirm the change.
      </p>
    );
  }

  return (
    <form
      className="auth-form"
      onSubmit={(e) => {
        e.preventDefault();
        requestMutation.mutate();
      }}
    >
      <label>
        New email
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          required
        />
      </label>
      {profile.has_usable_password && (
        <label>
          Password
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>
      )}
      <button type="submit" disabled={requestMutation.isPending}>
        {requestMutation.isPending ? 'Sending...' : 'Change email'}
      </button>
      {requestMutation.isError && (
        <div className="auth-error">
          <p>{errorMessage(requestMutation.error)}</p>
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
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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

  const deleteAccountMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      useAuthStore.getState().clearAccessToken();
      navigate('/');
    },
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
      <h1>Welcome, {profile.first_name || profile.username}</h1>
      <p>{profile.email}</p>
      <p className="auth-switch">
        Member since {formatMemberSince(profile.date_joined)}
      </p>

      <Avatar profile={profile} />

      <h2>Profile</h2>
      <ProfileFields profile={profile} />

      <h2>Collection</h2>
      <CollectionPreferences profile={profile} />

      <h2>Email</h2>
      <ChangeEmailForm profile={profile} />

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

      <button
        type="button"
        className="profile-delete-button"
        onClick={() => setConfirmingDelete(true)}
      >
        Delete account
      </button>
      {confirmingDelete && (
        <ConfirmDialog
          message="Delete your account? You can restore it by logging back in within 30 days — after that it's gone for good."
          confirmLabel="Delete account"
          confirmationPhrase="byebyepokemon"
          onConfirm={() => deleteAccountMutation.mutate()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

export default ProfilePage;
