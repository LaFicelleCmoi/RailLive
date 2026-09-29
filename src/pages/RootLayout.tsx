import { AppShell } from '@/components/layout/AppShell';
import { GlobalSearch } from '@/components/SearchBox/GlobalSearch';

export function RootLayout() {
  return <AppShell topbar={<GlobalSearch />} />;
}
