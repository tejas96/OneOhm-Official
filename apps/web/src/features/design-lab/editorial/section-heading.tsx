import type { ReactNode } from 'react';

/** Numbered section opener: mono index, serif title, a hairline running to the edge. */
export function SectionHeading({
  index,
  title,
  action,
}: {
  readonly index: string;
  readonly title: string;
  readonly action?: ReactNode;
}) {
  return (
    <header className="flex items-baseline gap-4">
      <span className="font-mono text-[0.8125rem] text-accent">{index}</span>
      <h2 className="type-display-md text-ink">{title}</h2>
      <span aria-hidden className="h-px flex-1 translate-y-[-0.35rem] bg-hairline" />
      {action}
    </header>
  );
}
