import { t } from 'i18next';
import { Search } from 'lucide-react';
import { ReactNode, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type OvFilterOption = {
  value: string;
  label: string;
  icon?: ReactNode;
};

/**
 * Overhaul multi-select filter (all-new UI). Same behavior as MultiSelectFilter — trigger with
 * label + selected badges, optional search, option rows w/ checkbox + icon, clear-all. Fixes the
 * original's untranslated "{n} selected" overflow badge (now t()-wrapped).
 */
export function OvMultiSelect({
  label,
  icon,
  options,
  selectedValues,
  onChange,
  searchable = false,
}: {
  label: string;
  icon: ReactNode;
  options: OvFilterOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const toggleValue = (value: string) => {
    onChange(
      selectedValues.includes(value)
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value],
    );
  };

  const selectedLabels = options
    .filter((o) => selectedValues.includes(o.value))
    .map((o) => o.label);

  const filteredOptions =
    searchable && search
      ? options.filter((o) =>
          o.label.toLowerCase().includes(search.toLowerCase()),
        )
      : options;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-2 rounded-lg border-dashed',
            selectedValues.length > 0 && 'border-solid border-primary/40',
          )}
        >
          <span className="text-muted-foreground">{icon}</span>
          {label}
          {selectedValues.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-4 w-px bg-border" aria-hidden />
              {selectedValues.length <= 2 ? (
                selectedLabels.map((l) => (
                  <Badge
                    key={l}
                    variant="secondary"
                    className="max-w-[12vw] truncate rounded font-normal"
                  >
                    {l}
                  </Badge>
                ))
              ) : (
                <Badge variant="secondary" className="rounded font-normal">
                  {t('{count} selected', { count: selectedValues.length })}
                </Badge>
              )}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 rounded-xl p-1.5">
        {searchable && (
          <div className="relative mb-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Search...')}
              className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto">
          {filteredOptions.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t('No results')}
            </p>
          ) : (
            filteredOptions.map((option) => (
              // role="option" div, NOT a <button>: the inner <Checkbox> is a Radix
              // <button role="checkbox">, and a <button> may not nest inside a <button>
              // (invalid DOM + hydration error).
              <div
                key={option.value}
                role="option"
                aria-selected={selectedValues.includes(option.value)}
                tabIndex={0}
                onClick={() => toggleValue(option.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleValue(option.value);
                  }
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={selectedValues.includes(option.value)}
                  onCheckedChange={() => toggleValue(option.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="pointer-events-none"
                />
                {option.icon}
                <span className="truncate">{option.label}</span>
              </div>
            ))
          )}
        </div>
        {selectedValues.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full rounded-lg"
            onClick={() => onChange([])}
          >
            {t('Clear all')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
