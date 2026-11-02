'use client';

import { CountBadge, cn, Tooltip } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import type { NavItem } from './navigation';
import { useAllowedNavigation, useIsCurrent } from './use-navigation';

/**
 * One look in both themes, as chosen: on light paper the current page is a solid
 * ink pill; in the dark it is a soft Ohm-blue wash.
 */
const STYLES = {
  item: 'text-ink-muted hover:bg-sunken/70 hover:text-ink',
  itemActive:
    'bg-ink font-medium text-canvas shadow-e2 dark:bg-accent-soft dark:text-on-accent-soft dark:shadow-none',
  icon: 'text-ink-faint',
  iconActive: 'text-canvas dark:text-accent',
} as const;

/** The sidebar packs rows tightly; the phone menu gives each row a full thumb's height. */
const ROW = {
  sidebar: 'h-[2.125rem] type-body-sm',
  sheet: 'h-11 type-body',
} as const;

type Variant = keyof typeof ROW;

interface NavListProps {
  readonly variant: Variant;
  /** Called when a link is followed, e.g. to close the phone menu. */
  readonly onNavigate?: () => void;
  /** Icons only: labels move into tooltips. Sidebar only. */
  readonly collapsed?: boolean;
  readonly className?: string;
}

/** The business's map, grouped the way an EPC business works; shared by sidebar and phone menu. */
export function NavList({ variant, onNavigate, collapsed = false, className }: NavListProps) {
  const t = useTranslations('nav');
  const groups = useAllowedNavigation();
  return (
    <nav aria-label={t('label')} className={cn('flex flex-col gap-3', className)}>
      {groups.map((group, index) => (
        <div key={group.key ?? `group-${index}`} className="flex shrink-0 flex-col gap-0.5">
          {group.key && !collapsed && (
            <p className="px-3 pb-0.5 type-overline text-ink-faint uppercase">
              {t(`groups.${group.key}`)}
            </p>
          )}
          {group.key && collapsed && index > 0 && (
            <hr aria-hidden className="mx-2 mb-1 border-hairline" />
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.key}>
                <NavLink
                  item={item}
                  variant={variant}
                  onNavigate={onNavigate}
                  collapsed={collapsed}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Leads whose next action is due: the one number worth a badge in the menu. */
function useLeadsToFollowUp(enabled: boolean): number {
  const { data } = useQuery({
    queryKey: ['leads', 'open'],
    queryFn: () => expectStatus(api.crm.listLeads({ query: { open: true } }), 200),
    enabled,
    staleTime: 60_000,
  });
  return (
    data?.filter(
      (lead) => lead.overdue || lead.nextActionOn === new Date().toISOString().slice(0, 10),
    ).length ?? 0
  );
}

interface NavLinkProps {
  readonly item: NavItem;
  readonly variant: Variant;
  readonly onNavigate?: (() => void) | undefined;
  readonly collapsed: boolean;
}

function NavLink({ item, variant, onNavigate, collapsed }: NavLinkProps) {
  const t = useTranslations('nav');
  const followUps = useLeadsToFollowUp(item.key === 'leads');
  const active = useIsCurrent(item.href);
  const Icon = item.icon;
  const content = (
    <>
      <Icon
        aria-hidden
        className={cn('size-[1.125rem] shrink-0', active ? STYLES.iconActive : STYLES.icon)}
      />
      <span className={cn('flex-1 truncate', collapsed && 'sr-only')}>
        {t(`items.${item.key}`)}
      </span>
      {item.key === 'leads' && (
        <span className={cn(collapsed && 'absolute -top-1 -right-1 scale-75')}>
          <CountBadge count={followUps} label={t('leadsBadge', { count: followUps })} />
        </span>
      )}
    </>
  );
  const classes = cn(
    'relative flex shrink-0 items-center gap-3 rounded-lg px-3 transition-[background-color,color,box-shadow] duration-(--duration-fast)',
    ROW[variant],
    collapsed && 'justify-center px-0',
    active ? STYLES.itemActive : STYLES.item,
  );
  if (!item.built) {
    return (
      <Tooltip
        content={`${t(`items.${item.key}`)} · ${t('notBuilt')}`}
        side="right"
        enabled={collapsed}
      >
        <span
          aria-disabled="true"
          {...(collapsed ? {} : { title: t('notBuilt') })}
          className={cn(classes, 'cursor-default')}
        >
          {content}
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={t(`items.${item.key}`)} side="right" enabled={collapsed}>
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        {...(onNavigate ? { onClick: onNavigate } : {})}
        className={classes}
      >
        {content}
      </Link>
    </Tooltip>
  );
}
