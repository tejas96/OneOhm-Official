'use client';

import { cn, easing, seconds, useCountUp } from '@oneohm/design-system/web';
import { Hourglass } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { STAGE_LOAD, type StageLoad } from '../lab-data';
import { STAGE_ICONS } from '../stage-icons';

/**
 * Every live project on one single-line circuit: the 7 EPC stages as nodes, the
 * count at each, and current flowing from survey to subsidy. The busiest stage
 * wears the logo gradient; stages holding waiting projects say who they wait on.
 */
export function StageCircuit() {
  const t = useTranslations('lab.circuit');
  const busiest = Math.max(...STAGE_LOAD.map((load) => load.projects));
  return (
    <div className="-mx-2 overflow-x-auto px-2 pb-1">
      <ol aria-label={t('circuitLabel')} className="relative grid min-w-[46rem] grid-cols-7">
        <span
          aria-hidden
          className="absolute top-7 right-[7.14%] left-[7.14%] h-px bg-on-panel/25"
        />
        <motion.span
          aria-hidden
          className="oh-flow-x absolute top-[27px] right-[7.14%] left-[7.14%] h-[3px] origin-left rounded-full"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 0.9 }}
          transition={{ duration: 1.2, ease: easing('outQuint'), delay: 0.35 }}
        />
        {STAGE_LOAD.map((load, index) => (
          <StageNode
            key={load.stage}
            load={load}
            index={index}
            busiest={load.projects === busiest}
          />
        ))}
      </ol>
    </div>
  );
}

function StageNode({
  load,
  index,
  busiest,
}: {
  readonly load: StageLoad;
  readonly index: number;
  readonly busiest: boolean;
}) {
  const t = useTranslations('lab.circuit');
  const stagesT = useTranslations('stages');
  const partyT = useTranslations('commandCenter.attention.party');
  const count = useCountUp(load.projects);
  const Icon = STAGE_ICONS[load.stage];
  return (
    <motion.li
      className="relative flex flex-col items-center gap-2.5 px-1 text-center"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: seconds('slow'),
        ease: easing('outQuint'),
        delay: 0.1 + index * 0.06,
      }}
      aria-label={t('nodeLabel', { stage: stagesT(load.stage), count: load.projects })}
    >
      <span
        className={cn(
          'relative z-10 rounded-full p-[2px]',
          busiest ? 'oh-brand-ring' : 'bg-on-panel/20',
        )}
      >
        <span className="flex size-[52px] items-center justify-center rounded-full bg-panel-deep">
          <Icon
            aria-hidden
            className={cn('size-5', busiest ? 'text-on-panel' : 'text-on-panel-muted')}
          />
        </span>
        {load.waiting > 0 && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-waiting-solid font-mono text-[0.6875rem] text-on-panel ring-2 ring-panel-deep"
          >
            {load.waiting}
          </span>
        )}
      </span>
      <span className="type-display-lg text-on-panel tabular-nums" aria-hidden>
        {Math.round(count)}
      </span>
      <span className="-mt-1.5 type-label text-on-panel-muted">{stagesT(load.stage)}</span>
      {load.waitingOn && load.waiting > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-on-panel/[0.08] px-2 py-0.5 type-label text-on-panel-muted">
          <Hourglass aria-hidden className="size-3" />
          {t('waitingOn', { count: load.waiting, party: partyT(load.waitingOn) })}
        </span>
      ) : (
        <span className="h-5" aria-hidden />
      )}
    </motion.li>
  );
}
