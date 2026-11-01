import { customerInvoices, type DatabaseExecutor, projects } from '@oneohm/database';
import { and, desc, eq, ne } from 'drizzle-orm';

/** The customer's newest tax invoices. Cancelled ones are never shared (PRD 6.1). */
export function issuedInvoices(db: DatabaseExecutor, customerId: string, limit: number) {
  return db
    .select({
      id: customerInvoices.id,
      number: customerInvoices.number,
      totalPaise: customerInvoices.totalPaise,
    })
    .from(customerInvoices)
    .innerJoin(projects, eq(projects.id, customerInvoices.projectId))
    .where(
      and(
        eq(projects.customerId, customerId),
        ne(projects.status, 'cancelled'),
        eq(customerInvoices.status, 'issued'),
      ),
    )
    .orderBy(desc(customerInvoices.invoiceDate), desc(customerInvoices.createdAt))
    .limit(limit);
}

/** False once the invoice was cancelled, so an older link stops opening it. */
export async function stillIssued(db: DatabaseExecutor, invoiceId: string): Promise<boolean> {
  const [row] = await db
    .select({ status: customerInvoices.status })
    .from(customerInvoices)
    .where(eq(customerInvoices.id, invoiceId))
    .limit(1);
  return row?.status === 'issued';
}
