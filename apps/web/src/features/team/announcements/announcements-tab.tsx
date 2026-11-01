'use client';

import type { Announcement } from '@oneohm/api-contracts';
import {
  Badge,
  Button,
  EmptyState,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
  useToast,
} from '@oneohm/design-system/web';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useRoles } from '../use-team';
import { useWorkforceFormat } from '../workforce-format';
import { AnnouncementSheet } from './announcement-sheet';
import { ANNOUNCEMENTS_KEY } from './announcements-key';

/** Notices to the team (PRD 4.1): what is showing in the field app now, and what ended. */
export function AnnouncementsTab() {
  const t = useTranslations('team.announcements');
  const format = useWorkforceFormat();
  const toast = useToast();
  const queryClient = useQueryClient();
  const roles = useRoles();
  const [posting, setPosting] = useState(false);
  const query = useQuery({
    queryKey: ANNOUNCEMENTS_KEY,
    queryFn: () => expectStatus(api.engagement.listAnnouncements(), 200),
  });
  const roleName = (key: string) => roles.data?.find((role) => role.key === key)?.name ?? key;

  const takeDown = async (item: Announcement) => {
    try {
      await expectStatus(api.engagement.endAnnouncement({ params: { id: item.id } }), 200);
      await queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_KEY });
      toast({ title: t('takenDown'), reference: item.title, tone: 'success' });
    } catch (caught) {
      toast({ title: t('failed'), description: describeError(caught), tone: 'error' });
    }
  };

  const columns: readonly TableColumn<Announcement>[] = [
    {
      key: 'announcement',
      header: t('columns.announcement'),
      primary: true,
      className: 'md:max-w-lg',
      cell: (item) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="type-body font-medium text-ink">{item.title}</span>
          <span className="type-body-sm text-ink-muted">{item.body}</span>
          <span className="type-label text-ink-faint">
            {[item.createdBy?.fullName, format.ago(item.createdAt)].filter(Boolean).join(' · ')}
          </span>
        </span>
      ),
    },
    {
      key: 'audience',
      header: t('columns.audience'),
      cell: (item) =>
        item.audienceRoleKeys.length === 0 ? (
          <span className="type-body-sm text-ink">{t('everyone')}</span>
        ) : (
          <span className="inline-flex flex-wrap justify-end gap-1.5 md:justify-start">
            {item.audienceRoleKeys.map((key) => (
              <Badge key={key} variant="soft">
                {roleName(key)}
              </Badge>
            ))}
          </span>
        ),
    },
    {
      key: 'until',
      header: t('columns.until'),
      cell: (item) => (
        <span className="type-body-sm text-ink">
          {item.endsOn ? format.day(item.endsOn) : t('untilTakenDown')}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (item) => (
        <StatusPill
          size="sm"
          tone={item.active ? 'onTrack' : 'neutral'}
          label={item.active ? t('showing') : t('ended')}
        />
      ),
    },
    {
      key: 'actions',
      header: t('columns.actions'),
      align: 'end',
      cell: (item) =>
        item.active ? (
          <Button size="sm" variant="quiet" onClick={() => takeDown(item)}>
            {t('takeDown')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
        <Button
          variant="primary"
          leadingIcon={<Plus />}
          onClick={() => setPosting(true)}
          disabled={!roles.data}
          className="self-start sm:self-auto"
        >
          {t('new')}
        </Button>
      </div>
      {query.isPending && <ListSkeleton label={t('loading')} rows={3} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {query.data && query.data.length === 0 && (
        <EmptyState icon={<Megaphone />} title={t('empty')} description={t('emptyBody')} />
      )}
      {query.data && query.data.length > 0 && (
        <ResponsiveTable
          caption={t('caption')}
          columns={columns}
          rows={query.data}
          rowKey={(item) => item.id}
        />
      )}
      {roles.data && (
        <AnnouncementSheet open={posting} onOpenChange={setPosting} roles={roles.data} />
      )}
    </div>
  );
}
