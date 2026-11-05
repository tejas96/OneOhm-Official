import type { DatabaseExecutor } from '@oneohm/database';
import type { Built } from './send-messages';

/** What a send records besides the message: a customer action, or only a log line and audit. */
export type Recorded =
  | {
      readonly kind: 'action';
      readonly id: string;
      readonly type: 'location' | 'pay' | 'callback' | 'visit_pick' | 'signature' | 'confirm';
      readonly taskId?: string | null;
      readonly title: string;
      readonly propertyId: string | null;
      readonly projectId: string | null;
      readonly payload: { [key: string]: unknown };
      readonly log: string;
      /** Asked already (a reminder for an instalment already asked about): no new action. */
      readonly reuse?: string | null;
    }
  | {
      readonly kind: 'log';
      readonly audit: string;
      readonly entity: string;
      readonly entityId: string;
      readonly log: string;
      readonly projectId: string | null;
      readonly data: { [key: string]: unknown };
    };

export interface Composed {
  readonly built: Built;
  readonly record: Recorded;
  /** Work done in the same transaction once the send is made; `delivered` is false when nothing really goes out (the template is off). */
  readonly after?: (tx: DatabaseExecutor, delivered: boolean) => Promise<void>;
}
