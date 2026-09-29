import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { RootLayout } from './pages/RootLayout';
import { RouteError } from './pages/RouteError';
import type { RouteHandle } from './components/layout/AppShell';

/** Chargement paresseux : chaque page est un chunk séparé (MapLibre, Recharts…). */
const page = (loader: () => Promise<{ default: React.ComponentType }>) => async () => {
  const mod = await loader();
  return { Component: mod.default };
};

const FULL: RouteHandle = { fullBleed: true };

const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: page(() => import('./pages/Home')) },
      // Module 1 · Recherche
      { path: 'search', handle: FULL, lazy: page(() => import('./pages/Search')) },
      { path: 'stop-areas/:id', lazy: page(() => import('./pages/StopArea')) },
      { path: '*', lazy: page(() => import('./pages/NotFound')) },
    ],
  },
];

export const router = createBrowserRouter(routes);
