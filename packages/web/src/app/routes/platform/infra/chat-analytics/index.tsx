import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { useMemo, useState } from 'react';

import { DashboardPageHeader } from '@/app/components/dashboard-page-header';
import { FormattedDate } from '@/components/custom/formatted-date';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  chatAnalyticsApi,
  ConversationListItem,
  UsageGroupBy,
} from '@/features/platform-admin/api/chat-analytics-api';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export default function ChatAnalyticsPage({
  variant = 'default',
}: {
  variant?: 'default' | 'overhaul';
} = {}) {
  const isOverhaul = variant === 'overhaul';
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [groupBy, setGroupBy] = useState<UsageGroupBy>('day');
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);

  const range = useMemo(
    () => ({ from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z` }),
    [from, to],
  );

  const usageQuery = useQuery({
    queryKey: ['chat-analytics-usage', range.from, range.to, groupBy],
    queryFn: () => chatAnalyticsApi.usage({ ...range, groupBy }),
  });

  const byOrgQuery = useQuery({
    queryKey: ['chat-analytics-by-org', range.from, range.to],
    queryFn: () => chatAnalyticsApi.byOrg({ ...range, limit: 50 }),
  });

  const conversationsQuery = useQuery({
    queryKey: ['chat-analytics-conversations'],
    queryFn: () => chatAnalyticsApi.conversations({ limit: 50 }),
  });

  const funnelQuery = useQuery({
    queryKey: ['chat-analytics-funnel'],
    queryFn: () => chatAnalyticsApi.rolloutFunnel(),
  });

  const usage = usageQuery.data;

  return (
    <div className="flex flex-col gap-4 w-full">
      {!isOverhaul && (
        <DashboardPageHeader
          title={t('Chat Analytics')}
          description={t(
            'Internal usage, billing and ops metrics for AI chat.',
          )}
        />
      )}

      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t('From')}</span>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t('To')}</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-40"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label={t('Total messages')}
          value={usage?.totalMessages ?? 0}
        />
        <StatCard label={t('Tool calls')} value={usage?.totalToolCalls ?? 0} />
        <StatCard label={t('Active users')} value={usage?.distinctUsers ?? 0} />
        <StatCard
          label={t('Active conversations')}
          value={usage?.distinctConversations ?? 0}
        />
      </div>

      {funnelQuery.data && funnelQuery.data.cap > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('Rollout funnel')}</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-6 text-sm">
            <span>
              {t('Landed')}: <b>{funnelQuery.data.landed}</b>
            </span>
            <span>
              {t('Chatted')}: <b>{funnelQuery.data.chatted}</b>
            </span>
            <span>
              {t('Cap')}: <b>{funnelQuery.data.cap}</b>
            </span>
            <span>
              {funnelQuery.data.closed ? (
                <Badge variant="destructive">{t('Closed')}</Badge>
              ) : (
                <Badge variant="outline">{t('Open')}</Badge>
              )}
            </span>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="usage">
        <TabsList>
          <TabsTrigger value="usage">{t('Usage')}</TabsTrigger>
          <TabsTrigger value="by-org">{t('By Organization')}</TabsTrigger>
          <TabsTrigger value="conversations">{t('Conversations')}</TabsTrigger>
        </TabsList>

        <TabsContent value="usage">
          <div className="flex gap-2 mb-3">
            {(['day', 'platform', 'provider', 'model'] as UsageGroupBy[]).map(
              (option) => (
                <Badge
                  key={option}
                  variant={groupBy === option ? 'default' : 'outline'}
                  className="cursor-pointer capitalize"
                  onClick={() => setGroupBy(option)}
                >
                  {option}
                </Badge>
              ),
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="capitalize">{groupBy}</TableHead>
                <TableHead>{t('Messages')}</TableHead>
                <TableHead>{t('Tool calls')}</TableHead>
                <TableHead>{t('Users')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usageQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              )}
              {usage?.series.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium">{row.key}</TableCell>
                  <TableCell>{row.messages}</TableCell>
                  <TableCell>{row.toolCalls}</TableCell>
                  <TableCell>{row.users}</TableCell>
                </TableRow>
              ))}
              {usage && usage.series.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground"
                  >
                    {t('No data for this range.')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="by-org">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Organization')}</TableHead>
                <TableHead>{t('License')}</TableHead>
                <TableHead>{t('Messages')}</TableHead>
                <TableHead>{t('Tool calls')}</TableHead>
                <TableHead>{t('Users')}</TableHead>
                <TableHead>{t('Last activity')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byOrgQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              )}
              {byOrgQuery.data?.data.map((row) => (
                <TableRow key={row.platformId}>
                  <TableCell className="font-medium">
                    {row.platformName ?? row.platformId}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.licenseKey ? (
                      <Badge variant="outline">{t('Licensed')}</Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>{row.messages}</TableCell>
                  <TableCell>{row.toolCalls}</TableCell>
                  <TableCell>{row.distinctUsers}</TableCell>
                  <TableCell>
                    {row.lastActivityAt ? (
                      <FormattedDate date={new Date(row.lastActivityAt)} />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {byOrgQuery.data && byOrgQuery.data.data.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    {t('No data for this range.')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="conversations">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Title')}</TableHead>
                <TableHead>{t('Model')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead>{t('Messages')}</TableHead>
                <TableHead>{t('Updated')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversationsQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              )}
              {conversationsQuery.data?.data.map(
                (row: ConversationListItem) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedConversationId(row.id)}
                  >
                    <TableCell className="font-medium">
                      {row.title ?? t('(untitled)')}
                    </TableCell>
                    <TableCell>{row.modelName ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.status}</Badge>
                    </TableCell>
                    <TableCell>{row.messageCount}</TableCell>
                    <TableCell>
                      <FormattedDate date={new Date(row.updated)} />
                    </TableCell>
                  </TableRow>
                ),
              )}
              {conversationsQuery.data &&
                conversationsQuery.data.data.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      {t('No conversations.')}
                    </TableCell>
                  </TableRow>
                )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      <ConversationDetailSheet
        conversationId={selectedConversationId}
        onClose={() => setSelectedConversationId(null)}
      />
    </div>
  );
}

function ConversationDetailSheet({
  conversationId,
  onClose,
}: {
  conversationId: string | null;
  onClose: () => void;
}) {
  const detailQuery = useQuery({
    queryKey: ['chat-analytics-conversation', conversationId],
    queryFn: () =>
      chatAnalyticsApi.conversationDetail(conversationId as string),
    enabled: !!conversationId,
  });

  return (
    <Sheet open={!!conversationId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[540px] sm:max-w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {detailQuery.data?.title ?? t('Conversation')}
          </SheetTitle>
        </SheetHeader>
        {detailQuery.isLoading && <Skeleton className="h-40 w-full mt-4" />}
        {detailQuery.data && (
          <div className="flex flex-col gap-3 mt-4">
            <div className="text-xs text-muted-foreground">
              {t('Model')}: {detailQuery.data.modelName ?? '—'} · {t('Status')}:{' '}
              {detailQuery.data.status} · {detailQuery.data.messages.length}{' '}
              {t('messages')}
            </div>
            {detailQuery.data.messages.map((message, index) => (
              <div
                key={index}
                className="rounded-md border p-3 text-sm whitespace-pre-wrap"
              >
                <div className="text-xs font-semibold text-muted-foreground mb-1 uppercase">
                  {message.role}
                </div>
                {message.parts
                  .filter(
                    (part) =>
                      part['type'] === 'text' &&
                      typeof part['text'] === 'string',
                  )
                  .map((part, partIndex) => (
                    <div key={partIndex}>{part['text'] as string}</div>
                  ))}
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
