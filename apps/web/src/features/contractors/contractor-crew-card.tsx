'use client';

import type { ContractorDetail } from '@oneohm/api-contracts';
import { Avatar, Badge, Button, Checkbox, Dialog, useToast } from '@oneohm/design-system/web';
import { Crown, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { formatPhone, swatchFor } from '@/lib/format/contact';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useCrewCandidates, useRefreshContractors } from './use-contractors';

/** The people who work for this contractor; the lead receives the work orders. */
export function ContractorCrewCard({ contractor }: { readonly contractor: ContractorDetail }) {
  const t = useTranslations('contractors.crew');
  const [editing, setEditing] = useState(false);
  return (
    <section className="flex flex-col gap-4 rounded-[28px] bg-raised p-6 shadow-e1 ring-1 ring-hairline/70">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 type-title-md text-ink">
          <UsersRound aria-hidden className="size-4 text-ink-faint" />
          {t('title')}
        </h2>
        <Button size="sm" variant="quiet" onClick={() => setEditing(true)}>
          {t('edit')}
        </Button>
      </div>
      {contractor.members.length === 0 ? (
        <p className="type-body-sm text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {contractor.members.map((member) => (
            <li key={member.userId} className="flex items-center gap-3 py-2.5">
              <Avatar name={member.fullName} swatch={swatchFor(member.userId)} size="sm" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate type-body-sm font-medium text-ink">
                  {member.fullName}
                </span>
                {member.phone && (
                  <span className="font-mono text-[0.75rem] text-ink-faint">
                    {formatPhone(member.phone)}
                  </span>
                )}
              </span>
              {member.lead && (
                <Badge variant="accent">
                  <Crown aria-hidden className="size-3" />
                  {t('lead')}
                </Badge>
              )}
              {!member.active && <Badge>{t('inactive')}</Badge>}
            </li>
          ))}
        </ul>
      )}
      <CrewDialog contractor={contractor} open={editing} onOpenChange={setEditing} />
    </section>
  );
}

function CrewDialog({
  contractor,
  open,
  onOpenChange,
}: {
  readonly contractor: ContractorDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('contractors.crew');
  const toast = useToast();
  const refresh = useRefreshContractors();
  const form = useApiForm();
  const candidates = useCrewCandidates(open);
  const [chosen, setChosen] = useState<string[]>(() => contractor.members.map((m) => m.userId));
  const [lead, setLead] = useState<string | null>(
    () => contractor.members.find((m) => m.lead)?.userId ?? null,
  );
  const available = (candidates.data ?? []).filter(
    (person) => person.contractorId === null || person.contractorId === contractor.id,
  );

  const save = async () => {
    const leadId = lead && chosen.includes(lead) ? lead : chosen[0];
    await form.run(
      () =>
        expectStatus(
          api.contractors.setContractorMembers({
            params: { id: contractor.id },
            body: { members: chosen.map((userId) => ({ userId, lead: userId === leadId })) },
          }),
          200,
        ),
      async () => {
        await refresh();
        toast({ tone: 'success', title: t('saved') });
        onOpenChange(false);
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('dialogTitle')}
      description={t('dialogDescription')}
      footer={
        <Button variant="primary" pending={form.pending} onClick={save}>
          {t('save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {candidates.data && available.length === 0 && (
          <p className="type-body-sm text-ink-muted">{t('noCandidates')}</p>
        )}
        {available.map((person) => {
          const selected = chosen.includes(person.userId);
          return (
            <div
              key={person.userId}
              className="flex items-center justify-between gap-3 rounded-lg border border-hairline px-3 py-2"
            >
              <Checkbox
                label={person.fullName}
                description={person.roleNames.join(', ')}
                checked={selected}
                onCheckedChange={(checked) =>
                  setChosen((current) =>
                    checked
                      ? [...current, person.userId]
                      : current.filter((id) => id !== person.userId),
                  )
                }
              />
              {selected && (
                <Button
                  size="sm"
                  variant={lead === person.userId ? 'primary' : 'quiet'}
                  leadingIcon={<Crown />}
                  onClick={() => setLead(person.userId)}
                >
                  {t('lead')}
                </Button>
              )}
            </div>
          );
        })}
        <FormError message={form.error} />
      </div>
    </Dialog>
  );
}
