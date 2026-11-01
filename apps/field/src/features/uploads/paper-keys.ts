/** Query keys for the papers kept on a lead or a customer, refreshed when an upload lands. */
export const paperKeys = {
  lead: (leadId: string) => ['documents', 'lead', leadId] as const,
  customer: (customerId: string) => ['documents', 'customer', customerId] as const,
};
