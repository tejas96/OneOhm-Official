'use client';

import { Button } from '@oneohm/design-system/web';
import { FileCog } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCan } from '@/providers/current-user';
import { RaiseChangeRequestDialog } from './raise-change-request-dialog';

/** Raise a utility change request for this project's site, from the control room. */
export function ProjectChangeRequestButton({ projectId }: { readonly projectId: string }) {
  const t = useTranslations('discom');
  const canRaise = useCan('discom.manage', 'customers.manage');
  const [open, setOpen] = useState(false);
  if (!canRaise) return null;
  return (
    <>
      <Button size="sm" variant="quiet" leadingIcon={<FileCog />} onClick={() => setOpen(true)}>
        {t('raiseButton')}
      </Button>
      <RaiseChangeRequestDialog open={open} onOpenChange={setOpen} projectId={projectId} />
    </>
  );
}
