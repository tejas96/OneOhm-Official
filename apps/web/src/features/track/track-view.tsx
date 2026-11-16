'use client';

import type { TrackView as Track } from '@oneohm/api-contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/api-client';
import { TrackMap } from './track-map';
import { TRACK_WORDS, type TrackLanguage, type TrackWords } from './track-words';

/** The page asks again this often, in milliseconds. */
const REFRESH_MS = 20_000;

type Loaded = { readonly found: true; readonly view: Track } | { readonly found: false };

async function readTrack(token: string): Promise<Loaded> {
  const response = await api.track.read({ params: { token } });
  if (response.status === 200) return { found: true, view: response.body };
  if (response.status === 404) return { found: false };
  throw new Error('Could not read the visit.');
}

/** The browser's language among English, Marathi and Hindi, until the visit says the customer's. */
function browserLanguage(): TrackLanguage {
  if (typeof navigator === 'undefined') return 'en';
  const code = navigator.language.slice(0, 2);
  return code === 'mr' || code === 'hi' ? code : 'en';
}

/** Minutes since the position was read, ticking each half minute. */
function useMinutesSince(at: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return at ? Math.max(0, Math.floor((now - Date.parse(at)) / 60_000)) : null;
}

/**
 * The customer's "Track live" page (Duty Day step 6), opened from the "on the way" WhatsApp
 * message with no sign-in. On the way: a small live map (the worker and the home) and "Ravi is
 * about 12 min away", refreshed every 20 seconds. Arrived or ended: a short line and no map.
 */
export function TrackPage({ token }: { readonly token: string }) {
  const query = useQuery({
    queryKey: ['track', token],
    queryFn: () => readTrack(token),
    refetchInterval: (state) =>
      state.state.data?.found && state.state.data.view.state === 'on_way' ? REFRESH_MS : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const loaded = query.data;
  const view = loaded?.found ? loaded.view : null;
  const words = TRACK_WORDS[view?.language ?? browserLanguage()];
  useEffect(() => {
    document.title = `${words.title} · OneOhm`;
  }, [words]);
  const onWay = view?.state === 'on_way' && view.maps.browserKey && (view.worker || view.home);
  return (
    <main className={`flex flex-col bg-canvas text-ink ${onWay ? 'h-dvh' : 'min-h-dvh'}`}>
      <section
        className={
          onWay
            ? 'relative min-h-[280px] flex-1 bg-sunken'
            : 'relative h-[34dvh] min-h-[180px] bg-[linear-gradient(180deg,var(--color-accent-soft)_0%,var(--color-energy-soft)_70%,var(--color-canvas)_100%)]'
        }
      >
        {onWay && view?.maps.browserKey && (
          <TrackMap
            browserKey={view.maps.browserKey}
            mapId={view.maps.mapId}
            worker={view.worker}
            home={view.home}
            label={words.map}
            homeLabel={words.you}
            workerName={view.workerName}
            initial={view.workerName.slice(0, 1).toUpperCase()}
          />
        )}
        {/* biome-ignore lint/performance/noImgElement: a static brand asset, already sized. */}
        <img
          src="/brand/oneohm-logo.webp"
          alt="OneOhm"
          width={112}
          height={28}
          className="absolute top-4 left-4 z-10 h-7 w-auto rounded-md bg-canvas/85 px-2 py-1 backdrop-blur-sm"
        />
      </section>
      {/* On the way the map takes the room and the card fits its words; otherwise the card does. */}
      <div
        className={`relative z-10 -mt-7 flex flex-col gap-3 rounded-t-[28px] bg-canvas px-6 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_-18px_40px_-24px_rgb(5_52_77/0.35)] ${onWay ? 'shrink-0' : 'flex-1'}`}
      >
        <span aria-hidden className="mx-auto h-1 w-10 rounded-full bg-rule" />
        <div className="mx-auto flex w-full max-w-md flex-col gap-3" aria-live="polite">
          <Sheet loaded={loaded} view={view} words={words} failed={query.isError} />
        </div>
      </div>
    </main>
  );
}

function Sheet({
  loaded,
  view,
  words,
  failed,
}: {
  readonly loaded: Loaded | undefined;
  readonly view: Track | null;
  readonly words: TrackWords;
  readonly failed: boolean;
}) {
  const since = useMinutesSince(view?.updatedAt ?? null);
  if (!loaded)
    return failed ? (
      <Said head={words.expired} line={words.offline} />
    ) : (
      <p className="type-body text-ink-muted">{words.loading}…</p>
    );
  if (!view) return <Said head={words.expired} line={words.expiredLine} />;
  if (view.state === 'arrived')
    return <Said head={words.arrived(view.workerName, view.homeLabel)} line={words.arrivedLine} />;
  if (view.state === 'ended') return <Said head={words.ended} line={words.endedLine} />;
  return (
    <>
      <p className="flex items-center gap-2 type-label text-accent">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full rounded-full bg-accent opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
        </span>
        {words.live}
      </p>
      <h1 className="type-display-md text-balance text-ink">
        {view.minutes !== null
          ? words.away(view.workerName, view.minutes)
          : words.coming(view.workerName)}
      </h1>
      <p className="type-body text-ink-muted">{words.to(view.homeLabel)}</p>
      <p className="type-body-sm text-ink-faint">
        {since === null ? words.waiting : since === 0 ? words.justNow : words.updated(since)}
      </p>
      {failed && <p className="type-body-sm text-overdue">{words.offline}</p>}
    </>
  );
}

function Said({ head, line }: { readonly head: string; readonly line: string }) {
  return (
    <>
      <h1 className="type-display-md text-balance text-ink">{head}</h1>
      <p className="type-body text-ink-muted">{line}</p>
    </>
  );
}
