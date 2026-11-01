import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { isLabVariant, LAB_VARIANTS } from '@/features/design-lab/lab-variants';
import { MobileTopBar } from '@/features/shell/mobile-top-bar';
import { Sidebar } from '@/features/shell/sidebar';

export function generateStaticParams() {
  return LAB_VARIANTS.map((variant) => ({ variant: variant.id }));
}

export const dynamicParams = false;

/** Design lab: each command-centre alternative with its own sidebar treatment. */
export default async function LabLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ variant: string }>;
}) {
  const { variant } = await params;
  if (!isLabVariant(variant)) notFound();
  const look = LAB_VARIANTS.find((entry) => entry.id === variant)?.sidebar ?? 'ink';
  return (
    <div className="oh-page-glow flex min-h-dvh">
      <Sidebar look={look} activeHref={`/lab/${variant}`} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <main className="flex-1 px-4 py-6 sm:px-6 md:px-10 md:py-9">{children}</main>
      </div>
    </div>
  );
}
