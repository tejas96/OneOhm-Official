'use client';

import type { TravelClaim } from '@oneohm/api-contracts';
import { Button, Sheet, useToast } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { Ban, Check, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DecideDialog } from '@/features/team/decide-dialog';
import { useCurrentUser } from '@/providers/current-user';
import { useSiteFormat } from '../site-format';
import { DayVisits, Route, Section } from './claim-route';
import { ClaimStatus } from './claim-status';
import { canDecideClaim, canVoidClaim, useDecideClaim } from './use-travel';
import { VoidClaimDialog } from './void-claim-dialog';

/** Close, plus Void, Decline and Approve for those who may (S9, S10). */
function ClaimActions({
  claim,
  onClose,
  onDecide,
  onVoid,
}: {
  readonly claim: TravelClaim | null;
  readonly onClose: () => void;
  readonly onDecide: (approve: boolean) => void;
  readonly onVoid: () => void;
}) {
  const t = useTranslations('siteActivity.sheet');
  const me = useCurrentUser();
  return (
    <>
      <Button variant="quiet" onClick={onClose}>
        {t('close')}
      </Button>
      {claim && canVoidClaim(claim) && (
        <Button leadingIcon={<Ban />} onClick={onVoid}>
          {t('void')}
        </Button>
      )}
      {claim && canDecideClaim(claim) && claim.user.id !== me.id && (
        <>
          <Button leadingIcon={<X />} onClick={() => onDecide(false)}>
            {t('decline')}
          </Button>
          <Button variant="primary" leadingIcon={<Check />} onClick={() => onDecide(true)}>
            {t('approve')}
          </Button>
        </>
      )}
    </>
  );
}

/** A claim in full: the route, the site check-ins behind it, and the decision (PRD 4.3). */
export function ClaimSheet({
  claim,
  onClose,
}: {
  readonly claim: TravelClaim | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('siteActivity');
  const format = useSiteFormat();
  const toast = useToast();
  const me = useCurrentUser();
  const decide = useDecideClaim();
  const [deciding, setDeciding] = useState<boolean | null>(null);
  const [voiding, setVoiding] = useState(false);
  const own = claim?.user.id === me.id;
  const pending = claim?.status === 'pending';
  // The server says who may decide: the person's manager, HR or finance, never the person (S10).
  const total = claim
    ? t('claims.totalLine', {
        distance: format.distance(claim.distanceM),
        rate: formatInr(claim.ratePaisePerKm),
        amount: formatInr(claim.amountPaise),
      })
    : '';

  return (
    <Sheet
      open={claim !== null}
      onOpenChange={(open) => !open && onClose()}
      title={claim ? t('sheet.title', { day: format.day(claim.workDate) }) : ''}
      description={claim?.user.fullName}
      header={
        claim ? (
          <div className="flex">
            <ClaimStatus claim={claim} />
          </div>
        ) : undefined
      }
      footer={
        <ClaimActions
          claim={claim}
          onClose={onClose}
          onDecide={setDeciding}
          onVoid={() => setVoiding(true)}
        />
      }
    >
      {claim && (
        <div className="flex flex-col gap-7 px-5 py-6 sm:px-6">
          <div className="flex flex-col gap-1">
            <p className="type-title-md text-ink tabular-nums">{total}</p>
            {claim.project ? (
              <Link
                href={`/projects/${claim.project.id}`}
                className="self-start type-body-sm text-accent hover:underline"
              >
                {t('sheet.project', { code: claim.project.code })}
              </Link>
            ) : (
              <p className="type-body-sm text-ink-faint">{t('sheet.noProject')}</p>
            )}
          </div>
          {claim.note && <p className="type-body-sm text-ink-muted">“{claim.note}”</p>}
          {pending && own && <p className="type-body-sm text-ink-faint">{t('sheet.ownClaim')}</p>}
          <Section title={t('sheet.legs')} hint={t('sheet.legsHint')}>
            <Route claim={claim} />
          </Section>
          <Section title={t('sheet.visits')}>
            <DayVisits claimId={claim.id} />
          </Section>
          {claim.decidedBy && (
            <div className="flex flex-col gap-1 type-body-sm text-ink-muted">
              <p>{t('sheet.decided', { name: claim.decidedBy.fullName })}</p>
              {claim.decisionNote && <p>{t('sheet.decisionNote', { note: claim.decisionNote })}</p>}
              {claim.paidOn && <p>{t('sheet.paidOn', { date: format.day(claim.paidOn) })}</p>}
              {claim.voidedAt && claim.voidReason && (
                <p>{t('sheet.voided', { reason: claim.voidReason })}</p>
              )}
              {claim.payableId && (
                <Link
                  href="/finance?tab=payables"
                  className="self-start text-accent hover:underline"
                >
                  {t('sheet.payable')}
                </Link>
              )}
            </div>
          )}
        </div>
      )}
      <VoidClaimDialog
        claim={voiding ? claim : null}
        onClose={() => setVoiding(false)}
        onDone={() => {
          setVoiding(false);
          onClose();
        }}
      />
      <DecideDialog
        target={
          claim && deciding !== null
            ? {
                approve: deciding,
                title: t('claims.dialogTitle', {
                  name: claim.user.fullName,
                  day: format.day(claim.workDate),
                }),
                summary: (
                  <div className="flex flex-col gap-2">
                    <p className="type-body text-ink">{total}</p>
                    <p className="type-body-sm text-ink-muted">
                      {t('claims.approveNote', { amount: formatInr(claim.amountPaise) })}
                    </p>
                  </div>
                ),
              }
            : null
        }
        onClose={() => setDeciding(null)}
        onDecide={async (approve, note) => {
          if (!claim) return;
          const decided = await decide(claim.id, approve, note);
          toast({
            title: approve ? t('claims.approved') : t('claims.declined'),
            description: approve ? t('claims.approvedBody') : undefined,
            reference: decided.user.fullName,
            tone: 'success',
          });
          onClose();
        }}
      />
    </Sheet>
  );
}
