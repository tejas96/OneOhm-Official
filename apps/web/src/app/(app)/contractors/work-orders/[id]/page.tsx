import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { WorkOrderView } from '@/features/contractors/work-order-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contractors.workOrder');
  return { title: t('pageTitle') };
}

export default async function WorkOrderPage({
  params,
}: PageProps<'/contractors/work-orders/[id]'>) {
  const { id } = await params;
  return <WorkOrderView id={id} />;
}
