import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BrandPanel } from '@/features/auth/brand-panel';
import { SignInForm } from '@/features/auth/sign-in-form';
import { SunriseScene } from '@/features/auth/sunrise-scene';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('signIn');
  return { title: t('pageTitle') };
}

/** Wide screens: the solar-glass drawing beside the form. Phones: a sunrise sky, the form as a sheet. */
export default async function SignInPage() {
  const t = await getTranslations('signIn');
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <BrandPanel className="hidden lg:flex" />
      <SunriseScene className="lg:hidden" />
      <div className="relative z-10 -mt-7 flex flex-col items-center justify-between gap-6 rounded-t-[28px] bg-canvas px-6 pt-4 pb-10 shadow-[0_-18px_40px_-24px_rgb(5_52_77/0.35)] sm:px-10 lg:mt-0 lg:gap-10 lg:rounded-none lg:py-10 lg:shadow-none">
        <span aria-hidden className="h-1 w-10 rounded-full bg-rule lg:invisible" />
        <SignInForm />
        <p className="max-w-sm text-center type-body-sm text-ink-faint">{t('help')}</p>
      </div>
    </main>
  );
}
