import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BentoView } from '@/features/design-lab/bento/bento-view';
import { CircuitView } from '@/features/design-lab/circuit/circuit-view';
import { EditorialView } from '@/features/design-lab/editorial/editorial-view';
import { isLabVariant } from '@/features/design-lab/lab-variants';

export const metadata: Metadata = { title: 'Design lab' };

export default async function LabPage({
  params,
}: {
  readonly params: Promise<{ variant: string }>;
}) {
  const { variant } = await params;
  if (!isLabVariant(variant)) notFound();
  if (variant === 'circuit') return <CircuitView />;
  if (variant === 'editorial') return <EditorialView />;
  return <BentoView />;
}
