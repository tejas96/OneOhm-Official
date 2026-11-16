'use client';

import type { LivePerson, LiveSite } from '@oneohm/api-contracts';
import { IconButton } from '@oneohm/design-system/web';
import { ChevronLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { LiveStatus } from './hud-bar';
import type { Selection } from './live-canvas';
import type { LiveFilter } from './live-format';
import { PeopleList } from './people-list';
import { PersonCard } from './person-card';
import { SiteCard } from './site-card';

interface LivePanelProps {
  readonly people: readonly LivePerson[];
  readonly sites: readonly LiveSite[];
  readonly onDuty: number;
  readonly filter: LiveFilter;
  readonly onClearFilter: () => void;
  readonly selection: Selection;
  readonly onSelect: (selection: Selection) => void;
  /** When the people last arrived (ms), for the live status. */
  readonly updatedAt: number;
  readonly failed: boolean;
}

/** The panel's header: the list's title, or Back to it from a card. */
export function PanelHeader(props: LivePanelProps) {
  const { people, onDuty, selection, onSelect } = props;
  const t = useTranslations('liveMap.panel');
  if (selection)
    return (
      <div className="flex items-center gap-1 px-3 pt-2 pb-3">
        <IconButton label={t('back')} variant="quiet" onClick={() => onSelect(null)}>
          <ChevronLeft />
        </IconButton>
        <span className="type-label text-ink-muted">{t('back')}</span>
      </div>
    );
  return (
    <div className="flex items-end justify-between gap-3 px-5 pt-3 pb-3">
      <div className="flex flex-col gap-1">
        <h2 className="type-title-md text-ink">{t('people')}</h2>
        <LiveStatus updatedAt={props.updatedAt} failed={props.failed} />
      </div>
      <span className="type-label tabular-nums text-ink-muted">
        {t('onDutyOf', { onDuty, total: people.length })}
      </span>
    </div>
  );
}

/** The list, or the card of what was picked on the map or in the list. */
export function PanelBody(props: LivePanelProps) {
  const { people, sites, selection, onSelect } = props;
  const person =
    selection?.kind === 'person' ? people.find((row) => row.person.id === selection.id) : null;
  const site = selection?.kind === 'site' ? sites.find((row) => row.id === selection.id) : null;
  const key = person ? `p:${person.person.id}` : site ? `s:${site.id}` : 'list';
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        initial={{ opacity: 0, x: key === 'list' ? -12 : 12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        {person ? (
          <PersonCard person={person} />
        ) : site ? (
          <SiteCard
            site={site}
            people={people}
            onOpenPerson={(id) => onSelect({ kind: 'person', id })}
          />
        ) : (
          <PeopleList
            people={people}
            filter={props.filter}
            onClearFilter={props.onClearFilter}
            onOpen={(id) => onSelect({ kind: 'person', id })}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
