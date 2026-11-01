'use client';

import type { ProjectChangeImpact } from '@oneohm/api-contracts';
import { formatKwp } from '@oneohm/shared';
import { useTranslations } from 'next-intl';

type Scope = ProjectChangeImpact['scope'];

/** Only what moves, each as "was → becomes", in the team's words. */
export function ChangeScopeLines({ scope }: { readonly scope: Scope }) {
  const t = useTranslations('scopeChanges.scope');
  const structureT = useTranslations('quotations.structure');
  const { before, after } = scope;
  const panel = (side: Scope['before']) =>
    `${side.moduleCount} × ${side.panel.name} (${side.panel.dcr ? t('dcr') : t('nonDcr')})`;
  const lines: { key: string; label: string; from: string; to: string }[] = [];
  if (before.capacityWp !== after.capacityWp)
    lines.push({
      key: 'size',
      label: t('size'),
      from: formatKwp(before.capacityWp),
      to: formatKwp(after.capacityWp),
    });
  if (panel(before) !== panel(after))
    lines.push({ key: 'panel', label: t('panels'), from: panel(before), to: panel(after) });
  if (before.inverter !== after.inverter)
    lines.push({
      key: 'inverter',
      label: t('inverter'),
      from: before.inverter,
      to: after.inverter,
    });
  if (before.battery !== after.battery)
    lines.push({
      key: 'battery',
      label: t('battery'),
      from: before.battery ?? t('none'),
      to: after.battery ?? t('none'),
    });
  if (before.structureType !== after.structureType)
    lines.push({
      key: 'structure',
      label: t('structure'),
      from: structureT(before.structureType),
      to: structureT(after.structureType),
    });
  const added = after.extras.slice(before.extras.length);
  return (
    <ul className="flex flex-col gap-2">
      {lines.map((line) => (
        <li key={line.key} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
          <span className="w-24 shrink-0 type-body-sm text-ink-faint">{line.label}</span>
          <span className="type-body text-ink">
            <span className="text-ink-muted line-through decoration-ink-faint/60">{line.from}</span>
            {' → '}
            {line.to}
          </span>
        </li>
      ))}
      {added.map((description) => (
        <li
          key={`extra-${description}`}
          className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3"
        >
          <span className="w-24 shrink-0 type-body-sm text-ink-faint">{t('extra')}</span>
          <span className="type-body text-ink">{description}</span>
        </li>
      ))}
    </ul>
  );
}
