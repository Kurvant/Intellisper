import { t } from 'i18next';
import { SearchX } from 'lucide-react';

import { Button } from '@/components/ui/button';

/** Overhaul no-results state (all-new UI). BLD-174: clear-filters. */
export function OvNoResults({
  onClearFilters,
}: {
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-card/50 px-6 py-16 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-muted">
        <SearchX className="size-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">{t('No results found')}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t(
          "We couldn't find any automations matching your search or filters. Try adjusting your criteria.",
        )}
      </p>
      <Button
        variant="outline"
        className="mt-1 rounded-lg"
        onClick={onClearFilters}
      >
        {t('Clear filters')}
      </Button>
    </div>
  );
}
