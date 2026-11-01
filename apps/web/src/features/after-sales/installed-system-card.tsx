'use client';

import type { InstalledAsset, ProjectDetail } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  CardHeader,
  IconButton,
  type PillTone,
  StatusPill,
  useToast,
} from '@oneohm/design-system/web';
import { useMutation } from '@tanstack/react-query';
import { CalendarPlus, ClipboardList, Pencil } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { AmcList } from './amc-list';
import { AssetSheet } from './asset-sheet';
import { SellAmcDialog } from './sell-amc-dialog';
import {
  dateOf,
  LONG_DATE,
  useProjectAfterSales,
  useRefreshAfterSales,
} from './use-project-after-sales';

const COVER_TONE: Readonly<Record<InstalledAsset['warrantyState'], PillTone>> = {
  active: 'onTrack',
  ending_soon: 'atRisk',
  ended: 'neutral',
};

function AssetRow({
  asset,
  onEdit,
}: {
  readonly asset: InstalledAsset;
  readonly onEdit: (() => void) | null;
}) {
  const t = useTranslations('afterSales.project');
  const format = useFormatter();
  const day = (value: string) => format.dateTime(dateOf(value), LONG_DATE);
  const kind = t(`kinds.${asset.kind}`);
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="type-overline text-ink-faint uppercase">{kind}</p>
        <p className="type-body-sm text-ink">
          {asset.quantity > 1 && (
            <span className="mr-1 font-mono tabular-nums">
              {t('quantity', { count: asset.quantity })}
            </span>
          )}
          {[asset.make, asset.model].filter(Boolean).join(' · ')}
        </p>
        {asset.kind !== 'structure' && asset.kind !== 'workmanship' && (
          <p className="type-label text-ink-faint">
            {t('serials', { count: asset.serialNumbers.length })}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-3">
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <StatusPill
            size="sm"
            tone={COVER_TONE[asset.warrantyState]}
            label={t(`state.${asset.warrantyState}`)}
          />
          <span className="whitespace-nowrap type-label text-ink-muted tabular-nums">
            {t('until', { date: day(asset.warrantyEndsOn) })}
          </span>
          {asset.performanceEndsOn && (
            <span className="whitespace-nowrap type-label text-ink-faint tabular-nums">
              {t('performance', { date: day(asset.performanceEndsOn) })}
            </span>
          )}
        </div>
        {onEdit && (
          <IconButton label={t('edit', { item: kind })} size="sm" onClick={onEdit}>
            <Pencil />
          </IconButton>
        )}
      </div>
    </li>
  );
}

/**
 * The project's installed system with warranty end dates, and its AMC (PRD 3.17).
 * Recorded at commissioning; older projects can be recorded from the quotation here.
 */
export function InstalledSystemCard({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('afterSales.project');
  const format = useFormatter();
  const toast = useToast();
  const canSee = useCan('projects.view_all', 'service.manage', 'projects.manage');
  const canEdit = useCan('service.manage', 'projects.manage');
  const canSell = useCan('service.manage');
  const query = useProjectAfterSales(project.id, canSee);
  const refresh = useRefreshAfterSales(project.id);
  const [editing, setEditing] = useState<InstalledAsset | null>(null);
  const [selling, setSelling] = useState(false);
  const record = useMutation({
    mutationFn: () =>
      expectStatus(api.afterSales.recordAssets({ params: { id: project.id } }), 200),
    onSuccess: (next) => {
      refresh(next);
      toast({ tone: 'success', title: t('recorded') });
    },
    onError: (error) => toast({ tone: 'error', title: describeError(error) }),
  });
  if (!canSee) return null;
  const data = query.data;
  const commissioned = Boolean(data?.commissionedOn);

  return (
    <Card>
      <CardHeader
        title={t('title')}
        description={t('description')}
        action={
          canSell && commissioned ? (
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<CalendarPlus />}
              onClick={() => setSelling(true)}
            >
              {t('sell')}
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-4 px-5 pb-5">
        {query.isPending && <ListSkeleton label={t('loading')} rows={3} />}
        {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
        {data && data.assets.length === 0 && (
          <div className="flex flex-col items-start gap-3 rounded-lg bg-sunken px-4 py-3">
            <p className="type-body-sm text-ink-muted">
              {data.commissionedOn
                ? t('notRecorded', {
                    date: format.dateTime(dateOf(data.commissionedOn), LONG_DATE),
                  })
                : t('notYet')}
            </p>
            {data.commissionedOn && canEdit && (
              <Button
                size="sm"
                variant="secondary"
                leadingIcon={<ClipboardList />}
                pending={record.isPending}
                onClick={() => record.mutate()}
              >
                {t('record')}
              </Button>
            )}
          </div>
        )}
        {data && data.assets.length > 0 && (
          <ul className="flex flex-col divide-y divide-hairline">
            {data.assets.map((asset) => (
              <AssetRow
                key={asset.id}
                asset={asset}
                onEdit={canEdit ? () => setEditing(asset) : null}
              />
            ))}
          </ul>
        )}
        {data && commissioned && <AmcList projectId={project.id} contracts={data.amcs} />}
      </div>
      <AssetSheet projectId={project.id} asset={editing} onClose={() => setEditing(null)} />
      <SellAmcDialog
        open={selling}
        project={project}
        commissionedOn={data?.commissionedOn ?? null}
        onClose={() => setSelling(false)}
      />
    </Card>
  );
}
