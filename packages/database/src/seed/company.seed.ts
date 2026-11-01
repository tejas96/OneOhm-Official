import type { RateCard } from '@oneohm/domain';
import type { Database } from '../client';
import { companyProfile, rateCards } from '../schema';

const rupees = (value: number) => value * 100;

/** PRD Appendix A. Signatory details are left blank until filled in Settings. */
export async function seedCompany(db: Database): Promise<void> {
  const existing = await db.select({ id: companyProfile.id }).from(companyProfile).limit(1);
  if (existing.length > 0) return;
  await db.insert(companyProfile).values({
    legalName: 'One Ohm Sustainable Green Energy Private Limited',
    brandName: 'OneOhm',
    fullAddress:
      "'OneOhm', Plot No. 93, Vasantdada Industrial Estate, Near Old RTO Office, Tal. Miraj, Dist. Sangli, Sangli - 416416",
    shortAddress: 'Plot No. 93, Vasantdada Industrial Estate, Sangli - 416416',
    gstin: '27AAECO5032B1ZW',
    email: 'info.oneohm@gmail.com',
    phones: ['+91 87882 75659', '+91 97979 79598', '+91 92251 76086'],
    signatoryName: '',
    signatoryDesignation: 'Director',
    signatoryPhone: '',
    signatoryEmail: '',
  });
}

/**
 * STARTER VALUES. OneOhm's real rate card was not provided; these keep the price engine
 * working until they are replaced in Settings → Rate card.
 */
export const STARTER_RATE_CARD: RateCard = {
  structurePerKw: {
    rcc_elevated: { price: rupees(6_000), cost: rupees(4_500) },
    tin_shed: { price: rupees(3_500), cost: rupees(2_600) },
    ground_mount: { price: rupees(9_000), cost: rupees(7_000) },
  },
  dcCable: { baseMeters: 20, perFloorMeters: 6, price: rupees(60), cost: rupees(45) },
  acCable: { baseMeters: 15, perFloorMeters: 4, price: rupees(120), cost: rupees(90) },
  earthingKit: { price: rupees(9_000), cost: rupees(6_500) },
  protectionKit: { price: rupees(7_500), cost: rupees(5_500) },
  installationPerKw: { price: rupees(4_000), cost: rupees(3_000) },
  extraFloorPerKw: { price: rupees(500), cost: rupees(400) },
  freeFloors: 2,
  transport: { baseKm: 25, perKm: rupees(25), flat: rupees(1_500) },
  liaisoning: { price: rupees(6_000), cost: rupees(3_000) },
  goodsTaxBp: 500,
  serviceTaxBp: 1800,
  contingencyBp: 800,
  toleranceBp: 300,
};

/** The seeded card's name; Settings renames the card when someone saves real rates. */
export const STARTER_RATE_CARD_NAME = 'Starter rate card (replace with OneOhm rates)';

export async function seedRateCard(db: Database): Promise<void> {
  const existing = await db.select({ id: rateCards.id }).from(rateCards).limit(1);
  if (existing.length > 0) return;
  await db.insert(rateCards).values({ name: STARTER_RATE_CARD_NAME, rates: STARTER_RATE_CARD });
}
