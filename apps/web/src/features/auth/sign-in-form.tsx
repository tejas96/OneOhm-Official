'use client';

import { Button, cn, Field, IconButton, Input } from '@oneohm/design-system/web';
import { ArrowRight, CircleAlert, Eye, EyeOff, UserRound } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError, describeError } from '@/lib/api/api-error';

/**
 * Web sign-in: email, employee ID or mobile number, and a password (mobile apps use a
 * one-time code instead). Someone with no password yet is pointed to "First time here?".
 * Returns the person to where they were going.
 */
export function SignInForm() {
  const t = useTranslations('signIn.form');
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noPasswordYet, setNoPasswordYet] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setNoPasswordYet(false);
    setFieldErrors({});
    try {
      await expectStatus(
        api.auth.signIn({
          body: {
            identifier: String(data.get('identifier') ?? ''),
            password: String(data.get('password') ?? ''),
          },
        }),
        200,
      );
      const next = params.get('next');
      router.replace(next?.startsWith('/') ? next : '/');
      router.refresh();
    } catch (caught) {
      setError(describeError(caught));
      if (caught instanceof ApiError) {
        setFieldErrors({ ...caught.fieldErrors });
        setNoPasswordYet(caught.code === 'password_not_set');
      }
      setPending(false);
    }
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h2 className="type-display-lg text-ink">{t('title')}</h2>
        <p className="type-body text-ink-muted">{t('description')}</p>
      </header>

      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        <Field label={t('identifier')} hint={t('identifierHint')} error={fieldErrors.identifier}>
          <Input
            name="identifier"
            autoComplete="username"
            placeholder={t('identifierPlaceholder')}
            leading={<UserRound />}
          />
        </Field>
        <Field label={t('password')} error={fieldErrors.password}>
          <Input
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            trailing={
              <IconButton
                size="sm"
                label={showPassword ? t('hidePassword') : t('showPassword')}
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </IconButton>
            }
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          pending={pending}
          trailingIcon={<ArrowRight />}
        >
          {t('submit')}
        </Button>
        <AnimatePresence initial={false}>
          {error && (
            <motion.p
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 rounded-md bg-overdue-tint px-3 py-2.5 type-body-sm text-overdue"
            >
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        <Link
          href="/sign-in/set-password"
          className={cn(
            'self-center rounded-md px-1 py-1 text-center type-body-sm underline-offset-4 hover:underline',
            noPasswordYet ? 'font-medium text-accent' : 'text-ink-muted',
          )}
        >
          {t('firstTime')}
        </Link>
      </form>

      <p className="border-t border-hairline pt-5 type-body-sm text-ink-faint">{t('mobileNote')}</p>
    </div>
  );
}
