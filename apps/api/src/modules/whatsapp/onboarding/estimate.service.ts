import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Product, quotationPreviewInputSchema } from '@oneohm/api-contracts';
import { leadEstimates, readBusinessSetting, type Transaction } from '@oneohm/database';
import {
  type OnboardAnswers,
  type PricingInputs,
  pricingInputsFor,
  savingAndPayback,
  suggestInverterMix,
  suggestPanel,
} from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { CatalogService } from '../../catalog/catalog.service';
import { updateLeadFromChat } from '../../crm/lead-from-chat';
import { logLead } from '../../crm/lead-history';
import {
  type PricedQuotation,
  QuotationPricingService,
} from '../../quotations/quotation-pricing.service';
import type { EstimateSnapshot } from '../../reports/estimate-pdf.service';
import { HandOverService } from '../assistant/hand-over';
import { type Conversation, queueReply } from '../chat-store';
import { sharedFileUrl } from '../file-links';
import { ONBOARD_WORDS } from './onboard-words';
import { type QuestionView, question } from './onboarding-replies';

type ExpertReason =
  | Extract<PricingInputs, { kind: 'expert' }>['reason']
  | 'no_panel'
  | 'no_inverter'
  | 'pricing_failed';

/** Why staff price it by hand, in the words of the lead's next action. */
const REASON: Record<ExpertReason, string> = {
  farm: 'farm site',
  society: 'housing society',
  roof_other: 'other roof',
  large_bill: 'bill over the last band',
  missing: 'answers missing',
  no_panel: 'no active panel in the catalog',
  no_inverter: 'no active inverter in the catalog',
  pricing_failed: 'the price could not be worked out',
};

export type EstimateResult =
  | {
      readonly kind: 'sent';
      readonly estimateId: string;
      readonly size: string;
      readonly price: string;
      readonly after: string;
    }
  | { readonly kind: 'expert'; readonly reason: ExpertReason };

/** "3 kW", "3.3 kW": the size as the customer and the owner read it. */
const kw = (watts: number) => `${Number((watts / 1000).toFixed(2))} kW`;

/** On-grid models before hybrid ones at the same rating, then the cheaper. */
const onGridFirst = (inverters: readonly Product[]) =>
  inverters
    .filter((product) => product.active && product.ratedW)
    .sort(
      (left, right) =>
        (left.ratedW ?? 0) - (right.ratedW ?? 0) ||
        Number(/hybrid/i.test(left.name)) - Number(/hybrid/i.test(right.name)) ||
        left.pricePaise - right.pricePaise,
    )
    .map((product) => ({ id: product.id, ratedW: product.ratedW ?? 0 }));

/**
 * The instant estimate at the end of onboarding (Part 3): the answers priced by the real
 * pricing engine, kept on the lead and sent as a PDF with next steps. A site the engine
 * cannot price (a farm, a society, missing products, any pricing error) gets no number,
 * only an expert; the lead's next action is today either way.
 */
@Injectable()
export class EstimateService {
  private readonly log = new Logger('Estimate');

  constructor(
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly pricing: QuotationPricingService,
    private readonly catalog: CatalogService,
    private readonly people: HandOverService,
  ) {}

  /**
   * Prices the answers and writes the result on the lead in `tx`: an estimate row, the
   * move to contacted with its note, and a call today. Never throws for a site it
   * cannot price; that is the expert result, with the reason on the lead.
   */
  async make(tx: Transaction, leadId: string, answers: OnboardAnswers): Promise<EstimateResult> {
    const settings = await readBusinessSetting(tx, 'onboarding');
    const inputs = pricingInputsFor(answers, settings);
    if (inputs.kind === 'expert') return this.expert(tx, leadId, inputs.reason);
    const panels = await this.catalog.products('panel');
    const chosen = settings.panelProductIds[inputs.subsidyCategory];
    // The owner's panel only while it is on sale; otherwise the suggested one.
    const panel =
      panels.find((product) => product.id === chosen && product.active) ??
      suggestPanel(panels, inputs.subsidyCategory);
    if (!panel) return this.expert(tx, leadId, 'no_panel');
    const inverters = suggestInverterMix(
      onGridFirst(await this.catalog.products('inverter')),
      inputs.targetWp,
    );
    if (inverters.length === 0) return this.expert(tx, leadId, 'no_inverter');
    let priced: PricedQuotation;
    try {
      priced = await this.pricing.price(
        quotationPreviewInputSchema.parse({
          subsidyCategory: inputs.subsidyCategory,
          systemType: 'on_grid',
          targetWp: inputs.targetWp,
          panelProductId: panel.id,
          inverters,
          structureType: inputs.structureType,
          floors: inputs.floors,
          distanceKm: 0,
        }),
      );
    } catch (error) {
      this.log.warn(`Lead ${leadId} could not be priced: ${String(error)}`);
      return this.expert(tx, leadId, 'pricing_failed');
    }
    const totals = priced.preview.totals;
    if (totals.capacityWp <= 0 || totals.totalPaise <= 0 || totals.effectivePaise < 0)
      return this.expert(tx, leadId, 'pricing_failed');
    const saving = savingAndPayback(totals.capacityWp, totals.effectivePaise, settings);
    const snapshot: EstimateSnapshot & Record<string, unknown> = {
      preview: priced.preview,
      panelProductId: panel.id,
      inverters,
      assumptions: {
        tariffPaisePerUnit: settings.tariffPaisePerUnit,
        unitsPerKwMonth: settings.unitsPerKwMonth,
      },
    };
    const [row] = await tx
      .insert(leadEstimates)
      .values({
        leadId,
        capacityWp: totals.capacityWp,
        moduleCount: totals.moduleCount,
        totalPaise: totals.totalPaise,
        subsidyPaise: totals.subsidyPaise,
        effectivePaise: totals.effectivePaise,
        monthlySavingPaise: saving.monthlySavingPaise,
        paybackYears: saving.paybackYears,
        answers,
        priced: snapshot,
      })
      .returning({ id: leadEstimates.id });
    if (!row) throw new Error('The estimate was not saved.');
    const size = kw(totals.capacityWp);
    const price = formatInr(totals.totalPaise);
    const after = formatInr(totals.effectivePaise);
    // The bot's estimate is not a person getting in touch: the lead stays where it is.
    await logLead(
      tx,
      leadId,
      null,
      'note',
      `Estimate sent: ${size}, ${price} (${after} after subsidy).`,
    );
    // Nothing tapped yet: the owner calls today (the move's note says why); a tap changes it.
    await updateLeadFromChat(
      tx,
      leadId,
      { nextAction: { on: this.today(), note: `Call — estimate sent (${size}, ${price})` } },
      null,
    );
    return { kind: 'sent', estimateId: row.id, size, price, after };
  }

  /**
   * The end of onboarding, in the chat's transaction and language: the estimate PDF and
   * its next-step buttons, or the expert reply with a hand-over to the owner. The caller
   * makes sure there is a lead, so the price and the hand-over are always kept on one.
   */
  async finish(
    tx: Transaction,
    chat: Conversation,
    leadId: string,
    answers: OnboardAnswers,
    { view, summary }: { readonly view: QuestionView; readonly summary: string },
  ): Promise<void> {
    const W = ONBOARD_WORDS;
    const result = await this.make(tx, leadId, answers);
    if (result.kind !== 'sent') {
      const why = REASON[result.reason];
      await this.people.passToOwner(chat, {
        summary: `${summary}. No instant estimate: ${why}`,
        db: tx,
        reply: W.expertPrice,
      });
      return;
    }
    const link = sharedFileUrl(this.env, {
      kind: 'estimate',
      id: result.estimateId,
      customerId: '',
      leadId,
    });
    await queueReply(tx, chat, {
      kind: 'document',
      link,
      filename: 'Solar-estimate.pdf',
      caption: W.estimateCaption(result.size, result.price, result.after),
    });
    await queueReply(tx, chat, question('done', view));
  }

  today(): string {
    return todayIn(this.env.BUSINESS_TIMEZONE);
  }

  /** No number for this site: a call today with the reason, for the owner. */
  private async expert(tx: Transaction, leadId: string, reason: ExpertReason) {
    const why = REASON[reason];
    await updateLeadFromChat(
      tx,
      leadId,
      { nextAction: { on: this.today(), note: `Call — price by hand (${why})` } },
      `No instant estimate (${why}): our expert prepares the price.`,
    );
    return { kind: 'expert', reason } as const;
  }
}
