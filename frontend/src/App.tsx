import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import Layout from './components/Layout';
import CardListPage from './pages/CardListPage';
import CardDetailPage from './pages/CardDetailPage';
import QuizPage from './pages/QuizPage';
import HoroscopePage from './pages/HoroscopePage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { refreshAccessToken } from './lib/apiClient';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <CardListPage /> },
      { path: '/cards/:id', element: <CardDetailPage /> },
      { path: '/quiz', element: <QuizPage /> },
      { path: '/horoscope', element: <HoroscopePage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      { path: '/verify-email', element: <VerifyEmailPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
    ],
  },
]);

function App() {
  // The access token is deliberately never persisted (see authStore.ts), so
  // every page load starts logged out until this silently restores a session
  // from the httpOnly refresh cookie, if one is still valid.
  useEffect(() => {
    refreshAccessToken();
  }, []);

  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <RouterProvider router={router} />
    </GoogleOAuthProvider>
  );
}

export default App;
