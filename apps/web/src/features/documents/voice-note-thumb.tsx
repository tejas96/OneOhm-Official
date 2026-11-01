'use client';

import { cn } from '@oneohm/design-system/web';
import { Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { documentUrl } from '@/lib/api/upload';

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/**
 * A voice note on a task or a service visit: one tap plays it right in the tile, with
 * how far it has got. Only the start of the file is read until it plays.
 */
export function VoiceNoteThumb({ id, name }: { readonly id: string; readonly name: string }) {
  const t = useTranslations('documents.media');
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState<number | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (element.paused) void element.play().catch(() => setPlaying(false));
    else element.pause();
  };
  const progress = length ? Math.min(1, at / length) : 0;
  return (
    <span className="flex size-full flex-col items-center justify-center gap-2 px-2 text-center">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t('pause', { name }) : t('play', { name })}
        aria-pressed={playing}
        className={cn(
          'flex size-11 items-center justify-center rounded-full transition-colors',
          playing
            ? 'bg-accent text-on-accent'
            : 'bg-accent-soft text-on-accent-soft hover:bg-accent/25',
        )}
      >
        {playing ? (
          <Pause aria-hidden className="size-4 fill-current" />
        ) : (
          <Play aria-hidden className="ml-0.5 size-4 fill-current" />
        )}
      </button>
      <span className="type-label text-ink-muted tabular-nums">
        {playing || at > 0 ? clock(at) : length ? clock(length) : t('voiceNote')}
      </span>
      <span aria-hidden className="h-1 w-3/4 overflow-hidden rounded-full bg-hairline">
        <span
          className="block h-full rounded-full bg-accent"
          style={{ width: `${progress * 100}%` }}
        />
      </span>
      {/* biome-ignore lint/a11y/useMediaCaption: a voice note's words are the note itself. */}
      <audio
        ref={audio}
        preload="metadata"
        src={documentUrl(id)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setAt(0);
        }}
        onTimeUpdate={(event) => setAt(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration;
          setLength(Number.isFinite(seconds) ? seconds : null);
        }}
        className="hidden"
      />
    </span>
  );
}
