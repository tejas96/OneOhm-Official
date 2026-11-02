'use client';

import { cn, pageEnter, TabPanel, Tabs } from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useChats } from '@/features/service/whatsapp/use-whatsapp';
import { WhatsAppInbox } from '@/features/service/whatsapp/whatsapp-inbox';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCan, useCurrentUser } from '@/providers/current-user';
import { useGreeting } from '../command-center/use-greeting';
import { ApprovalsInbox } from './approvals/approvals-inbox';
import { groupTasks, TODAY_GROUPS } from './group-tasks';
import { ACCENT, MyWork } from './my-work';

type View = 'work' | 'approvals' | 'chats';

/** WhatsApp chats come to the person here, not to a department page. */
function useTodayChats() {
  const chats = useChats();
  const desk = useCan('service.manage', 'customers.manage');
  return {
    showChats: (chats.data?.length ?? 0) > 0 || desk,
    chatsWaiting: (chats.data ?? []).filter((chat) => chat.needsReply).length,
  };
}

function pickView(asked: string | null, approvals: boolean, chats: boolean): View {
  if (approvals && asked === 'approvals') return 'approvals';
  if (chats && asked === 'chats') return 'chats';
  return 'work';
}

/**
 * The signed-in person's day: their own work (late, due, held, next), for anyone who
 * approves things everything waiting for their yes (`?tab=approvals`), and the WhatsApp
 * chats they answer (`?tab=chats`).
 */
export function TodayView() {
  const t = useTranslations('today');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const greeting = useGreeting();
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const approver = useCan(
    'tasks.approve',
    'tasks.assign',
    'quotations.approve_discount',
    'leave.approve',
    'procurement.manage',
    'finance.approve_payments',
    'finance.record_payments',
    'people.manage',
  );
  const query = useQuery({
    queryKey: ['tasks', 'mine'],
    queryFn: () => expectStatus(api.tasks.myTasks(), 200),
    refetchInterval: 60_000,
  });
  const approvals = useQuery({
    queryKey: ['approvals', 'mine'],
    queryFn: () => expectStatus(api.businessSettings.myApprovals(), 200),
    refetchInterval: 60_000,
  });
  const { showChats, chatsWaiting } = useTodayChats();
  const groups = groupTasks(query.data ?? [], todayIn());
  const firstName = user.fullName.split(/\s+/)[0] ?? user.fullName;
  const total = TODAY_GROUPS.reduce((sum, group) => sum + groups[group].length, 0);
  const waiting = approvals.data?.length ?? 0;
  const showApprovals = approver || waiting > 0;
  const view = pickView(params.get('tab'), showApprovals, showChats);
  const select = (next: View) => {
    const search = new URLSearchParams(params);
    if (next === 'work') search.delete('tab');
    else search.set('tab', next);
    search.delete('kind');
    search.delete('chat');
    search.delete('filter');
    router.replace(`${pathname}${search.size ? `?${search.toString()}` : ''}`, { scroll: false });
  };

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-5xl flex-col gap-10 py-2">
      <header className="flex flex-col gap-5">
        <p className="font-mono text-[0.75rem] tracking-wide text-ink-faint uppercase">
          {format.dateTime(now, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="type-display-xl text-ink md:type-hero">
          {t('greeting', { greeting, name: firstName })}
        </h1>
        {query.data && total > 0 && (
          <p className="max-w-3xl text-[1.25rem] leading-8 text-ink-muted [font-family:var(--font-display)] md:type-display-md">
            {t('brief', {
              overdue: groups.overdue.length,
              today: groups.today.length,
              upcoming: groups.upcoming.length,
            })}
            {waiting > 0 && ` ${t('approvals.brief', { count: waiting })}`}
            {chatsWaiting > 0 && ` ${t('chats.brief', { count: chatsWaiting })}`}
          </p>
        )}
        {view === 'work' && query.data && total > 0 && (
          <nav aria-label={t('jump')} className="flex flex-wrap gap-2">
            {TODAY_GROUPS.filter((group) => group !== 'first' || groups.first.length > 0).map(
              (group) => (
                <a
                  key={group}
                  href={`#${group}`}
                  className="inline-flex items-center gap-2 rounded-full bg-raised px-3.5 py-1.5 type-body-sm text-ink-muted shadow-e1 ring-1 ring-hairline/70 hover:text-ink"
                >
                  <span className={cn('font-mono font-medium', ACCENT[group])}>
                    {groups[group].length}
                  </span>
                  {t(`groups.${group}.title`)}
                </a>
              ),
            )}
          </nav>
        )}
      </header>
      {showApprovals || showChats ? (
        <Tabs<View>
          label={t('views')}
          value={view}
          onValueChange={select}
          items={[
            { value: 'work', label: t('myWork'), count: total },
            ...(showApprovals
              ? [{ value: 'approvals' as const, label: t('approvals.title'), count: waiting }]
              : []),
            ...(showChats
              ? [{ value: 'chats' as const, label: t('chats.title'), count: chatsWaiting }]
              : []),
          ]}
          className="flex flex-col gap-8"
        >
          <TabPanel value="work" className="flex flex-col gap-10">
            <MyWork query={query} groups={groups} />
          </TabPanel>
          <TabPanel value="approvals">
            <ApprovalsInbox query={approvals} />
          </TabPanel>
          <TabPanel value="chats">
            <WhatsAppInbox />
          </TabPanel>
        </Tabs>
      ) : (
        <MyWork query={query} groups={groups} />
      )}
    </motion.div>
  );
}
