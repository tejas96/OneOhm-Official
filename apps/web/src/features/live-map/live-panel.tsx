'use client';

import type { DutyAlert, LivePerson, LiveSite } from '@oneohm/api-contracts';
import { cn, IconButton } from '@oneohm/design-system/web';
import { ChevronLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AlertFeed } from './alerts/alert-feed';
import { LiveStatus } from './hud-bar';
import type { LiveFilter } from './live-format';
import { PeopleList } from './people-list';
import { PersonCard } from './person-card';
import { SiteCard } from './site-card';
import type { LiveView, PanelTab } from './use-live-view';

export interface LivePanelProps {
  readonly view: LiveView;
  readonly people: readonly LivePerson[];
  readonly sites: readonly LiveSite[];
  readonly onDuty: number;
  readonly alerts: { readonly open: number; readonly red: number };
  /** When the people last arrived (ms), for the live status. */
  readonly updatedAt: number;
  readonly failed: boolean;
  /** The open day's own panel, which replaces the rest while a day is open. */
  readonly dayPanel: ReactNode;
  readonly onSelect: (selection: LiveView['selection']) => void;
}

/** The panel's header: the People and Alerts tabs, Back from a card, or Back from a day. */
export function PanelHeader(props: LivePanelProps) {
  const { view, people, onDuty, alerts } = props;
  const t = useTranslations('liveMap.panel');
  if (view.day || (view.tab === 'people' && view.selection))
    return (
      <div className="flex items-center gap-1 px-3 pt-2 pb-3">
        <IconButton
          label={view.day ? t('backFromDay') : t('back')}
          variant="quiet"
          onClick={() => (view.day ? view.setDay(null) : props.onSelect(null))}
        >
          <ChevronLeft />
        </IconButton>
        <span className="type-label text-ink-muted">{view.day ? t('backFromDay') : t('back')}</span>
      </div>
    );
  const tabs: { value: PanelTab; label: string; extra: ReactNode }[] = [
    {
      value: 'people',
      label: t('people'),
      extra: null,
    },
    {
      value: 'alerts',
      label: t('alerts'),
      extra:
        alerts.open > 0 ? (
          <span
            className={cn(
              'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-bold text-raised tabular-nums',
              alerts.red > 0 ? 'bg-overdue' : 'bg-at-risk',
            )}
          >
            {alerts.open}
          </span>
        ) : null,
    },
  ];
  return (
    <div className="flex flex-col gap-2 px-3 pt-1">
      <div role="tablist" aria-label={t('tabs')} className="flex border-b border-hairline">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={view.tab === tab.value}
            onClick={() => view.setTab(tab.value)}
            className={cn(
              'relative flex h-12 flex-1 items-center justify-center gap-2 type-body font-semibold transition-colors duration-(--duration-fast)',
              view.tab === tab.value ? 'text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {tab.label}
            {tab.extra}
            {view.tab === tab.value && (
              <motion.span
                layoutId="live-tab"
                className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent"
              />
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 px-2 pb-1">
        <LiveStatus updatedAt={props.updatedAt} failed={props.failed} />
        <span className="type-label tabular-nums text-ink-muted">
          {t('onDutyOf', { onDuty, total: people.length })}
        </span>
      </div>
    </div>
  );
}

/** The list, the feed, the card of what was picked, or the open day. */
export function PanelBody(props: LivePanelProps) {
  const { view, people, sites, onSelect } = props;
  const { selection } = view;
  const person =
    selection?.kind === 'person' ? people.find((row) => row.person.id === selection.id) : null;
  const site = selection?.kind === 'site' ? sites.find((row) => row.id === selection.id) : null;
  const card = view.tab === 'people' && !view.day;
  const key = bodyKey(view, person, site);
  const focus = (alert: DutyAlert) => view.focusAlert(alert);
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        initial={{ opacity: 0, x: key === 'list' || key === 'alerts' ? -12 : 12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        {view.day ? (
          props.dayPanel
        ) : view.tab === 'alerts' ? (
          <AlertFeed
            focusedId={view.focusedAlert}
            onFocus={focus}
            onOpenDay={(alert) => view.setDay({ personId: alert.person.id, date: alert.day })}
            onSendNearest={view.sendNearest}
          />
        ) : card && person ? (
          <PersonCard person={person} onOpenDay={() => view.openDayOf(person.person.id)} />
        ) : card && site ? (
          <SiteCard
            site={site}
            people={people}
            onOpenPerson={(id) => onSelect({ kind: 'person', id })}
            nearestOpen={view.nearestFor === site.id}
            onNearestOpen={() => view.setNearestFor(site.id)}
          />
        ) : (
          <PeopleList
            people={people}
            filter={view.filter as LiveFilter}
            onClearFilter={() => view.setFilter('all')}
            onOpen={(id) => onSelect({ kind: 'person', id })}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/** Which body shows; a new key slides the panel's content. */
function bodyKey(
  view: LiveView,
  person: LivePerson | null | undefined,
  site: LiveSite | null | undefined,
) {
  if (view.day) return `day:${view.day.personId}`;
  if (view.tab === 'alerts') return 'alerts';
  if (person) return `p:${person.person.id}`;
  return site ? `s:${site.id}` : 'list';
}
