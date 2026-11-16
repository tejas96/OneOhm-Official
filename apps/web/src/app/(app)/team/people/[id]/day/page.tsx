import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { DayPage } from '@/features/live-map/day/day-page';
import { canSeeLiveMap } from '@/features/live-map/live-format';
import { currentUser } from '@/lib/api/server-session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('liveMap.day');
  return { title: t('title') };
}

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * A person's duty day (timeline, route and replay). Managers get it where it lives, over the
 * live map; anyone else who may read the route (an attendance viewer) gets it on its own.
 */
export default async function PersonDayPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ date?: string }>;
}) {
  const { id } = await params;
  const { date } = await searchParams;
  const user = await currentUser();
  const day = isDate(date) ? date : null;
  if (user && canSeeLiveMap(user))
    redirect(`/live?day=${encodeURIComponent(id)}${day ? `&date=${day}` : ''}`);
  return (
    <Suspense>
      <DayPage personId={id} date={day} />
    </Suspense>
  );
}
