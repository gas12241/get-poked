import { GoogleLogin } from '@react-oauth/google';

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => void;
}

// Renders nothing until VITE_GOOGLE_CLIENT_ID is actually set — a graceful
// no-op before a real Google Cloud OAuth client has been configured, rather
// than an error from the underlying library. Shared by LoginPage and
// SignupPage (Google doesn't really distinguish the two — it's "continue
// with Google" either way) so there's one place wiring this up, and one
// small module for tests to mock instead of the third-party library itself
// (its real button needs a browser, which jsdom can't provide).
function GoogleSignInButton({ onCredential }: GoogleSignInButtonProps) {
  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
    return null;
  }

  return (
    <GoogleLogin
      onSuccess={(response) => {
        if (response.credential) {
          onCredential(response.credential);
        }
      }}
    />
  );
}

export default GoogleSignInButton;
