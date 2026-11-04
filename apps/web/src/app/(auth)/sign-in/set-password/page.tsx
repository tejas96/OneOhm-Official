import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthShell } from '@/features/auth/auth-shell';
import { SetPasswordForm } from '@/features/auth/set-password-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('signIn.setPassword');
  return { title: t('pageTitle') };
}

/** First sign-in and forgot password: one flow, proven with a texted code. */
export default function SetPasswordPage() {
  return (
    <AuthShell>
      <SetPasswordForm />
    </AuthShell>
  );
}
