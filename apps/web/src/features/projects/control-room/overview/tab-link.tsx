'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** A quiet "open the tab" link in a card header; it swaps the tab without scrolling. */
export function TabLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      replace
      className="inline-flex min-h-9 items-center gap-1 rounded-sm type-body-sm text-accent hover:underline"
    >
      {children}
      <ArrowRight aria-hidden className="size-3.5" />
    </Link>
  );
}
