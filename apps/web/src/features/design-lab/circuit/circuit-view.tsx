'use client';

import { pageEnter } from '@oneohm/design-system/web';
import { motion } from 'motion/react';
import { ActionList } from '../action-list';
import { MoneyRingCard } from '../money-ring-card';
import { CircuitHero } from './circuit-hero';
import { KpiStrip } from './kpi-strip';

/** Alternative A: brand-forward. The whole business as one live circuit, then what to do. */
export function CircuitView() {
  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-6">
      <CircuitHero />
      <div className="grid gap-6 lg:grid-cols-12">
        <ActionList className="lg:col-span-8" />
        <MoneyRingCard className="lg:col-span-4" />
      </div>
      <KpiStrip />
    </motion.div>
  );
}
