import { VISIT_KINDS } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { inLanguage } from '../whatsapp/assistant/language';
import {
  bookedMessage,
  pickList,
  presenceMessage,
  reminderMessage,
  slotButtons,
} from './visit-messages';
import { VISIT_LISTS } from './visit-words';

const id = '0b6f1c7e-7d3a-4f0e-9c1d-2a4b5c6d7e8f';

const long = (text: string | undefined, max: number) => Array.from(text ?? '').length > max;

/** Everything a customer can be shown with a title, in one place. */
function titles(language: 'en' | 'mr' | 'hi') {
  const list = pickList({
    actionId: id,
    kind: 'installation',
    home: 'Sangli',
    days: ['2026-11-06', '2026-11-07'],
    name: 'Priya',
    customer: 'Tejas',
  }).replies[0];
  const buttons = [
    ...slotButtons(id, '2026-11-06', ['morning', 'afternoon']).replies,
    ...bookedMessage({
      customer: 'T',
      visitId: id,
      day: '2026-11-06',
      slot: 'morning',
      staff: 'Ravi',
      phone: '98',
      moved: false,
    }).replies,
    ...reminderMessage({
      customer: 'T',
      visitId: id,
      home: 'Sangli',
      kind: 'service',
      day: '2026-11-06',
      slot: 'morning',
      today: '2026-11-05',
    }).replies,
    ...presenceMessage({
      customer: 'T',
      visitId: id,
      home: 'Sangli',
      kind: 'inspection',
      day: '2026-11-06',
    }).replies,
  ].flatMap((reply) =>
    reply.kind === 'buttons' ? reply.buttons.map((button) => button.title) : [],
  );
  const rows = list?.kind === 'list' ? list.rows : [];
  return {
    buttons: [...buttons, ...Object.values(VISIT_LISTS[language].buttons)],
    listButton: list?.kind === 'list' ? list.button : '',
    section: list?.kind === 'list' ? list.section : '',
    rows,
  };
}

describe('visit words fit WhatsApp', () => {
  for (const language of ['en', 'mr', 'hi'] as const) {
    it(`buttons 20, rows 24, lines 72 (${language})`, async () => {
      await inLanguage(language, async () => {
        const shown = titles(language);
        expect(shown.buttons.filter((title) => long(title, 20))).toEqual([]);
        expect(long(shown.listButton, 20)).toBe(false);
        expect(long(shown.section, 24)).toBe(false);
        expect(
          shown.rows.filter((row) => long(row.title, 24) || long(row.description, 72)),
        ).toEqual([]);
        expect(shown.rows.at(-1)?.id).toBe('go:talk');
      });
    });
  }

  it('says every kind of work in all three languages', () => {
    for (const kind of VISIT_KINDS)
      for (const language of ['en', 'mr', 'hi'] as const)
        expect(VISIT_LISTS[language].work[kind].length).toBeGreaterThan(0);
  });

  it('English reads the way the plan says', async () => {
    await inLanguage('en', async () => {
      const [booked] = bookedMessage({
        customer: 'Tejas',
        visitId: id,
        day: '2026-11-06',
        slot: 'morning',
        staff: 'Ravi',
        phone: '',
        moved: false,
      }).replies;
      expect(booked).toMatchObject({
        body: 'Booked ✅ *Fri 6 Nov, morning*. Ravi will call before coming.',
      });
      const [reminder] = reminderMessage({
        customer: 'T',
        visitId: id,
        home: 'Sangli',
        kind: 'installation',
        day: '2026-11-06',
        slot: 'morning',
        today: '2026-11-05',
      }).replies;
      expect(reminder).toMatchObject({
        body: 'Our team visits *Sangli* tomorrow morning for the *installation*.',
      });
    });
  });
});
