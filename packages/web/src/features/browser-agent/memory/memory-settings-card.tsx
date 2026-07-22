import { MemorySettingsResponse } from '@intelblocks/shared';
import { t } from 'i18next';
import { Brain, Info, Lock, Share2, Sparkles } from 'lucide-react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

type MemorySettingsCardProps = {
  settings: MemorySettingsResponse;
  disabled?: boolean;
  onChange: (patch: {
    autoRecall?: boolean;
    autoCapture?: boolean;
    adminVisibilityOptIn?: boolean;
  }) => void;
};

type RowProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (v: boolean) => void;
  id: string;
  children?: React.ReactNode;
};

const SettingRow = ({
  icon,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
  id,
  children,
}: RowProps) => (
  <div className="flex items-start justify-between gap-6 py-4">
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <div className="mt-0.5 shrink-0 rounded-lg bg-muted p-2 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {title}
        </Label>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
        {children}
      </div>
    </div>
    <Switch
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      className="mt-1 shrink-0"
    />
  </div>
);

/**
 * The member's own memory controls.
 *
 * The admin-visibility row is the sensitive one, so the copy is deliberately precise about what the
 * switch does and does not do: it exposes NOTHING on its own — only the facts the member has
 * individually marked shareable, and only while the admin has also unlocked sharing. Facts left
 * private stay private forever. Users cannot make a real choice from a vague label, so the exact
 * rule is stated inline and expanded in the accordion.
 */
export const MemorySettingsCard = ({
  settings,
  disabled,
  onChange,
}: MemorySettingsCardProps) => {
  const sharingUnavailable = !settings.adminVisibilityAvailable;

  return (
    <Card className="divide-y p-5">
      <SettingRow
        id="memory-auto-recall"
        icon={<Brain className="size-4" />}
        title={t('Use my memory to personalise answers')}
        description={t(
          'Your agent recalls relevant facts when you ask something, so you do not have to repeat yourself.',
        )}
        checked={settings.autoRecall}
        disabled={disabled}
        onCheckedChange={(v) => onChange({ autoRecall: v })}
      />

      <SettingRow
        id="memory-auto-capture"
        icon={<Sparkles className="size-4" />}
        title={t('Let my agent save what it learns')}
        description={t(
          'While working on a task, your agent may save durable facts (preferences, projects, contacts). Secrets are never saved.',
        )}
        checked={settings.autoCapture}
        disabled={disabled}
        onCheckedChange={(v) => onChange({ autoCapture: v })}
      />

      <SettingRow
        id="memory-admin-visibility"
        icon={
          sharingUnavailable ? (
            <Lock className="size-4" />
          ) : (
            <Share2 className="size-4" />
          )
        }
        title={t('Allow my admin to see facts I mark as shareable')}
        description={
          sharingUnavailable
            ? t(
                'Your platform admin has not enabled memory sharing, so this does nothing right now.',
              )
            : t(
                'Only the facts you individually mark as shareable. Anything you keep private stays invisible to your admin — always.',
              )
        }
        checked={settings.adminVisibilityOptIn}
        disabled={disabled || sharingUnavailable}
        onCheckedChange={(v) => onChange({ adminVisibilityOptIn: v })}
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {settings.adminVisibilityOptIn && !sharingUnavailable && (
            <Badge
              variant="outline"
              className="gap-1 text-[10px] font-normal text-muted-foreground"
            >
              <Share2 className="size-2.5" />
              {t(
                '{count, plural, =1 {1 fact marked shareable} other {# facts marked shareable}}',
                { count: settings.sharedFactCount },
              )}
            </Badge>
          )}
          {sharingUnavailable && (
            <Badge
              variant="outline"
              className="gap-1 text-[10px] font-normal text-muted-foreground"
            >
              <Lock className="size-2.5" />
              {t('Turned off by your admin')}
            </Badge>
          )}
        </div>

        <Accordion type="single" collapsible className="mt-2">
          <AccordionItem value="how" className="border-none">
            <AccordionTrigger className="justify-start gap-1 py-1 text-[11px] font-normal text-muted-foreground hover:no-underline">
              <Info className="size-3" />
              {t('How is my memory protected?')}
            </AccordionTrigger>
            <AccordionContent className="pb-2 pt-1">
              <ul className="ml-1 list-inside list-disc space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <li>
                  {t(
                    'A fact is only ever visible to your admin when all three are true: your admin turned sharing on, you turned this switch on, and you marked that specific fact as shareable.',
                  )}
                </li>
                <li>
                  {t(
                    'Facts you keep private can never be seen by your admin — turning this switch on does not change that.',
                  )}
                </li>
                <li>
                  {t(
                    'Turning this off hides every shared fact instantly. Your marks are kept, so turning it back on restores exactly what you chose before.',
                  )}
                </li>
                <li>
                  {t(
                    'No one else on your team can ever see your personal memory.',
                  )}
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </SettingRow>
    </Card>
  );
};
