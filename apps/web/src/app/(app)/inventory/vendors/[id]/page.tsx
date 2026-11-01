import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { VendorProfileView } from '@/features/purchasing/vendors/vendor-profile-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('purchasing.profile');
  return { title: t('pageTitle') };
}

export default async function VendorPage({ params }: PageProps<'/inventory/vendors/[id]'>) {
  const { id } = await params;
  return (
    <Suspense>
      <VendorProfileView id={id} />
    </Suspense>
  );
}
