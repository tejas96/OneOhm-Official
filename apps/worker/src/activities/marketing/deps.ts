import type { Database } from '@oneohm/database';
import type { MarketingConfig } from '@oneohm/marketing';

/** What the marketing jobs need besides the database. */
export interface MarketingDeps {
  readonly db: Database;
  readonly config: MarketingConfig;
  readonly timeZone: string;
  /** Where Meta, Google and customers reach the API. */
  readonly apiPublicUrl: string;
  /** Google Maps key for reading reviews; null reads none. */
  readonly googleMapsKey: string | null;
  /** The WhatsApp Business account whose marketing templates Meta approves. */
  readonly whatsapp: {
    readonly token: string;
    readonly businessAccountId: string;
    readonly apiVersion: string;
  } | null;
}
