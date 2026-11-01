import type { Lead, Property } from '@oneohm/api-contracts';
import { unwrap } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/api/api';
import { useCan } from '@/session/session-provider';
import type { QuoteSite } from './quote-options';

/** A lead's site; a lead without one is priced from its category until the site is added. */
export function siteFromLead(lead: Lead, property?: Property): QuoteSite {
  return {
    propertyId: lead.propertyId,
    leadId: lead.id,
    title: lead.name,
    subtitle: property ? `${property.label} · ${property.city}` : lead.city,
    subsidyCategory: property?.subsidyCategory ?? lead.subsidyCategory,
    households: property?.households ?? null,
    floors: property?.floors ?? null,
  };
}

/** A site not on record yet: priced from the category alone (floors and size typed in). */
export function newSite(
  category: QuoteSite['subsidyCategory'],
  title: string,
  subtitle: string,
): QuoteSite {
  return {
    propertyId: null,
    leadId: null,
    title,
    subtitle,
    subsidyCategory: category,
    households: null,
    floors: null,
  };
}

export function siteFromProperty(customerName: string, property: Property): QuoteSite {
  return {
    propertyId: property.id,
    leadId: null,
    title: customerName,
    subtitle: `${property.label} · ${property.city}`,
    subsidyCategory: property.subsidyCategory,
    households: property.households,
    floors: property.floors,
  };
}

/**
 * The site being quoted. Opened from a lead (`?leadId=`) it starts on that lead's
 * property; people who can see customers also get the property's floors and households.
 */
export function useQuoteSite(leadId: string | undefined) {
  const canSeeCustomers = useCan('customers.view');
  const [site, setSite] = useState<QuoteSite | null>(null);
  const lead = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => unwrap(api.crm.getLead({ params: { id: leadId ?? '' } })),
    enabled: Boolean(leadId),
  });
  const customerId = lead.data?.customerId ?? null;
  const customer = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => unwrap(api.crm.getCustomer({ params: { id: customerId ?? '' } })),
    enabled: canSeeCustomers && Boolean(customerId),
  });
  // Each lead opened from a lead screen is applied once; picking another site later wins.
  const [applied, setApplied] = useState<string | undefined>();
  useEffect(() => {
    if (!lead.data || applied === leadId) return;
    if (canSeeCustomers && customerId && customer.isPending) return;
    const property = customer.data?.properties.find((item) => item.id === lead.data?.propertyId);
    setSite(siteFromLead(lead.data, property));
    setApplied(leadId);
  }, [lead.data, customer.data, customer.isPending, canSeeCustomers, customerId, applied, leadId]);
  return { site, setSite };
}
