'use client';

import type { AttendanceDay, TeamAttendanceRow } from '@oneohm/api-contracts';
import { Badge, ResponsiveTable, StatusPill, type TableColumn } from '@oneohm/design-system/web';
import { BatteryMedium, MapPin, MapPinOff, Signal, Wifi, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PersonChip } from '../person-chip';
import { useWorkforceFormat } from '../workforce-format';

const Faint = ({ children }: { readonly children: string }) => (
  <span className="type-body-sm text-ink-faint">{children}</span>
);

/** Where the person checked in: the nearest authorised place, inside or how far outside. */
function Place({ day }: { readonly day: AttendanceDay }) {
  const t = useTranslations('team.attendance');
  if (!day.place)
    return (
      <span className="inline-flex items-center gap-1.5 type-body-sm text-ink-faint">
        <MapPinOff aria-hidden className="size-3.5 shrink-0" />
        {t('noLocation')}
      </span>
    );
  const distance =
    day.place.distanceM < 1000
      ? t('metres', { value: day.place.distanceM })
      : t('kilometres', { value: Math.round(day.place.distanceM / 100) / 10 });
  return (
    <span className="inline-flex min-w-0 flex-col items-end md:items-start">
      <span className="inline-flex items-center gap-1.5 type-body-sm text-ink">
        <MapPin aria-hidden className="size-3.5 shrink-0 text-ink-faint" />
        <span className="truncate">{day.place.name}</span>
      </span>
      <span
        className={day.place.inside ? 'type-body-sm text-ink-faint' : 'type-body-sm text-at-risk'}
      >
        {day.place.inside ? t('inside', { distance }) : t('outside', { distance })}
      </span>
    </span>
  );
}

const NETWORK_ICON = { wifi: Wifi, cellular: Signal, none: WifiOff, other: Signal } as const;

/** The phone's battery and connection at check-in, when it told us (PRD 4.3). */
function Device({ day }: { readonly day: AttendanceDay }) {
  const t = useTranslations('team.attendance.device');
  const device = day.device;
  if (!device && !day.autoFromSite) return null;
  const Net = device?.network ? NETWORK_ICON[device.network] : null;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-2.5 gap-y-0.5 type-label text-ink-faint md:justify-start">
      {device?.batteryPercent !== null && device?.batteryPercent !== undefined && (
        <span className="inline-flex items-center gap-1">
          <BatteryMedium aria-hidden className="size-3.5" />
          {device.charging
            ? t('charging', { value: device.batteryPercent })
            : t('battery', { value: device.batteryPercent })}
        </span>
      )}
      {Net && device?.network && (
        <span className="inline-flex items-center gap-1">
          <Net aria-hidden className="size-3.5" />
          {t(device.network)}
        </span>
      )}
      {day.autoFromSite && <span>{t('autoFromSite')}</span>}
    </span>
  );
}

/** One row per staff member for the chosen day. */
export function AttendanceTable({ rows }: { readonly rows: readonly TeamAttendanceRow[] }) {
  const t = useTranslations('team.attendance');
  const format = useWorkforceFormat();

  const columns: readonly TableColumn<TeamAttendanceRow>[] = [
    {
      key: 'person',
      header: t('columns.person'),
      primary: true,
      cell: (row) => <PersonChip person={row.user} />,
    },
    {
      key: 'in',
      header: t('columns.in'),
      cell: ({ day }) =>
        day ? (
          <span className="inline-flex flex-col items-end gap-1 md:items-start">
            <span className="inline-flex items-center gap-2">
              <span className="font-mono text-[0.875rem] text-ink tabular-nums">
                {format.time(day.checkInAt)}
              </span>
              {day.late && <StatusPill tone="atRisk" size="sm" label={t('late')} />}
            </span>
            <Device day={day} />
          </span>
        ) : (
          <Faint>{t('notIn')}</Faint>
        ),
    },
    {
      key: 'out',
      header: t('columns.out'),
      cell: ({ day }) => {
        if (!day) return <Faint>{t('none')}</Faint>;
        if (!day.checkOutAt) return <Faint>{t('stillIn')}</Faint>;
        return (
          <span className="inline-flex flex-col items-end md:items-start">
            <span className="font-mono text-[0.875rem] text-ink tabular-nums">
              {format.time(day.checkOutAt)}
            </span>
            {day.checkOutInside === false && (
              <span className="type-body-sm text-at-risk">{t('leftOutside')}</span>
            )}
          </span>
        );
      },
    },
    {
      key: 'where',
      header: t('columns.where'),
      cell: ({ day }) => (day ? <Place day={day} /> : <Faint>{t('none')}</Faint>),
    },
    {
      key: 'notes',
      header: t('columns.notes'),
      cell: (row) =>
        row.onLeave || row.day?.corrected ? (
          <span className="inline-flex flex-wrap justify-end gap-1.5 md:justify-start">
            {row.onLeave && <StatusPill tone="waiting" size="sm" label={row.onLeave} />}
            {row.day?.corrected && <Badge variant="soft">{t('corrected')}</Badge>}
          </span>
        ) : (
          <Faint>{t('none')}</Faint>
        ),
    },
  ];

  return (
    <ResponsiveTable
      caption={t('caption')}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.user.id}
    />
  );
}
