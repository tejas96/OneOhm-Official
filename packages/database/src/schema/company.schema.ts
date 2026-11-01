import { integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, primaryId, updatedAt } from './columns';

/**
 * The company profile (PRD Appendix A): one row, editable in Settings, used on
 * quotations, invoices, reports and WhatsApp templates. Never hardcoded.
 */
export const companyProfile = pgTable('company_profile', {
  id: primaryId(),
  legalName: text('legal_name').notNull(),
  brandName: text('brand_name').notNull(),
  fullAddress: text('full_address').notNull(),
  shortAddress: text('short_address').notNull(),
  gstin: text('gstin').notNull(),
  email: text('email').notNull(),
  phones: text('phones').array().notNull(),
  signatoryName: text('signatory_name').notNull(),
  signatoryDesignation: text('signatory_designation').notNull(),
  signatoryPhone: text('signatory_phone').notNull(),
  signatoryEmail: text('signatory_email').notNull(),
  /** Object-store keys for brand images used on documents. */
  logoKey: text('logo_key'),
  signatureKey: text('signature_key'),
  stampKey: text('stamp_key'),
  quotationValidityDays: integer('quotation_validity_days').notNull().default(15),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Configurable rate cards and site-type defaults for the price engine (PRD 3.9), as
 * the domain `RateCard` shape. One active row; a change never alters accepted quotes,
 * because quotations keep their own snapshot.
 */
export const rateCards = pgTable('rate_cards', {
  id: primaryId(),
  name: text('name').notNull(),
  rates: jsonb('rates').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
