import { t } from 'i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PAGE_SIZE_OPTIONS } from '@/features/automations/lib/utils';

/**
 * Overhaul pagination (all-new UI). Same contract as AutomationsPagination — BLD-164/165/166:
 * page-size select (10/20/50), Previous (disabled on page 0), Next (disabled on last page).
 */
export function OvPagination({
  currentPage,
  totalPages,
  pageSize,
  onPageSizeChange,
  onPrevPage,
  onNextPage,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}) {
  const maxPages = Math.max(totalPages, 1);
  return (
    <div className="mt-6 flex items-center justify-end gap-4 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{t('Rows per page')}</span>
        <Select
          value={String(pageSize)}
          onValueChange={(val) => onPageSizeChange(Number(val))}
        >
          <SelectTrigger className="h-8 w-[72px] rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="tabular-nums text-muted-foreground">
        {t('Page {current} of {total}', {
          current: currentPage + 1,
          total: maxPages,
        })}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="gap-1 rounded-lg"
          onClick={onPrevPage}
          disabled={currentPage === 0}
        >
          <ChevronLeft className="h-4 w-4" />
          {t('Previous')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 rounded-lg"
          onClick={onNextPage}
          disabled={currentPage >= maxPages - 1}
        >
          {t('Next')}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
