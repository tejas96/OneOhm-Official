import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PaperworkView } from '@/features/projects/paperwork/paperwork-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('reports');
  return { title: t('title') };
}

/** Every project's statutory paperwork (PRD 3.18); business reports live under Reports. */
export default function PaperworkPage() {
  return <PaperworkView />;
}
