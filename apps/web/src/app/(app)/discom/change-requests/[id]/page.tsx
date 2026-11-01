import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChangeRequestView } from '@/features/discom/change-request-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('discom.request');
  return { title: t('pageTitle') };
}

export default async function ChangeRequestPage({
  params,
}: PageProps<'/discom/change-requests/[id]'>) {
  const { id } = await params;
  return <ChangeRequestView id={id} />;
}
