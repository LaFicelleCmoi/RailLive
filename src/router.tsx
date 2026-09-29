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
      // Module 2 · Itinéraires
      { path: 'journeys', lazy: page(() => import('./pages/Journeys')) },
      { path: 'isochrones', handle: FULL, lazy: page(() => import('./pages/Isochrones')) },
      { path: 'heatmap', handle: FULL, lazy: page(() => import('./pages/HeatMap')) },
      // Modules 4 & 5 · Trains et carte live
      { path: 'train/:id', lazy: page(() => import('./pages/Train')) },
      { path: 'trips', lazy: page(() => import('./pages/Trips')) },
      { path: 'live', handle: FULL, lazy: page(() => import('./pages/LiveMap')) },
      // Module 6 · Perturbations
      { path: 'disruptions', lazy: page(() => import('./pages/Disruptions')) },
      { path: 'traffic', lazy: page(() => import('./pages/Traffic')) },
      { path: 'equipment', lazy: page(() => import('./pages/Equipment')) },
      // Module 3 · Horaires
      { path: 'board', lazy: page(() => import('./pages/Board')) },
      { path: 'schedules', lazy: page(() => import('./pages/Schedules')) },
      { path: 'route-schedules', lazy: page(() => import('./pages/RouteSchedules')) },
      { path: 'terminus', lazy: page(() => import('./pages/Terminus')) },
      { path: '*', lazy: page(() => import('./pages/NotFound')) },
    ],
  },
];

export const router = createBrowserRouter(routes);
