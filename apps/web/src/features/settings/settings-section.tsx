import type { ReactNode } from 'react';

/** A settings group: serif title and note on the left, its fields on the right. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <section className="grid gap-6 border-t border-hairline pt-8 first:border-t-0 first:pt-0 md:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-1">
        <h2 className="type-title-lg font-normal text-ink [font-family:var(--font-display)]">
          {title}
        </h2>
        {description && <p className="type-body-sm text-ink-faint">{description}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </section>
  );
}
