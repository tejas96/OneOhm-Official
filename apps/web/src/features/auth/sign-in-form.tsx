'use client';

import { Button, Field, IconButton, Input } from '@oneohm/design-system/web';
import { ArrowRight, Eye, EyeOff, Info, Mail } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

/**
 * Web sign-in: email or employee ID and a password (the requirements' rule for
 * the web; mobile apps use a one-time code). The API arrives in the next build
 * step, so for now the form says so plainly instead of pretending to sign in.
 */
export function SignInForm() {
  const t = useTranslations('signIn.form');
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(true);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h2 className="type-display-lg text-ink">{t('title')}</h2>
        <p className="type-body text-ink-muted">{t('description')}</p>
      </header>

      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        <Field label={t('identifier')} hint={t('identifierHint')}>
          <Input
            name="identifier"
            autoComplete="username"
            placeholder={t('identifierPlaceholder')}
            leading={<Mail />}
          />
        </Field>
        <Field label={t('password')}>
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
        <Button type="submit" variant="primary" size="lg" trailingIcon={<ArrowRight />}>
          {t('submit')}
        </Button>
        <AnimatePresence initial={false}>
          {notice && (
            <motion.p
              role="status"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 rounded-md bg-accent-soft px-3 py-2.5 type-body-sm text-on-accent-soft"
            >
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t('notConnected')}
            </motion.p>
          )}
        </AnimatePresence>
      </form>

      <p className="border-t border-hairline pt-5 type-body-sm text-ink-faint">{t('mobileNote')}</p>
    </div>
  );
}
