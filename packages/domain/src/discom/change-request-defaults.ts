import type { WaitingParty } from '../epc/stages';
import type {
  ChangeRequestCapture,
  ChangeRequestStep,
  ChangeRequestTypeConfig,
} from './change-request-catalog';

/**
 * The utility change requests OneOhm starts every DISCOM with (PRD 3.15, MSEDCL's
 * process today). Each DISCOM gets its own copy in the database, which the owner then
 * changes in Settings → DISCOMs without a developer.
 */

const step = (
  key: string,
  title: string,
  durationDays: number,
  waitingParty: WaitingParty,
  captures: readonly ChangeRequestCapture[] = [],
): ChangeRequestStep => ({
  key,
  title,
  roleKey: 'liaisoning',
  durationDays,
  waitingParty,
  captures,
});

const collect = step('collect_documents', 'Collect documents from the customer', 3, 'customer');
const apply = step(
  'submit_application',
  'Submit the application on the DISCOM portal',
  2,
  'internal',
  ['application_number'],
);

export const DEFAULT_CHANGE_REQUEST_TYPES: readonly ChangeRequestTypeConfig[] = [
  {
    key: 'consumer_name_change',
    title: 'Consumer name change',
    description: "Moves the connection to the new owner's name",
    fields: [{ key: 'newName', required: true }],
    documents: [],
    steps: [
      collect,
      apply,
      step('discom_approval', 'DISCOM approves the new consumer name', 15, 'discom'),
    ],
    blocks: { stages: ['net_metering', 'subsidy'], taskKeys: [] },
    updates: ['meterHolderName'],
  },
  {
    key: 'name_spelling_correction',
    title: 'Name spelling correction',
    description: 'Fixes a spelling mistake on the DISCOM record',
    fields: [{ key: 'correctedName', required: true }],
    documents: [],
    steps: [apply, step('discom_approval', 'DISCOM corrects the consumer name', 7, 'discom')],
    blocks: { stages: ['net_metering', 'subsidy'], taskKeys: [] },
    updates: ['meterHolderName'],
  },
  {
    key: 'property_type_change',
    title: 'Property type change',
    description: 'Changes the connection category',
    fields: [{ key: 'newCategory', required: true }],
    documents: [],
    steps: [
      collect,
      apply,
      step('discom_approval', 'DISCOM changes the connection category', 15, 'discom'),
    ],
    blocks: { stages: ['subsidy'], taskKeys: [] },
    updates: ['subsidyCategory'],
  },
  {
    key: 'load_change',
    title: 'Load change',
    description: 'Raises or lowers the sanctioned load',
    fields: [
      { key: 'phase', required: true },
      { key: 'newLoadKw', required: true },
    ],
    documents: [],
    steps: [
      collect,
      apply,
      step('discom_inspection', 'DISCOM site inspection', 7, 'discom'),
      step('load_sanctioned', 'DISCOM sanctions the new load', 7, 'discom'),
    ],
    blocks: { stages: [], taskKeys: ['discom_application'] },
    updates: ['phase', 'sanctionedLoadW'],
  },
  {
    key: 'new_ev_meter',
    title: 'New EV meter',
    description: 'A separate meter for EV charging',
    fields: [{ key: 'note', required: false }],
    documents: [],
    steps: [
      apply,
      step('discom_inspection', 'DISCOM site inspection', 7, 'discom'),
      step('meter_installed', 'EV meter installed', 7, 'discom', ['ev_meter_number']),
    ],
    blocks: { stages: [], taskKeys: [] },
    updates: ['evMeterNumber'],
  },
  {
    key: 'new_connection',
    title: 'New connection',
    description: 'A new electricity connection for the site',
    fields: [
      { key: 'phase', required: true },
      { key: 'note', required: false },
    ],
    documents: [],
    steps: [
      collect,
      apply,
      step('discom_inspection', 'DISCOM site inspection', 7, 'discom'),
      step('connection_released', 'DISCOM releases the connection', 10, 'discom', [
        'consumer_number',
      ]),
    ],
    blocks: { stages: ['commissioning', 'net_metering'], taskKeys: [] },
    updates: ['phase', 'consumerNumber'],
  },
];

/** The starting definition for a key, used when a request predates its DISCOM's copy. */
export function defaultChangeRequestType(key: string): ChangeRequestTypeConfig | undefined {
  return DEFAULT_CHANGE_REQUEST_TYPES.find((type) => type.key === key);
}
