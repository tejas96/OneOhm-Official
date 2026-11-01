import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { CustomerDetailView } from '@/features/customers/customer-detail-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('customers');
  return { title: t('detailTitle') };
}

export default async function CustomerPage({ params }: PageProps<'/customers/[id]'>) {
  const { id } = await params;
  return (
    <Suspense>
      <CustomerDetailView id={id} />
    </Suspense>
  );
}
