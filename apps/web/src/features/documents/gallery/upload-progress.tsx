'use client';

/** How far an upload has gone: the words ("Uploading… 40%") over a thin bar. */
export function UploadProgress({
  percent,
  label,
}: {
  readonly percent: number;
  readonly label: string;
}) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <p className="type-body-sm text-ink-muted tabular-nums">{label}</p>
      <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-sunken">
        <span
          className="block h-full rounded-full bg-accent transition-[width] duration-(--duration-fast)"
          style={{ width: `${Math.max(4, percent)}%` }}
        />
      </span>
    </div>
  );
}
