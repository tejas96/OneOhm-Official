'use client';

import type { Discom } from '@oneohm/api-contracts';
import { Select } from '@oneohm/design-system/web';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useDiscoms } from '../../use-settings';
import { ChangeTypesSection } from './change-types-section';
import { ReportFormatsSection } from './report-formats-section';

/** The DISCOM the two sections below show, kept in `?discom=` (its code). */
function useChosenDiscom(discoms: readonly Discom[]) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const usable = discoms.filter((discom) => discom.active);
  const code = params.get('discom');
  const chosen = discoms.find((discom) => discom.code === code) ?? usable[0] ?? discoms[0] ?? null;
  const choose = (next: string) => {
    const query = new URLSearchParams(params);
    query.set('discom', next);
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };
  return { chosen, choose };
}

/**
 * Each DISCOM's own process (PRD 3.15, 3.18): its change requests and its report
 * formats, one DISCOM at a time, changed here without a developer (PRD 7.2).
 */
export function DiscomSetup() {
  const t = useTranslations('discomSetup');
  const discoms = useDiscoms();
  const { chosen, choose } = useChosenDiscom(discoms.data ?? []);
  if (!chosen) return null;
  const options = (discoms.data ?? [])
    .filter((discom) => discom.active || discom.id === chosen.id)
    .map((discom) => ({ value: discom.code, label: `${discom.code} · ${discom.name}` }));
  return (
    <div className="flex flex-col gap-10 border-t border-hairline pt-10">
      <div className="max-w-md">
        <Select label={t('discom')} value={chosen.code} onValueChange={choose} options={options} />
      </div>
      <ChangeTypesSection discom={chosen} />
      <ReportFormatsSection discom={chosen} />
    </div>
  );
}
