'use client';

import { pageEnter } from '@oneohm/design-system/web';
import { motion } from 'motion/react';
import { FiguresRow } from './figures-row';
import { Lede } from './lede';
import { MoneyAndWaiting } from './money-ledger';
import { ProjectLedger } from './project-ledger';

/** Alternative B: calm and typographic. A morning brief, then the ledger. */
export function EditorialView() {
  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[84rem] flex-col gap-12 py-2">
      <Lede />
      <FiguresRow />
      <ProjectLedger />
      <MoneyAndWaiting />
    </motion.div>
  );
}
