'use client';

import type { WorkforcePolicyInput } from '@oneohm/api-contracts';
import { Badge, ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../number-input';

type Points = WorkforcePolicyInput['points'];
type Approval = 'automatic' | 'manager' | 'given';
type PointsField = keyof Points;

/** Each source of points (apps/api workforce/points), in the order people meet them. */
const EVENTS: readonly { readonly field: PointsField; readonly approval: Approval }[] = [
  { field: 'onTimeTask', approval: 'automatic' },
  { field: 'firstTimeRight', approval: 'automatic' },
  { field: 'goodRating', approval: 'manager' },
  { field: 'stageRating', approval: 'manager' },
  { field: 'recognitionMax', approval: 'given' },
];

const BADGE: Readonly<Record<Approval, 'energy' | 'soft' | 'outline'>> = {
  automatic: 'energy',
  manager: 'soft',
  given: 'outline',
};

/** What earns points, how many (edited in place) and who approves them. */
export function PointsTable({
  points,
  onChange,
  errors,
}: {
  readonly points: Points;
  readonly onChange: (points: Points) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.rewards.points');
  const columns: readonly TableColumn<(typeof EVENTS)[number]>[] = [
    {
      key: 'event',
      header: t('columns.event'),
      primary: true,
      cell: ({ field }) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="type-body font-medium text-ink">{t(`events.${field}`)}</span>
          <span className="type-body-sm font-normal text-ink-faint md:max-w-[34rem]">
            {t(`events.${field}Detail`)}
          </span>
        </span>
      ),
    },
    {
      key: 'points',
      header: t('columns.points'),
      align: 'end',
      // The narrow columns fit their content; the event takes the rest of the row.
      className: 'md:w-px md:whitespace-nowrap',
      cell: ({ field }) => {
        const error = errors[`points.${field}`];
        return (
          <span className="inline-flex flex-col items-end gap-1">
            <span className="inline-flex items-center gap-2">
              {field === 'recognitionMax' && (
                <span className="whitespace-nowrap type-body-sm text-ink-faint">{t('upTo')}</span>
              )}
              <span className="w-24">
                <NumberInput
                  unit="whole"
                  aria-label={t('pointsLabel', { event: t(`events.${field}`) })}
                  aria-invalid={error ? true : undefined}
                  value={points[field]}
                  onValueChange={(value) => onChange({ ...points, [field]: value ?? 0 })}
                />
              </span>
            </span>
            {error && <span className="type-body-sm text-overdue">{error}</span>}
          </span>
        );
      },
    },
    {
      key: 'approval',
      header: t('columns.approval'),
      className: 'md:w-px md:whitespace-nowrap',
      cell: ({ approval }) => <Badge variant={BADGE[approval]}>{t(`approval.${approval}`)}</Badge>,
    },
  ];
  return (
    <ResponsiveTable
      caption={t('caption')}
      columns={columns}
      rows={EVENTS}
      rowKey={(row) => row.field}
    />
  );
}
