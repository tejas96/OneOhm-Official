import type { Session } from './http';
import { type Customer, createQuotation, discomId, today } from './sales';

/** A project sold on this property of the customer. */
export async function sellOn(admin: Session, customer: Customer, propertyId: string) {
  const quotation = await createQuotation(admin, { ...customer, propertyId });
  await admin.post(`/quotations/${quotation.id}/send`);
  await admin.post(`/quotations/${quotation.id}/accept`);
  return admin.post<{ id: string }>('/projects', {
    quotationId: quotation.id,
    discomId: await discomId(admin, 'MSEDCL'),
    loan: false,
    loanPaise: 0,
    battery: false,
    groundMount: false,
    startDate: today(),
    managerUserId: admin.userId,
  });
}

/** A second (or third) home: a new property of the customer with a project on it. */
export async function anotherHome(admin: Session, customer: Customer, label: string) {
  const property = await admin.post<{ id: string }>(
    `/customers/${customer.customerId}/properties`,
    {
      label,
      addressLine: '3 Canal Road (test)',
      city: 'Sangli',
      district: 'Sangli',
      state: 'Maharashtra',
      pincode: '416416',
      subsidyCategory: 'individual',
      floors: 1,
    },
  );
  const project = await sellOn(admin, customer, property.id);
  return { propertyId: property.id, projectId: project.id };
}
