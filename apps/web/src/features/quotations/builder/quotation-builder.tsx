'use client';

import { PageHeader, pageEnter } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { ArrowLeft, Calculator } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { LoadError } from '@/components/query-state';
import { SectionHeading } from '@/features/command-center/section-heading';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { DcrComparison } from '../dcr-comparison';
import { PriceStack } from '../price-stack';
import { QuotationLines } from '../quotation-lines';
import { BuilderActions } from './builder-actions';
import { ExtrasField } from './extras-field';
import { PropertyPicker } from './property-picker';
import { DiscountField, SiteFields } from './site-fields';
import { SystemFields } from './system-fields';
import { useBuilder } from './use-builder';
import { useQuotationPreview } from './use-quotation-preview';

/**
 * A quotation in a few taps (PRD 3.5): who it is for, the system, the site defaults and
 * any discount on the left; the live price, subsidy and effective cost on the right.
 */
export function QuotationBuilder() {
  const t = useTranslations('quotations.builder');
  const showMargin = useCan('quotations.approve_discount');
  const builder = useBuilder();
  const { state, patch, input, catalog } = builder;
  const { preview, updating, error, fieldErrors } = useQuotationPreview(input);
  const [saveErrors, setSaveErrors] = useState<Readonly<Record<string, string>>>({});
  const errors = { ...fieldErrors, ...saveErrors };

  const chosenPanel = catalog.data?.panels.find((panel) => panel.id === state.panelProductId);
  const switchPanel = (kind: 'dcr' | 'nonDcr') => {
    const wattage = chosenPanel?.wattageWp ?? 0;
    const other = catalog.data?.panels
      .filter((panel) => panel.dcr === (kind === 'dcr'))
      .sort(
        (a, b) => Math.abs((a.wattageWp ?? 0) - wattage) - Math.abs((b.wattageWp ?? 0) - wattage),
      )[0];
    if (other) patch({ panelProductId: other.id, panelChosen: true });
  };

  if (catalog.isError) return <LoadError error={catalog.error} onRetry={() => catalog.refetch()} />;
  const products = catalog.data ?? { panels: [], inverters: [], batteries: [] };
  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-10 py-2">
      <PageHeader
        eyebrow={
          <Link href="/quotations" className="inline-flex items-center gap-1.5 hover:text-ink">
            <ArrowLeft aria-hidden className="size-4" />
            {t('back')}
          </Link>
        }
        title={
          builder.revision ? t('reviseTitle', { number: builder.revision.number }) : t('title')
        }
        description={t('description')}
      />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,27rem)] lg:items-start">
        <div className="flex flex-col gap-12">
          <Step index="01" title={t('sections.customer')}>
            <PropertyPicker
              propertyId={state.propertyId}
              onSelect={builder.selectProperty}
              onClear={builder.clearProperty}
            />
          </Step>
          <Step index="02" title={t('sections.system')}>
            <SystemFields state={state} patch={patch} catalog={products} errors={errors} />
          </Step>
          <Step index="03" title={t('sections.site')}>
            <SiteFields state={state} patch={patch} errors={errors} />
          </Step>
          <Step index="04" title={t('sections.extras')}>
            <ExtrasField extras={state.extras} onChange={(extras) => patch({ extras })} />
          </Step>
          <Step index="05" title={t('sections.discount')}>
            <DiscountField
              state={state}
              patch={patch}
              preview={preview}
              error={errors.discountPaise}
            />
          </Step>
        </div>
        <aside className="flex flex-col gap-6 lg:sticky lg:top-6">
          {preview ? (
            <PriceStack totals={preview.totals} updating={updating} />
          ) : (
            <PricePlaceholder message={error ? describeError(error) : t('waiting')} />
          )}
          {preview?.comparison && (
            <DcrComparison
              comparison={preview.comparison}
              chosen={chosenPanel?.dcr === false ? 'nonDcr' : 'dcr'}
              onChoose={switchPanel}
            />
          )}
          <BuilderActions
            input={input}
            needsApproval={preview?.discountNeedsApproval ?? false}
            onFieldErrors={setSaveErrors}
          />
        </aside>
      </div>
      {preview && (
        <Step index="06" title={t('sections.lines')}>
          <QuotationLines lines={preview.lines} totals={preview.totals} showMargin={showMargin} />
        </Step>
      )}
      {preview && (
        <div className="sticky bottom-3 z-20 flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-raised/95 px-4 py-3 shadow-e3 backdrop-blur lg:hidden">
          <span className="type-label text-ink-faint">{t('effectiveShort')}</span>
          <span className="type-title-lg text-ink tabular-nums">
            {formatInr(preview.totals.effectivePaise)}
          </span>
        </div>
      )}
    </motion.div>
  );
}

function Step({
  index,
  title,
  children,
}: {
  readonly index: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-5">
      <SectionHeading index={index} title={title} />
      {children}
    </section>
  );
}

function PricePlaceholder({ message }: { readonly message: string }) {
  return (
    <section className="oh-panel flex min-h-[22rem] flex-col items-start justify-end gap-4 rounded-[28px] p-7 shadow-e3">
      <span className="flex size-12 items-center justify-center rounded-full bg-on-panel/10 text-on-panel">
        <Calculator aria-hidden className="size-5" />
      </span>
      <p className="max-w-xs type-title-md text-on-panel">{message}</p>
    </section>
  );
}
