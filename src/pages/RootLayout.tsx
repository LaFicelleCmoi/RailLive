import { AppShell } from '@/components/layout/AppShell';
import { AlertBanner } from '@/components/layout/AlertBanner';
import { GlobalSearch } from '@/components/SearchBox/GlobalSearch';

export function RootLayout() {
  return <AppShell topbar={<GlobalSearch />} banner={<AlertBanner />} />;
}
