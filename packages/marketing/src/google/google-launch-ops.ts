import { createHash } from 'node:crypto';
import type { LaunchInput } from '../types';
import type { GoogleTexts } from './google-texts';

export type Operation = Record<string, unknown>;

export type GoogleLocation =
  | { readonly kind: 'proximity'; readonly latitude: number; readonly longitude: number }
  | {
      readonly kind: 'geo';
      readonly resourceName: string;
      /** Google's own full name for the place ("Pune, Maharashtra, India"). */
      readonly canonicalName?: string | null;
    };

export interface LaunchPicture {
  readonly landscape: string;
  readonly square: string;
  /** Base64 of the logo; null means the square crop stands in. */
  readonly logo: string | null;
}

export interface BuiltLaunch {
  readonly operations: Operation[];
  /** Where in the answer the main objects are. */
  readonly at: {
    readonly budget: number;
    readonly campaign: number;
    readonly assetGroup: number;
    readonly leadForm: number | null;
  };
}

/** A short fingerprint of the picture's bytes: the same photo always gets the same name. */
const fingerprint = (base64: string): string =>
  createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex').slice(0, 12);

/** The one atomic request that makes a paused Performance Max campaign, with temporary names. */
export function buildLaunch(parts: {
  readonly customerId: string;
  readonly code: string;
  readonly input: LaunchInput;
  readonly texts: GoogleTexts;
  readonly pictures: LaunchPicture;
  readonly location: GoogleLocation;
  readonly leadFormKey: string | null;
}): BuiltLaunch {
  const { customerId, code, input, texts, pictures, location } = parts;
  const operations: Operation[] = [];
  let next = -1;
  const temp = (kind: string) => `customers/${customerId}/${kind}/${next--}`;
  const push = (operation: Operation): number => operations.push(operation) - 1;
  const asset = (create: Record<string, unknown>): string => {
    const resourceName = temp('assets');
    push({ assetOperation: { create: { resourceName, ...create } } });
    return resourceName;
  };

  const budget = temp('campaignBudgets');
  const budgetAt = push({
    campaignBudgetOperation: {
      create: {
        resourceName: budget,
        name: `${code} · budget`,
        amountMicros: String(input.dailyBudgetPaise * 10_000),
        deliveryMethod: 'STANDARD',
        explicitlyShared: false,
      },
    },
  });
  const campaign = temp('campaigns');
  const campaignAt = push({
    campaignOperation: {
      create: {
        resourceName: campaign,
        name: `${code} · ${input.name}`,
        status: 'PAUSED',
        advertisingChannelType: 'PERFORMANCE_MAX',
        campaignBudget: budget,
        maximizeConversions: {},
        containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
        // Only people in the place, not people who merely look at it.
        geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE' },
        // The ad goes to our page only; Google may not pick other pages of the site.
        assetAutomationSettings: [
          {
            assetAutomationType: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION',
            assetAutomationStatus: 'OPTED_OUT',
          },
        ],
      },
    },
  });
  const criterion = (create: Record<string, unknown>) =>
    push({ campaignCriterionOperation: { create: { campaign, ...create } } });
  criterion(
    location.kind === 'proximity'
      ? {
          proximity: {
            geoPoint: {
              latitudeInMicroDegrees: Math.round(location.latitude * 1e6),
              longitudeInMicroDegrees: Math.round(location.longitude * 1e6),
            },
            radius: input.city.radiusKm,
            radiusUnits: 'KILOMETERS',
          },
        }
      : { location: { geoTargetConstant: location.resourceName } },
  );
  criterion({ language: { languageConstant: 'languageConstants/1000' } });
  criterion({ language: { languageConstant: 'languageConstants/1023' } });

  const assetGroup = temp('assetGroups');
  const assetGroupAt = push({
    assetGroupOperation: {
      create: {
        resourceName: assetGroup,
        campaign,
        name: `${code} · ${input.name}`,
        finalUrls: [input.landingUrl],
      },
    },
  });
  const link = (assetName: string, fieldType: string) =>
    push({ assetGroupAssetOperation: { create: { assetGroup, asset: assetName, fieldType } } });
  const text = (value: string, fieldType: string) =>
    link(asset({ textAsset: { text: value } }), fieldType);

  for (const headline of texts.headlines) text(headline, 'HEADLINE');
  text(texts.longHeadline, 'LONG_HEADLINE');
  for (const description of texts.descriptions) text(description, 'DESCRIPTION');
  // Names come from the bytes, so Google's merge of identical pictures never meets two names.
  const image = (data: string) =>
    asset({ name: `OneOhm image ${fingerprint(data)}`, imageAsset: { data } });
  link(image(pictures.landscape), 'MARKETING_IMAGE');
  const square = image(pictures.square);
  link(square, 'SQUARE_MARKETING_IMAGE');
  // Brand guidelines are on: the business name and logo belong to the campaign.
  const campaignAsset = (assetName: string, fieldType: string) =>
    push({ campaignAssetOperation: { create: { campaign, asset: assetName, fieldType } } });
  campaignAsset(asset({ textAsset: { text: texts.businessName } }), 'BUSINESS_NAME');
  campaignAsset(pictures.logo ? image(pictures.logo) : square, 'LOGO');

  let leadFormAt: number | null = null;
  if (input.goal === 'lead_form' && parts.leadFormKey) {
    const form = asset({
      name: `${code} · lead form`,
      leadFormAsset: {
        businessName: texts.businessName,
        callToActionType: 'GET_QUOTE',
        callToActionDescription: 'Get a free solar quote',
        headline: texts.headlines[0] ?? texts.businessName,
        description: texts.descriptions[1].slice(0, 200),
        privacyPolicyUrl: input.privacyPolicyUrl,
        fields: [{ inputType: 'FULL_NAME' }, { inputType: 'PHONE_NUMBER' }, { inputType: 'CITY' }],
        deliveryMethods: [
          {
            webhook: {
              advertiserWebhookUrl: input.leadWebhookUrl,
              googleSecret: parts.leadFormKey,
              payloadSchemaVersion: 3,
            },
          },
        ],
        postSubmitHeadline: 'Thank you',
        postSubmitDescription: 'We will call you soon to plan your free site visit.',
      },
    });
    leadFormAt = operations.length - 1;
    push({ campaignAssetOperation: { create: { campaign, asset: form, fieldType: 'LEAD_FORM' } } });
  }
  return {
    operations,
    at: { budget: budgetAt, campaign: campaignAt, assetGroup: assetGroupAt, leadForm: leadFormAt },
  };
}
