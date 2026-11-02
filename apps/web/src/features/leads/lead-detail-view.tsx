'use client';

import { Button, pageEnter, Skeleton, SkeletonGroup, StatusPill } from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Phone, UserRoundCheck } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { LoadError } from '@/components/query-state';
import { SectionHeading } from '@/features/command-center/section-heading';
import { PapersSection } from '@/features/documents/papers-section';
import { OpenChatButton } from '@/features/service/whatsapp/open-chat-button';
import { RecordChat } from '@/features/service/whatsapp/record-chat';
import { api, expectStatus } from '@/lib/api/api-client';
import { formatPhone } from '@/lib/format/contact';
import { useCan } from '@/providers/current-user';
import { LeadCustomerCard } from './lead-customer-card';
import { FollowUpCard, LeadFactsCard } from './lead-facts-card';
import { leadKeys, STAGE_TONE } from './lead-labels';
import { LeadStageCard } from './lead-stage-card';
import { LeadTimeline } from './lead-timeline';
import { LogActivityForm } from './log-activity-form';

/** One lead: reach them, log what happened, set the next step, convert and quote. */
export function LeadDetailView({ id }: { readonly id: string }) {
  const t = useTranslations('leads');
  const format = useFormatter();
  const canManage = useCan('leads.manage');
  const query = useQuery({
    queryKey: leadKeys.detail(id),
    queryFn: () => expectStatus(api.crm.getLead({ params: { id } }), 200),
  });

  if (query.isPending) {
    return (
      <SkeletonGroup
        label={t('loading')}
        className="mx-auto flex w-full max-w-[90rem] flex-col gap-6"
      >
        <Skeleton className="h-24 w-1/2 rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Skeleton className="h-80 rounded-[28px]" />
          <Skeleton className="h-80 rounded-[28px]" />
        </div>
      </SkeletonGroup>
    );
  }
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  const lead = query.data;

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8">
      <header className="flex flex-col gap-5">
        <Link
          href="/leads"
          className="inline-flex items-center gap-1.5 self-start type-body-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t('back')}
        </Link>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill
                tone={STAGE_TONE[lead.stage]}
                label={lead.step?.name ?? t(`stage.${lead.stage}`)}
              />
              <span className="font-mono text-[0.75rem] text-ink-faint uppercase">
                {t('since', {
                  date: format.dateTime(new Date(lead.createdAt), {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }),
                })}
              </span>
            </div>
            <h1 className="type-display-lg text-balance text-ink md:type-display-xl">
              {lead.name}
            </h1>
            <p className="flex flex-wrap gap-x-3 gap-y-1 type-body text-ink-muted">
              <span className="font-mono">{formatPhone(lead.phone)}</span>
              <span aria-hidden>·</span>
              <span>{lead.city}</span>
            </p>
            {lead.matchedCustomer && !lead.customerId && (
              <Link
                href={`/customers/${lead.matchedCustomer.id}`}
                className="inline-flex items-center gap-1.5 self-start type-body-sm font-medium text-accent underline-offset-4 hover:underline"
              >
                <UserRoundCheck aria-hidden className="size-4" />
                {t('matchedCustomer', { name: lead.matchedCustomer.name })}
              </Link>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm" leadingIcon={<Phone />}>
              <a href={`tel:${lead.phone}`}>{t('call')}</a>
            </Button>
            <OpenChatButton phone={lead.phone} label={t('whatsapp')} />
          </div>
        </div>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-8">
          {canManage && <LogActivityForm lead={lead} />}
          {/* The lead's WhatsApp chat, answered here from the business number. */}
          <RecordChat phone={lead.phone} name={lead.name} />
          <section aria-label={t('timeline.title')} className="flex flex-col gap-4">
            <SectionHeading index="01" title={t('timeline.title')} />
            <LeadTimeline activities={lead.activities} />
          </section>
        </div>
        <aside className="order-first flex flex-col gap-4 lg:sticky lg:top-6 lg:order-none">
          <FollowUpCard lead={lead} today={todayIn()} />
          <LeadCustomerCard lead={lead} />
          <LeadStageCard lead={lead} canManage={canManage} />
          <LeadFactsCard lead={lead} />
        </aside>
      </div>
      {/* Papers collected at the lead stage (PRD 3.14), once the lead has its site. */}
      {lead.customerId && <PapersSection scope={{ leadId: lead.id }} name={lead.name} />}
    </motion.div>
  );
}
