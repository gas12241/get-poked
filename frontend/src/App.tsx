import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout';
import CardListPage from './pages/CardListPage';
import CardDetailPage from './pages/CardDetailPage';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <CardListPage /> },
      { path: '/cards/:id', element: <CardDetailPage /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
