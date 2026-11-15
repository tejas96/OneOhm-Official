import { Globe, MessageCircle } from 'lucide-react';

export type Place = 'instagram' | 'facebook' | 'google' | 'whatsapp' | 'whatsapp_ad' | 'messenger';

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** The small icon for where an ad ran or a chat came from (lucide has no brand marks). */
export function PlaceIcon({
  place,
  className,
}: {
  readonly place: Place;
  readonly className?: string;
}) {
  if (place === 'instagram') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={className} {...STROKE}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
      </svg>
    );
  }
  if (place === 'facebook' || place === 'messenger') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={className} {...STROKE}>
        <circle cx="12" cy="12" r="9" />
        <path d="M13.5 20.9V13h2.6l.4-3h-3V8.2c0-.9.3-1.5 1.6-1.5h1.5V4.1" />
      </svg>
    );
  }
  if (place === 'google') return <Globe aria-hidden className={className} />;
  return <MessageCircle aria-hidden className={className} />;
}
