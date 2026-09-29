import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export function Pagination({ page, total, perPage, onChange }: { page: number; total: number; perPage: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (total <= perPage) return null;
  return (
    <nav className="flex items-center justify-between gap-3 pt-4" aria-label="Pagination">
      <p className="font-mono text-xs text-ink-500">
        {(page * perPage + 1).toLocaleString('fr-FR')}–{Math.min(total, (page + 1) * perPage).toLocaleString('fr-FR')} sur {total.toLocaleString('fr-FR')}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => onChange(page - 1)} icon={<ChevronLeft className="size-4" />}>
          Précédent
        </Button>
        <span className="font-mono text-xs text-ink-400">
          {page + 1} / {pages}
        </span>
        <Button size="sm" variant="ghost" disabled={page + 1 >= pages} onClick={() => onChange(page + 1)}>
          Suivant <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
