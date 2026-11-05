'use client';

import type { SendOffer, SendScope } from '@oneohm/api-contracts';
import { Button, Sheet } from '@oneohm/design-system/web';
import { FilePlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { BankVisitOffer } from './bank-visit-offer';
import { type QuickPaper, QuickPapers } from './quick-papers';
import { OfferCard } from './send-offer-card';
import { useSendOptions } from './use-send-to-customer';

/** The offers of one kind under one heading, in the menu's order. */
function groupsOf(offers: readonly SendOffer[]): [string, SendOffer[]][] {
  const groups = new Map<string, SendOffer[]>();
  for (const offer of offers)
    groups.set(offer.action, [...(groups.get(offer.action) ?? []), offer]);
  return [...groups];
}

/**
 * "Send to customer" (redesign §18): what fits this place, each with a preview of exactly what
 * the customer gets and a Send button. Asking for papers opens the ask sheet.
 */
export function SendToCustomerSheet({
  scope,
  taskId,
  open,
  onClose,
  onAskPaper,
  quickPapers,
}: {
  readonly scope: SendScope;
  readonly taskId: string | null;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Present where papers can be asked (a project or a lead): the ask sheet opens. */
  readonly onAskPaper: (() => void) | null;
  /** Papers asked with one tap, such as the lender's list on a loan or the passbook on a subsidy step. */
  readonly quickPapers?: readonly QuickPaper[];
}) {
  const t = useTranslations('sendToCustomer');
  const options = useSendOptions(scope, open);
  const data = options.data;
  const askPaper = data?.canAskPaper && onAskPaper;
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('title')}
      description={t('description', { name: data?.customerName || '…' })}
    >
      <div className="flex flex-col gap-2 px-5 py-5 sm:px-6">
        {options.isPending && <ListSkeleton label={t('loading')} rows={3} />}
        {options.isError && <LoadError error={options.error} onRetry={() => options.refetch()} />}
        {data?.empty && <p className="type-body-sm text-ink-muted">{data.empty}</p>}
        {askPaper && (
          <div className="flex flex-col gap-2 border-b border-hairline pb-4">
            <span className="type-body-sm font-medium text-ink">{t('askPaper.title')}</span>
            <span className="type-body-sm text-ink-faint">{t('askPaper.detail')}</span>
            <Button
              size="sm"
              variant="secondary"
              className="self-start"
              leadingIcon={<FilePlus />}
              onClick={() => {
                onClose();
                askPaper();
              }}
            >
              {t('askPaper.title')}
            </Button>
          </div>
        )}
        {data && quickPapers && scope.projectId && (
          <QuickPapers
            scope={{ projectId: scope.projectId }}
            papers={quickPapers}
            onDone={onClose}
          />
        )}
        {data &&
          groupsOf(data.offers).map(([action, offers]) => (
            <section key={action} aria-label={t(`groups.${action}`)} className="flex flex-col">
              <h3 className="pt-3 type-label text-ink-faint uppercase">{t(`groups.${action}`)}</h3>
              <ul className="flex flex-col divide-y divide-hairline">
                {offers.map((offer) =>
                  offer.input === 'bank_visit' ? (
                    <BankVisitOffer key={offer.key} offer={offer} scope={scope} onSent={onClose} />
                  ) : (
                    <OfferCard
                      key={offer.key}
                      offer={offer}
                      scope={scope}
                      taskId={taskId}
                      onSent={onClose}
                    />
                  ),
                )}
              </ul>
            </section>
          ))}
        <div className="flex justify-end pt-2">
          <Button variant="quiet" onClick={onClose}>
            {t('close')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
