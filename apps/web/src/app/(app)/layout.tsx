import type { ReactNode } from 'react';
import { MobileTopBar } from '@/features/shell/mobile-top-bar';
import { Sidebar } from '@/features/shell/sidebar';

export default function AppLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="oh-page-glow flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <main className="flex-1 px-4 py-6 sm:px-6 md:px-10 md:py-9">{children}</main>
      </div>
    </div>
  );
}
