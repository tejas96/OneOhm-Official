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

describe('visit words fit WhatsApp', () => {
  for (const language of ['en', 'mr', 'hi'] as const) {
    it(`buttons 20, rows 24, lines 72 (${language})`, async () => {
      await inLanguage(language, async () => {
        const words = VISIT_LISTS[language];
        for (const title of Object.values(words.buttons))
          expect(Array.from(title).length).toBeLessThanOrEqual(20);
        const list = pickList({
          actionId: id,
          kind: 'installation',
          home: 'Sangli',
          days: ['2026-11-06', '2026-11-07'],
          name: 'Priya',
          customer: 'Tejas',
        }).replies[0];
        if (list?.kind !== 'list') throw new Error('list');
        expect(Array.from(list.button).length).toBeLessThanOrEqual(20);
        expect(Array.from(list.section ?? '').length).toBeLessThanOrEqual(24);
        for (const row of list.rows) {
          expect(Array.from(row.title).length).toBeLessThanOrEqual(24);
          expect(Array.from(row.description ?? '').length).toBeLessThanOrEqual(72);
        }
        expect(list.rows.at(-1)?.id).toBe('go:talk');
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
        ];
        for (const reply of buttons)
          if (reply.kind === 'buttons')
            for (const button of reply.buttons)
              expect(Array.from(button.title).length).toBeLessThanOrEqual(20);
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
