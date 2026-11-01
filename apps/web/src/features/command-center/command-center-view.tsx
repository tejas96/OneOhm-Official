'use client';

import { pageEnter } from '@oneohm/design-system/web';
import { motion } from 'motion/react';
import { ActionList } from './action-list';
import { MoneyLedger } from './money-ledger';
import { MorningBrief } from './morning-brief';
import { CollectionsTile, HealthTile, InstalledTile, WaitingTile } from './overview-tiles';
import { PipelineTile } from './pipeline-tile';
import { ProjectLedger } from './project-ledger';

/**
 * The owner's morning view: a one-paragraph brief, then the tiles (what was built,
 * money in, what needs the owner, health, waiting time, sales), then every live
 * project as a metro line, then the money ledger.
 */
export function CommandCenterView() {
  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-12 py-2">
      <MorningBrief />
      <div className="grid gap-4 lg:grid-cols-12">
        <InstalledTile className="lg:col-span-7 lg:row-span-2" />
        <CollectionsTile className="lg:col-span-5" />
        <ActionList
          compact
          limit={3}
          className="rounded-[28px] border-0 shadow-e1 ring-1 ring-hairline/70 lg:col-span-5"
        />
        <HealthTile className="lg:col-span-4" />
        <WaitingTile className="lg:col-span-4" />
        <PipelineTile className="lg:col-span-4" />
      </div>
      <ProjectLedger />
      <MoneyLedger />
    </motion.div>
  );
}
