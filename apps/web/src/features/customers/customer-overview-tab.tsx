'use client';

import { useTranslations } from 'next-intl';
import { SectionHeading } from '@/features/command-center/section-heading';
import { ContactSection } from './contact/contact-section';
import { CustomerProperties } from './customer-properties';
import { CustomerProjects, CustomerQuotations } from './customer-records';
import type { CustomerRecord } from './customer-tabs';
import { CustomerLanguageSetting } from './language/customer-language';

/** Who they are on paper: every site, project and quotation, and how we reach them. */
export function CustomerOverviewTab({ customer }: { readonly customer: CustomerRecord }) {
  const t = useTranslations('customers.sections');
  return (
    <div className="flex flex-col gap-10">
      <section aria-label={t('properties')} className="flex flex-col gap-5">
        <SectionHeading index="01" title={t('properties')} />
        <CustomerProperties properties={customer.properties} />
      </section>
      <section aria-label={t('projects')} className="flex flex-col gap-5">
        <SectionHeading index="02" title={t('projects')} />
        <CustomerProjects projects={customer.projects} />
      </section>
      <section aria-label={t('quotations')} className="flex flex-col gap-5">
        <SectionHeading index="03" title={t('quotations')} />
        <CustomerQuotations quotations={customer.quotations} />
      </section>
      <section aria-label={t('contact')} className="flex flex-col gap-5">
        <SectionHeading index="04" title={t('contact')} />
        <ContactSection customerId={customer.id} />
        <CustomerLanguageSetting customerId={customer.id} />
      </section>
    </div>
  );
}
