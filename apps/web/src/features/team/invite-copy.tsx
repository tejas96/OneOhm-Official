'use client';

import { Button, Dialog, Textarea, useToast } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

/**
 * Copies the invite text. When the browser will not copy (no permission, or not a secure
 * page), a small dialog shows the text already selected, for the admin to copy by hand.
 */
export function useCopyInvite() {
  const t = useTranslations('team.invite');
  const toast = useToast();
  const [manual, setManual] = useState({ open: false, text: '' });

  const copy = useCallback(
    (text: string) => {
      const byHand = () => setManual({ open: true, text });
      try {
        navigator.clipboard
          .writeText(text)
          .then(() => toast({ title: t('copied'), tone: 'success' }), byHand);
      } catch {
        byHand();
      }
    },
    [t, toast],
  );

  const dialog = (
    <Dialog
      open={manual.open}
      onOpenChange={(open) => setManual((current) => ({ ...current, open }))}
      title={t('copyTitle')}
      description={t('copyHint')}
      autoFocusField
      footer={
        <Button
          variant="primary"
          onClick={() => setManual((current) => ({ ...current, open: false }))}
        >
          {t('copyDone')}
        </Button>
      }
    >
      <Textarea
        readOnly
        value={manual.text}
        rows={4}
        aria-label={t('copyText')}
        onFocus={(event) => event.currentTarget.select()}
      />
    </Dialog>
  );

  return { copy, dialog };
}
