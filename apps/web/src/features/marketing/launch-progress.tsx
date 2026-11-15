'use client';

import type { CampaignDetail } from '@oneohm/api-contracts';
import { Button, useCalmMotion } from '@oneohm/design-system/web';
import { CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { launchOutcome, stepShown } from './launch-steps';
import { PlacementList } from './placement-list';

/** The steps shown while the server works; `labels` end with the last one ("Live"). */
export function useLaunchStep(running: boolean, count: number): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 250);
    return () => clearInterval(timer);
  }, [running]);
  return stepShown(elapsed, count);
}

function Steps({
  labels,
  current,
  finished,
}: {
  readonly labels: readonly string[];
  readonly current: number;
  readonly finished: boolean;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {labels.map((label, index) => {
        const done = finished || index < current;
        const active = !done && index === current;
        return (
          <motion.li
            key={label}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: done || active ? 1 : 0.4, x: 0 }}
            className="flex items-center gap-3 type-title-md text-ink"
          >
            <span className="flex size-7 items-center justify-center">
              {done ? (
                <motion.span
                  initial={{ scale: 0.4 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                >
                  <CircleCheck aria-hidden className="size-6 text-on-track" />
                </motion.span>
              ) : active ? (
                <LoaderCircle aria-hidden className="size-5 animate-spin text-accent" />
              ) : (
                <span aria-hidden className="size-2.5 rounded-full bg-rule" />
              )}
            </span>
            {label}
          </motion.li>
        );
      })}
    </ol>
  );
}

const BURST = Array.from({ length: 10 }, (_, index) => (index / 10) * Math.PI * 2);

/** A check that pops in with a soft ring of dots; nothing but a still check under calm motion. */
function Burst({ good }: { readonly good: boolean }) {
  const calm = useCalmMotion();
  const Icon = good ? CircleCheck : TriangleAlert;
  return (
    <div className="relative flex size-24 items-center justify-center">
      {good &&
        !calm &&
        BURST.map((angle) => (
          <motion.span
            key={angle}
            aria-hidden
            className="absolute size-2 rounded-full bg-energy"
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(angle) * 52, y: Math.sin(angle) * 52, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        ))}
      <motion.span
        initial={{ scale: calm ? 1 : 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 14 }}
        className={good ? 'text-on-track' : 'text-at-risk'}
      >
        <Icon aria-hidden className="size-20" strokeWidth={1.5} />
      </motion.span>
    </div>
  );
}

/**
 * The Launch moment: steps tick off while the server works, then a finish that tells the
 * truth (a check only when every place worked), the code, and each place's result.
 */
export function LaunchProgress({
  labels,
  detail,
  error,
  retrying,
  onRetry,
  onOpen,
  onBack,
}: {
  readonly labels: readonly string[];
  readonly detail: CampaignDetail | null;
  readonly error: string | null;
  readonly retrying: boolean;
  readonly onRetry: () => void;
  readonly onOpen: (id: string) => void;
  readonly onBack: () => void;
}) {
  const t = useTranslations('marketing');
  const running = detail === null && error === null;
  const current = useLaunchStep(running, labels.length);
  if (error)
    return (
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <FormError message={error} />
        <Button variant="primary" onClick={onBack}>
          {t('launch.backToEdit')}
        </Button>
      </div>
    );
  if (!detail)
    return (
      <div className="flex flex-col gap-6 p-5 sm:p-6">
        <p className="type-display-md text-ink">{t('launch.working')}</p>
        <Steps labels={labels} current={current} finished={false} />
      </div>
    );
  const outcome = launchOutcome(detail);
  return (
    <div className="flex flex-col items-center gap-5 p-5 text-center sm:p-6">
      <Burst good={outcome === 'all_good'} />
      <div className="flex flex-col gap-1">
        <p className="type-display-md text-ink">{t(`launch.outcome.${outcome}`)}</p>
        <p className="type-body text-ink-muted">{t('launch.code', { code: detail.code })}</p>
      </div>
      <div className="w-full text-left">
        <PlacementList
          placements={detail.placements}
          canRetry={detail.actions.runAgain}
          retrying={retrying}
          onRetry={onRetry}
        />
      </div>
      <Button
        variant="primary"
        size="lg"
        className="w-full sm:w-auto"
        onClick={() => onOpen(detail.id)}
      >
        {t('launch.see')}
      </Button>
    </div>
  );
}
