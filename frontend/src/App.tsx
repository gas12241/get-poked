import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout';
import CardListPage from './pages/CardListPage';
import CardDetailPage from './pages/CardDetailPage';
import QuizPage from './pages/QuizPage';
import HoroscopePage from './pages/HoroscopePage';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <CardListPage /> },
      { path: '/cards/:id', element: <CardDetailPage /> },
      { path: '/quiz', element: <QuizPage /> },
      { path: '/horoscope', element: <HoroscopePage /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
