import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { RootLayout } from './pages/RootLayout';
import { RouteError } from './pages/RouteError';

/** Chargement paresseux : chaque page est un chunk séparé (MapLibre, Recharts…). */
const page = (loader: () => Promise<{ default: React.ComponentType }>) => async () => {
  const mod = await loader();
  return { Component: mod.default };
};

const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: page(() => import('./pages/Home')) },
      { path: '*', lazy: page(() => import('./pages/NotFound')) },
    ],
  },
];

export const router = createBrowserRouter(routes);
