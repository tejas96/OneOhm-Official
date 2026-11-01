'use client';

import { BUSINESS_REPORTS, type BusinessReportName } from '@oneohm/api-contracts';
import { Button, EmptyState, PageHeader, pageEnter } from '@oneohm/design-system/web';
import { Download, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { CenterFilterBar } from '@/features/command-center/center-filter-bar';
import { useCan } from '@/providers/current-user';
import { ReportTabs } from './report-tabs';

/** Reports counted per project manager; the others are about people, not projects. */
const MANAGER_REPORTS: ReadonlySet<BusinessReportName> = new Set([
  'delivery',
  'delays',
  'collections',
  'profitability',
  'service',
]);

/**
 * The Reports area, like Lintel's: one header, a tab per report (each its own address),
 * the shared filters kept in the address and carried across tabs, and a CSV download
 * of the open report. The API decides what each person may see.
 */
export function ReportsFrame({ children }: { readonly children: ReactNode }) {
  const t = useTranslations('businessReports');
  const pathname = usePathname();
  const params = useSearchParams();
  const allowed = useCan('dashboard.view_business');
  const current = BUSINESS_REPORTS.find((name) => pathname.startsWith(`/reports/${name}`));
  const search = params.toString() ? `?${params.toString()}` : '';
  return (
    <div className="mx-auto flex w-full max-w-[90rem] min-w-0 flex-col gap-6 py-2">
      <motion.div {...pageEnter}>
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      </motion.div>
      {!allowed ? (
        <EmptyState icon={<Lock />} title={t('noAccess.title')} description={t('noAccess.body')} />
      ) : (
        <>
          <ReportTabs
            label={t('tabsLabel')}
            activeKey={current ?? null}
            items={BUSINESS_REPORTS.map((name) => ({
              href: `/reports/${name}${search}`,
              label: t(`tabs.${name}`),
              active: current === name,
            }))}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <CenterFilterBar hideManager={!current || !MANAGER_REPORTS.has(current)} />
            {current && (
              <Button asChild variant="secondary" className="self-start">
                <a
                  href={`/api/v1/business-reports/${current}/csv${search}`}
                  download
                  aria-label={t('csvLabel', { report: t(`tabs.${current}`) })}
                >
                  <Download aria-hidden className="size-4" />
                  {t('csv')}
                </a>
              </Button>
            )}
          </div>
          <div className="min-w-0">{children}</div>
        </>
      )}
    </div>
  );
}
