import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MESSAGE_TEMPLATES,
  FOLLOW_UP_MAX,
  followUpText,
  messageFieldsFor,
  renderTemplate,
  templateExtras,
  unknownMessageFields,
} from './message-templates';

describe('message templates', () => {
  it('fills placeholders in field order', () => {
    expect(
      renderTemplate('Hi {{1}}, {{2}} on {{3}}.', ['customer', 'milestone', 'project'], {
        customer: 'Asha',
        milestone: 'Installation done',
        project: 'OH-2026-001',
      }),
    ).toBe('Hi Asha, Installation done on OH-2026-001.');
  });

  it('leaves a placeholder without a value as it is', () => {
    expect(renderTemplate('{{1}} {{2}}', ['a'], { a: 'x' })).toBe('x {{2}}');
  });

  it('uses every field in each default preview', () => {
    for (const template of DEFAULT_MESSAGE_TEMPLATES) {
      const count = (template.preview.match(/\{\{\d+\}\}/g) ?? []).length;
      expect(count, template.key).toBe(template.fields.length);
    }
  });
});

describe('follow-up text', () => {
  it('keeps a staff message on one tidy line', () => {
    expect(followUpText('  Hello,\n\nyour meter   is fitted.\tCall us.  ')).toBe(
      'Hello, your meter is fitted. Call us.',
    );
  });

  it('cuts a long message with an ellipsis', () => {
    const text = followUpText('a'.repeat(FOLLOW_UP_MAX + 50));
    expect(text).toHaveLength(FOLLOW_UP_MAX);
    expect(text.endsWith('…')).toBe(true);
  });

  it('names the file and buttons only for the messages that have them', () => {
    const withExtras = DEFAULT_MESSAGE_TEMPLATES.filter((t) => 'extras' in t).map((t) => t.key);
    expect(withExtras).toEqual([
      'quotation_sent',
      'payment_received',
      'payment_reminder',
      'payment_link',
      'installation_started',
      'commissioning_completed',
      'project_waiting',
      'location_request',
      'payment_due',
      'callback_request',
      'document_share',
      'visit_pick',
      'visit_booked',
      'visit_reminder',
      'inspection_presence',
      'signature_request',
      'site_ready_check',
      'installation_check',
      'handover_pack',
      'signature_reminder',
      'signed_page_reminder',
      'site_ready_reminder',
    ]);
    // The newer buttons of the older step messages are optional: they send only behind their own switch.
    expect(templateExtras('commissioning_completed')?.optionalQuickReplies).toEqual([
      'payPayload',
      'warrantyPayload',
    ]);
    expect(templateExtras('quotation_sent')?.quickReplies).toEqual(['acceptPayload', 'askPayload']);
    expect(templateExtras('payment_link')?.urlButton).toBe('payToken');
    expect(templateExtras('project_started')).toBeUndefined();
  });
});

describe('message fields', () => {
  it('lets a message use only the details its senders fill', () => {
    expect(messageFieldsFor('maintenance_visit')).toEqual(['customer', 'visit', 'date', 'project']);
  });

  it('names the fields a message cannot fill', () => {
    expect(unknownMessageFields('project_milestone', ['customer', 'project', 'amount'])).toEqual([
      'amount',
    ]);
    expect(unknownMessageFields('project_milestone', ['project', 'customer'])).toEqual([]);
  });

  it('leaves a message OneOhm does not ship unchecked, as its sender is unknown', () => {
    expect(messageFieldsFor('made_up')).toBeNull();
    expect(unknownMessageFields('made_up', ['customer', 'manager'])).toEqual([]);
  });
});
