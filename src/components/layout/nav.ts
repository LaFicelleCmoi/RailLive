import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Database,
  Flame,
  Gauge,
  Home,
  LayoutGrid,
  ListOrdered,
  Map as MapIcon,
  MonitorPlay,
  Route as RouteIcon,
  Search,
  Target,
  TrainFront,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: 'live';
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: 'Vue d’ensemble',
    items: [
      { to: '/', label: 'Accueil', icon: Home },
      { to: '/live', label: 'Carte live', icon: MapIcon, badge: 'live' },
    ],
  },
  {
    title: 'Explorer',
    items: [
      { to: '/search', label: 'Recherche & carte', icon: Search },
      { to: '/journeys', label: 'Itinéraires', icon: RouteIcon },
      { to: '/isochrones', label: 'Isochrones', icon: Target },
      { to: '/heatmap', label: 'Heat map', icon: Flame },
    ],
  },
  {
    title: 'Horaires',
    items: [
      { to: '/board', label: 'Départs / arrivées', icon: MonitorPlay, badge: 'live' },
      { to: '/schedules', label: 'Horaires en gare', icon: CalendarClock },
      { to: '/route-schedules', label: 'Grille de ligne', icon: LayoutGrid },
      { to: '/terminus', label: 'Par terminus', icon: ListOrdered },
    ],
  },
  {
    title: 'Trains & trafic',
    items: [
      { to: '/trips', label: 'Circulations', icon: TrainFront },
      { to: '/disruptions', label: 'Perturbations', icon: AlertTriangle },
      { to: '/traffic', label: 'État du trafic', icon: Activity },
      { to: '/equipment', label: 'Équipements', icon: Wrench },
    ],
  },
  {
    title: 'Référentiel & système',
    items: [
      { to: '/catalog/lines', label: 'Catalogue réseau', icon: Database },
      { to: '/status', label: 'Statut des données', icon: Gauge },
    ],
  },
];
