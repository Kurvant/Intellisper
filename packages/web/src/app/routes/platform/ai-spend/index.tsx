import { AiSpendRow } from '@intelblocks/shared';
import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { aiSpendApi } from '@/features/ai-gateway/api/ai-spend-api';

/**
 * AI Gateway — the spend dashboard.
 *
 * This is the surface the whole gateway exists for: what our AI actually costs, per product surface
 * and per model, next to what we charged for it. Before this, AI spend was a single opaque number
 * read back from the provider's key ledger, and any inference that did not route through that key
 * (Anthropic-direct, OpenAI-direct, Bedrock, Azure, Gemini) contributed exactly nothing to it.
 */

/** Money, at a precision where a fraction of a cent is still visible. */
function usd(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  // Sub-cent amounts are the norm for a single call, so don't round them into invisibility.
  const digits = Math.abs(n) > 0 && Math.abs(n) < 1 ? 4 : 2;
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function compact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

/** Margin is the number the business steers on, so colour it: red means we are selling below cost. */
function MarginCell({ value }: { value: number }) {
  const negative = value < 0;
  return (
    <span className={negative ? 'text-destructive font-medium' : ''}>
      {usd(value)}
    </span>
  );
}

function SpendTable({
  rows,
  keyLabel,
}: {
  rows: AiSpendRow[];
  keyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        {t('No AI usage recorded in this window.')}
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{keyLabel}</TableHead>
          <TableHead className="text-right">{t('Calls')}</TableHead>
          <TableHead className="text-right">{t('Tokens')}</TableHead>
          <TableHead className="text-right">{t('Cost')}</TableHead>
          <TableHead className="text-right">{t('Revenue')}</TableHead>
          <TableHead className="text-right">{t('Margin')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="font-medium">
              {r.key}
              {/* An unpriced call means we could not determine its cost. Surfacing it inline stops a
                  reader from mistaking an incomplete price table for genuine margin. */}
              {r.unpricedCalls > 0 && (
                <Badge variant="outline" className="ml-2">
                  {t('{{n}} unpriced', { n: r.unpricedCalls })}
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-right">{compact(r.calls)}</TableCell>
            <TableCell className="text-right">
              {compact(r.totalTokens)}
            </TableCell>
            <TableCell className="text-right">{usd(r.costUsd)}</TableCell>
            <TableCell className="text-right">{usd(r.revenueUsd)}</TableCell>
            <TableCell className="text-right">
              <MarginCell value={r.marginUsd} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Metric({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={danger ? 'text-destructive text-2xl' : 'text-2xl'}
        >
          {value}
        </CardTitle>
      </CardHeader>
      {hint && (
        <CardContent className="text-muted-foreground pt-0 text-xs">
          {hint}
        </CardContent>
      )}
    </Card>
  );
}

export default function AiSpendPage({
  variant = 'default',
}: {
  variant?: 'default' | 'overhaul';
} = {}) {
  const isOverhaul = variant === 'overhaul';
  const [days, setDays] = useState('30');

  const { data, isLoading } = useQuery({
    queryKey: ['ai-spend', days],
    queryFn: () => aiSpendApi.spend(Number(days)),
    staleTime: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex w-full flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const marginPct =
    data.totalRevenueUsd > 0
      ? (data.totalMarginUsd / data.totalRevenueUsd) * 100
      : 0;

  return (
    <div className="flex w-full flex-col gap-6">
      <div
        className={
          isOverhaul
            ? 'flex items-center justify-end'
            : 'flex items-center justify-between'
        }
      >
        {!isOverhaul && (
          <div>
            <h1 className="text-2xl font-semibold">{t('AI Spend')}</h1>
            <p className="text-muted-foreground text-sm">
              {t(
                'What our AI costs, by product surface and model, against what we charged.',
              )}
            </p>
          </div>
        )}
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{t('Last 7 days')}</SelectItem>
            <SelectItem value="30">{t('Last 30 days')}</SelectItem>
            <SelectItem value="90">{t('Last 90 days')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric
          label={t('Cost (what we pay)')}
          value={usd(data.totalCostUsd)}
          hint={t('{{n}} calls', { n: compact(data.totalCalls) })}
        />
        <Metric
          label={t('Revenue (what we charged)')}
          value={usd(data.totalRevenueUsd)}
        />
        <Metric
          label={t('Margin')}
          value={usd(data.totalMarginUsd)}
          hint={
            data.totalRevenueUsd > 0
              ? t('{{p}}% of revenue', { p: marginPct.toFixed(1) })
              : undefined
          }
          danger={data.totalMarginUsd < 0}
        />
        {/* Unpriced volume is shown as a FIRST-CLASS metric, not a footnote. If it is non-zero, the
            margin above is incomplete — and a reader has to be able to see that rather than trust a
            number that quietly booked unmeasurable spend as free. */}
        <Metric
          label={t('Unpriced calls')}
          value={compact(data.unpricedCalls)}
          hint={
            data.unpricedCalls > 0
              ? t('Cost unknown for these — the figures above are incomplete.')
              : t('Every call was priced.')
          }
          danger={data.unpricedCalls > 0}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('By product')}</CardTitle>
          <CardDescription>
            {t(
              'Which surface is burning the budget — the browser agent, Studio chat, or flow blocks.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SpendTable rows={data.byFeature} keyLabel={t('Product')} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('By model')}</CardTitle>
          <CardDescription>
            {t(
              'Where the money goes per model — the basis for tier and routing decisions.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SpendTable rows={data.byModel} keyLabel={t('Model')} />
        </CardContent>
      </Card>
    </div>
  );
}
