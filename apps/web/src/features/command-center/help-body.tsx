'use client';

import { cn, listItemEnter, useCalmMotion } from '@oneohm/design-system/web';
import { Lightbulb, SlidersHorizontal } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export type HelpCard =
  | 'actions'
  | 'healthCard'
  | 'kpis'
  | 'states'
  | 'risks'
  | 'waiting'
  | 'pipeline'
  | 'materials'
  | 'decisions'
  | 'outlook'
  | 'deadlines'
  | 'projects'
  | 'money'
  | 'team';

interface Meaning {
  readonly term: string;
  readonly text: string;
}

const HEADING = 'type-overline uppercase text-ink-faint';

function Block({ index, children }: { readonly index: number; readonly children: ReactNode }) {
  const calm = useCalmMotion();
  const enter = calm ? { initial: false as const } : listItemEnter(index);
  return (
    <motion.section {...enter} className="flex flex-col gap-2.5">
      {children}
    </motion.section>
  );
}

/** The plain-English explainer for one card: what it is, what each value means, how to use it. */
export function HelpBody({ card }: { readonly card: HelpCard }) {
  const t = useTranslations(`commandCenter.help.${card}`);
  const ui = useTranslations('commandCenter.help.ui');
  const means = t.raw('means') as readonly Meaning[];
  const how = t.raw('how') as readonly string[];
  return (
    <div className="flex flex-col gap-6 px-5 py-5 sm:px-6">
      <Block index={0}>
        <h3 className={HEADING}>{ui('means')}</h3>
        <dl className="flex flex-col divide-y divide-hairline rounded-xl border border-hairline bg-raised">
          {means.map((item) => (
            <div key={item.term} className="flex flex-col gap-0.5 px-4 py-3">
              <dt className="type-body-sm font-medium text-ink">{item.term}</dt>
              <dd className="type-body-sm text-ink-muted">{item.text}</dd>
            </div>
          ))}
        </dl>
      </Block>
      <Block index={1}>
        <h3 className={HEADING}>{ui('how')}</h3>
        <ol className="flex flex-col gap-2">
          {how.map((step, index) => (
            <li key={step} className="flex gap-3 type-body-sm text-ink">
              <span
                aria-hidden
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-[0.6875rem] text-accent"
              >
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Block>
      <Block index={2}>
        <div
          className={cn(
            'flex gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3',
            'type-body-sm text-ink',
          )}
        >
          <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="type-label font-medium text-accent">{ui('example')}</h3>
            <p>{t('example')}</p>
          </div>
        </div>
      </Block>
      <Block index={3}>
        <h3 className={HEADING}>{ui('filters')}</h3>
        <p className="type-body-sm text-ink-muted">{t('filters')}</p>
      </Block>
      <Block index={4}>
        <div className="flex gap-3 rounded-xl border border-hairline bg-sunken px-4 py-3">
          <SlidersHorizontal aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="type-label font-medium text-ink">{ui('setting')}</h3>
            <p className="type-body-sm text-ink-muted">{t('setting')}</p>
          </div>
        </div>
      </Block>
    </div>
  );
}
