import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ControlRoomView } from '@/features/projects/control-room/control-room-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('projects.room');
  return { title: t('pageTitle') };
}

export default async function ProjectPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ControlRoomView projectId={id} />;
}
