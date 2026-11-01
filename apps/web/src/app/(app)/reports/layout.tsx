import { type ReactNode, Suspense } from 'react';
import { ReportsFrame } from '@/features/reports/frame/reports-frame';

/** The frame reads the filters from the address, so it renders inside Suspense. */
export default function ReportsLayout({ children }: { readonly children: ReactNode }) {
  return (
    <Suspense>
      <ReportsFrame>{children}</ReportsFrame>
    </Suspense>
  );
}
