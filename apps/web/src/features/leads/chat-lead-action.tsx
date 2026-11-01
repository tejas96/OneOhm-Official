'use client';

import { Button } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { Target, UserRoundPlus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCan } from '@/providers/current-user';
import { LeadCreateDialog } from './lead-create-dialog';

/**
 * A WhatsApp chat with a number we do not know: open its lead, or make one from the chat
 * (PRD 3.3: WhatsApp lead capture). Only for people who manage leads.
 */
export function ChatLeadAction({ name, phone }: { readonly name: string; readonly phone: string }) {
  const t = useTranslations('leads.chat');
  const canManage = useCan('leads.manage');
  const [creating, setCreating] = useState(false);
  const match = useQuery({
    queryKey: ['leads', 'match', phone],
    queryFn: () => expectStatus(api.leadIntake.matchPhone({ query: { phone } }), 200),
    enabled: canManage,
    staleTime: 30_000,
  });
  if (!canManage || !match.data) return null;
  const open = match.data.openLead;
  if (open) {
    return (
      <Button asChild size="sm" variant="quiet" leadingIcon={<Target />}>
        <Link href={`/leads/${open.id}`}>{t('openLead')}</Link>
      </Button>
    );
  }
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={<UserRoundPlus />}
        onClick={() => setCreating(true)}
      >
        {t('createLead')}
      </Button>
      <LeadCreateDialog
        open={creating}
        onOpenChange={setCreating}
        initial={{ name, phone, source: 'whatsapp' }}
      />
    </>
  );
}
