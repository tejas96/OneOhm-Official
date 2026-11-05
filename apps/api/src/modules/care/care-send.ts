import type { SendOffer, SendRequest } from '@oneohm/api-contracts';
import { amcContracts, customerActions, homeNameOf, projects } from '@oneohm/database';
import { titleCaseName } from '@oneohm/shared';
import { and, eq, sql } from 'drizzle-orm';
import { conflict, notFound } from '../../common/http/errors';
import type { SendContext } from '../send-to-customer/send-context';
import type { Built } from '../send-to-customer/send-messages';
import { callerName, type Deps } from '../send-to-customer/send-papers';
import type { Composed } from '../send-to-customer/send-recorded';
import { talkTitle } from '../whatsapp/assistant/chat-words';
import { plainDate } from '../whatsapp/assistant/plain-date';
import { AMC_WORDS } from './amc-words';
import { careTaps } from './care-taps';
import { ratingList } from './rating-ask';
import { RATING_WORDS } from './rating-words';

type Of<A extends SendRequest['action']> = Extract<SendRequest, { action: A }>;
type Make = (
  key: string,
  label: string,
  detail: string,
  request: SendRequest,
) => Promise<SendOffer>;

/** The rating asks still waiting for this customer (a finished stage, a resolved problem). */
const pendingRatings = (deps: Deps, ctx: SendContext) =>
  deps.db
    .select()
    .from(customerActions)
    .where(
      and(
        eq(customerActions.customerId, ctx.customerId),
        eq(customerActions.type, 'rating'),
        eq(customerActions.status, 'open'),
      ),
    );

/** "Ask for a rating" only re-sends the one still waiting (redesign §13); it never makes a second. */
export async function ratingCompose(
  deps: Deps,
  ctx: SendContext,
  request: Of<'ask_rating'>,
): Promise<Composed> {
  const ask = (await pendingRatings(deps, ctx)).find((one) => one.id === request.actionId);
  if (!ask) throw conflict('There is no rating waiting to be asked again.', 'nothing_pending');
  const stage = String(ask.payload.stage ?? '');
  const question =
    ask.payload.kind === 'stage'
      ? RATING_WORDS.askStage(RATING_WORDS.stage[stage] ?? stage)
      : RATING_WORDS.askProblem(ask.title.replace(/^Rate: /, ''));
  const [project] = ask.projectId
    ? await deps.db
        .select({ code: projects.code })
        .from(projects)
        .where(eq(projects.id, ask.projectId))
    : [];
  const built: Built = {
    replies: [ratingList(ask.id, question)],
    template: {
      key: 'stage_rating_request',
      payload: {
        customer: titleCaseName(ctx.customerName),
        stage:
          ask.payload.kind === 'stage'
            ? (RATING_WORDS.stage[stage] ?? stage)
            : ask.title.replace(/^Rate: /, ''),
        stageKey: stage,
        project: project?.code ?? '',
        ratePayload: careTaps.rateGo(ask.id),
      },
    },
  };
  return {
    built,
    record: {
      kind: 'log',
      audit: 'customer.rating_asked_again',
      entity: 'customer_action',
      entityId: ask.id,
      log: 'Asked the customer for their pending rating again (WhatsApp)',
      projectId: ask.projectId,
      data: { customerActionId: ask.id },
    },
  };
}

export async function ratingOffers(deps: Deps, ctx: SendContext, make: Make): Promise<SendOffer[]> {
  const offers: SendOffer[] = [];
  for (const ask of await pendingRatings(deps, ctx))
    offers.push(
      await make(
        `rating:${ask.id}`,
        `Ask for the rating again: ${ask.title.replace(/^Rate: /, '')}`,
        'The customer taps 1 to 5 stars. Only the rating still waiting is sent.',
        { action: 'ask_rating', actionId: ask.id },
      ),
    );
  return offers;
}

/** The AMC contracts of this customer that are not cancelled and have not ended. */
async function contractsOf(deps: Deps, ctx: SendContext) {
  const rows = await deps.db
    .select({ contract: amcContracts, code: projects.code })
    .from(amcContracts)
    .innerJoin(projects, eq(projects.id, amcContracts.projectId))
    .where(
      and(
        eq(amcContracts.customerId, ctx.customerId),
        sql`${amcContracts.cancelledAt} is null`,
        ctx.projectId ? eq(amcContracts.projectId, ctx.projectId) : undefined,
        sql`${amcContracts.endsOn} >= current_date`,
      ),
    );
  return rows;
}

/** The renewal offer for one contract: the chat buttons, and the marketing template outside 24 hours. */
export async function amcRenewalCompose(
  deps: Deps,
  ctx: SendContext,
  request: Of<'amc_renewal'>,
  id: string,
): Promise<Composed> {
  const found = (await contractsOf(deps, ctx)).find(
    (one) => one.contract.id === request.contractId,
  );
  if (!found) throw notFound('That AMC');
  const { contract } = found;
  const home = await homeNameOf(deps.db, contract.projectId);
  const date = plainDate(contract.endsOn);
  const name = await callerName(deps.db, ctx);
  return {
    built: {
      replies: [
        {
          kind: 'buttons',
          body: AMC_WORDS.offer(home, date),
          buttons: [
            { id: careTaps.amcRenew(id), title: AMC_WORDS.renew },
            { id: careTaps.amcTalk(id), title: talkTitle(name) },
          ],
        },
      ],
      template: {
        key: 'amc_renewal_offer',
        payload: {
          customer: titleCaseName(ctx.customerName),
          home,
          date,
          renewPayload: careTaps.amcRenew(id),
          talkPayload: careTaps.amcTalk(id),
        },
      },
    },
    record: {
      kind: 'action',
      id,
      type: 'confirm',
      title: `AMC renewal — ${home}`,
      propertyId: null,
      projectId: contract.projectId,
      payload: {
        kind: 'amc_renewal',
        contractId: contract.id,
        endsOn: contract.endsOn,
        target: `amc_renewal:${contract.id}`,
      },
      log: `Offered the customer to renew the AMC (${contract.planName}, ends ${contract.endsOn})`,
    },
  };
}

export async function amcRenewalOffers(
  deps: Deps,
  ctx: SendContext,
  make: Make,
): Promise<SendOffer[]> {
  const offers: SendOffer[] = [];
  for (const { contract, code } of await contractsOf(deps, ctx))
    offers.push(
      await make(
        `amc:${contract.id}`,
        `Offer to renew the AMC (${contract.planName})`,
        `${code}: ends ${plainDate(contract.endsOn)}.`,
        { action: 'amc_renewal', contractId: contract.id },
      ),
    );
  return offers;
}
