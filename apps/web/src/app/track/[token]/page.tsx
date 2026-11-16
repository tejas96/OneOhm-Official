import type { Metadata } from 'next';
import { TrackPage } from '@/features/track/track-view';

export const metadata: Metadata = {
  title: 'Your visit',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/** The customer's "Track live" page (Duty Day step 6): public, outside the signed-in layout. */
export default async function TrackRoute({ params }: PageProps<'/track/[token]'>) {
  const { token } = await params;
  return <TrackPage token={token} />;
}
