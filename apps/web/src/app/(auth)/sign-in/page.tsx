import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BrandPanel } from '@/features/auth/brand-panel';
import { SignInForm } from '@/features/auth/sign-in-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('signIn');
  return { title: t('pageTitle') };
}

export default async function SignInPage() {
  const t = await getTranslations('signIn');
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <BrandPanel />
      <div className="flex flex-col items-center justify-between gap-10 px-6 py-10 sm:px-10">
        <span aria-hidden />
        <SignInForm />
        <p className="max-w-sm text-center type-body-sm text-ink-faint">{t('help')}</p>
      </div>
    </main>
  );
}
