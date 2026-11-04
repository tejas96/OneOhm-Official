import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AuthShell } from '@/features/auth/auth-shell';
import { SignInForm } from '@/features/auth/sign-in-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('signIn');
  return { title: t('pageTitle') };
}

export default async function SignInPage() {
  const t = await getTranslations('signIn');
  return (
    <AuthShell footer={t('help')}>
      <Suspense>
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}
