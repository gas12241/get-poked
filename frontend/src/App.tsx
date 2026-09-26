import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout';
import CardListPage from './pages/CardListPage';
import CardDetailPage from './pages/CardDetailPage';
import QuizPage from './pages/QuizPage';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <CardListPage /> },
      { path: '/cards/:id', element: <CardDetailPage /> },
      { path: '/quiz', element: <QuizPage /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
