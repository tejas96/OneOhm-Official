'use client';

import { cn } from '@oneohm/design-system/web';
import type { CampaignGoal } from '@oneohm/domain';
import { FileText, MessageCircle, Newspaper } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { RadioGroup } from 'radix-ui';

const GOALS = [
  { value: 'chats', icon: MessageCircle },
  { value: 'lead_form', icon: FileText },
  { value: 'post', icon: Newspaper },
] as const satisfies readonly { value: CampaignGoal; icon: unknown }[];

/** Three big tiles, one plain line each. WhatsApp chats is where most people start. */
export function GoalTiles({
  value,
  onChange,
}: {
  readonly value: CampaignGoal;
  readonly onChange: (goal: CampaignGoal) => void;
}) {
  const t = useTranslations('marketing');
  return (
    <RadioGroup.Root
      aria-label={t('goal.label')}
      value={value}
      onValueChange={(next) => onChange(next as CampaignGoal)}
      className="grid gap-2 sm:grid-cols-3"
    >
      {GOALS.map(({ value: goal, icon: Icon }) => {
        const selected = goal === value;
        return (
          <RadioGroup.Item
            key={goal}
            value={goal}
            className={cn(
              'relative flex items-start gap-3 rounded-xl border p-3.5 text-left outline-offset-2 transition-colors sm:flex-col',
              selected
                ? 'border-accent bg-accent-soft'
                : 'border-hairline bg-raised hover:border-rule',
            )}
          >
            {selected && (
              <motion.span
                layoutId="goal-ring"
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-accent"
              />
            )}
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4',
                selected ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-muted',
              )}
            >
              <Icon aria-hidden />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="type-title-md text-ink">{t(`goal.${goal}.title`)}</span>
              <span className="type-body-sm text-ink-muted">{t(`goal.${goal}.line`)}</span>
            </span>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
