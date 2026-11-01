'use client';

import { formatKwp } from '@oneohm/shared';
import { FileText, SolarPanel, Target, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useAllowedNavigation } from '@/features/shell/use-navigation';
import { formatPhone } from '@/lib/format/contact';
import { haystackOf, normalise, type SearchEntry } from './search-index';
import { type SearchRecords, useSearchRecords } from './use-search-records';

/** Joins the parts of a second line that are present. */
function line(...parts: readonly (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(' · ');
}

function keysOf(...values: readonly (string | null | undefined)[]): string[] {
  return values.filter((value): value is string => Boolean(value)).map(normalise);
}

/** The pages this person may open, as palette entries. */
function usePageEntries(): SearchEntry[] {
  const t = useTranslations('nav');
  const groups = useAllowedNavigation();
  return useMemo(
    () =>
      groups.flatMap((group) =>
        group.items
          .filter((item) => item.built)
          .map((item) => {
            const title = t(`items.${item.key}`);
            const groupName = group.key ? t(`groups.${group.key}`) : '';
            return {
              id: `pages:${item.key}`,
              group: 'pages' as const,
              title,
              detail: groupName,
              href: item.href,
              icon: item.icon,
              haystack: haystackOf([title, groupName, item.key]),
              keys: keysOf(title),
            };
          }),
      ),
    [groups, t],
  );
}

type Translate = ReturnType<typeof useTranslations>;

function projectEntries(records: SearchRecords): SearchEntry[] {
  // The project list carries no customer; its quotation does, when the person may see quotations.
  const customerOf = new Map(
    records.quotations.flatMap((quotation) =>
      quotation.projectId ? [[quotation.projectId, quotation.customer.name] as const] : [],
    ),
  );
  return records.projects.map((project) => {
    const customer = customerOf.get(project.id);
    const sameAsName = customer && normalise(customer) === normalise(project.name);
    return {
      id: `projects:${project.id}`,
      group: 'projects',
      title: project.name,
      detail: line(project.code, !sameAsName && customer, project.place),
      href: `/projects/${project.id}`,
      icon: SolarPanel,
      haystack: haystackOf([project.code, project.name, customer, project.place]),
      keys: keysOf(project.code, project.name, customer),
    };
  });
}

function customerEntries(records: SearchRecords, t: Translate): SearchEntry[] {
  return records.customers.map((customer) => ({
    id: `customers:${customer.id}`,
    group: 'customers',
    title: customer.name,
    detail: line(
      formatPhone(customer.phone),
      customer.projectCount > 0 && t('projectCount', { count: customer.projectCount }),
    ),
    href: `/customers/${customer.id}`,
    icon: Users,
    haystack: haystackOf([customer.name, customer.phone, customer.email]),
    keys: keysOf(customer.name),
  }));
}

function leadEntries(records: SearchRecords, stage: (key: string) => string): SearchEntry[] {
  return records.leads.map((lead) => ({
    id: `leads:${lead.id}`,
    group: 'leads',
    title: lead.name,
    detail: line(stage(lead.stage), lead.city, formatPhone(lead.phone)),
    href: `/leads/${lead.id}`,
    icon: Target,
    haystack: haystackOf([lead.name, lead.phone, lead.city, lead.email]),
    keys: keysOf(lead.name),
  }));
}

function quotationEntries(
  records: SearchRecords,
  t: Translate,
  status: (key: string) => string,
): SearchEntry[] {
  // Replaced revisions stay on the quotation screen; search leads to the live one.
  return records.quotations
    .filter((quotation) => quotation.status !== 'superseded')
    .map((quotation) => ({
      id: `quotations:${quotation.id}`,
      group: 'quotations',
      title:
        quotation.revision > 1
          ? line(quotation.number, t('revision', { revision: quotation.revision }))
          : quotation.number,
      detail: line(
        quotation.customer.name,
        status(quotation.status),
        formatKwp(quotation.capacityWp),
      ),
      href: `/quotations/${quotation.id}`,
      icon: FileText,
      haystack: haystackOf([quotation.number, quotation.customer.name, quotation.propertyLabel]),
      keys: keysOf(quotation.number, quotation.customer.name),
    }));
}

export interface SearchSource {
  readonly entries: readonly SearchEntry[];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly searchable: boolean;
}

/** Everything the palette can find: the person's pages and the records they may open. */
export function useSearchEntries(): SearchSource {
  const t = useTranslations('search');
  const tLeads = useTranslations('leads');
  const tQuotations = useTranslations('quotations');
  const pages = usePageEntries();
  const records = useSearchRecords();
  const entries = useMemo(
    () => [
      ...pages,
      ...projectEntries(records),
      ...customerEntries(records, t),
      ...leadEntries(records, (key) => tLeads(`stage.${key}`)),
      ...quotationEntries(records, t, (key) => tQuotations(`status.${key}`)),
    ],
    [pages, records, t, tLeads, tQuotations],
  );
  return {
    entries,
    loading: records.loading,
    failed: records.failed,
    searchable: records.searchable,
  };
}
