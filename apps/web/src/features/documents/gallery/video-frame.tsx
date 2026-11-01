'use client';

import { cn } from '@oneohm/design-system/web';
import { Play } from 'lucide-react';

/**
 * A video's first frame as a still, with a quiet play badge. Only the start of the file
 * is read (`preload="metadata"`), so a grid of videos stays light.
 */
export function VideoFrame({
  src,
  onFailed,
  className,
  badge = 'md',
}: {
  readonly src: string;
  readonly onFailed: () => void;
  readonly className?: string;
  readonly badge?: 'sm' | 'md';
}) {
  return (
    <span className={cn('relative block size-full bg-sunken', className)}>
      <video
        muted
        playsInline
        preload="metadata"
        src={`${src}#t=0.1`}
        onError={onFailed}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none size-full object-cover"
      />
      <span
        aria-hidden
        className={cn(
          'absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-canvas/85 text-ink shadow-e1 backdrop-blur',
          badge === 'sm' ? 'size-8' : 'size-11',
        )}
      >
        <Play
          className={cn('fill-current', badge === 'sm' ? 'ml-0.5 size-3.5' : 'ml-0.5 size-4')}
        />
      </span>
    </span>
  );
}
