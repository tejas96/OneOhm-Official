import type { ReactNode } from 'react';
import { MobileTopBar } from '@/features/shell/mobile-top-bar';
import { Sidebar } from '@/features/shell/sidebar';

export default function AppLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col md:py-2 md:pr-2">
        <MobileTopBar />
        <main className="flex-1 bg-surface px-4 py-6 sm:px-6 md:rounded-2xl md:border md:border-hairline md:px-10 md:py-9 md:shadow-e1">
          {children}
        </main>
      </div>
    </div>
  );
}
