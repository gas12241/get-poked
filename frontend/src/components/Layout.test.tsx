import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import Layout from './Layout';

describe('Layout', () => {
  it('renders the matched child route alongside the disclaimer footer', () => {
    renderWithProviders(
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<p>Page content</p>} />
        </Route>
      </Routes>,
    );

    expect(screen.getByText('Page content')).toBeInTheDocument();
    expect(screen.getByText(/unofficial fan project/i)).toBeInTheDocument();
  });
});
