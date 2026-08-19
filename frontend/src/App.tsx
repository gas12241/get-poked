import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import CardListPage from './pages/CardListPage';
import CardDetailPage from './pages/CardDetailPage';

const router = createBrowserRouter([
  { path: '/', element: <CardListPage /> },
  { path: '/cards/:id', element: <CardDetailPage /> },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
