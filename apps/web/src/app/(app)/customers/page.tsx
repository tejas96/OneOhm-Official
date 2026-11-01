import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomersView } from '@/features/customers/customers-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('customers');
  return { title: t('title') };
}

export default function CustomersPage() {
  return <CustomersView />;
}
