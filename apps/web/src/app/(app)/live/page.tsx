import { EmptyState } from '@oneohm/design-system/web';
import { Lock } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { canSeeLiveMap } from '@/features/live-map/live-format';
import { LiveMapView } from '@/features/live-map/live-map-view';
import { currentUser } from '@/lib/api/server-session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('liveMap');
  return { title: t('title') };
}

/** The manager's live map: HR and anyone someone reports to. */
export default async function LivePage() {
  const user = await currentUser();
  if (!user || !canSeeLiveMap(user)) {
    const t = await getTranslations('liveMap');
    return (
      <EmptyState icon={<Lock />} title={t('noAccess.title')} description={t('noAccess.body')} />
    );
  }
  return (
    <Suspense>
      <LiveMapView />
    </Suspense>
  );
}
