import { describe, expect, it } from 'vitest';
import { readableFileName } from './form-file-names';
import { FORM_KEYS } from './form-registry';
import { readForm } from './form-reply-data';
import { formBody, formRows } from './form-summary';

const reply = (data: Record<string, unknown>) => readForm(JSON.stringify(data));
const photo = (id: string) => ({ id, file_name: 'a.jpg', mime_type: 'image/jpeg', sha256: 'x' });

describe('staff rows of a form reply', () => {
  it('report_problem reads the choices in English and keeps the typed note', () => {
    const form = reply({
      what: 'nopower',
      since: 'week',
      note: 'Not working',
      photos: [photo('1'), photo('2')],
    });
    const rows = formRows('report_problem', form, { home: 'Sangli' });
    expect(rows).toEqual([
      { label: 'Problem', value: 'No power' },
      { label: 'Since', value: 'This week' },
      { label: 'Note', value: 'Not working' },
      { label: 'Home', value: 'Sangli' },
    ]);
    expect(formBody('Report a problem', rows, form)).toBe(
      'Form · Report a problem · No power · 2 photos',
    );
  });

  it('leaves out empty optional values', () => {
    expect(formRows('report_problem', reply({ what: 'damage', since: 'today' }))).toEqual([
      { label: 'Problem', value: 'Damage' },
      { label: 'Since', value: 'Today' },
    ]);
  });

  it('refer_friend keeps the typed words', () => {
    expect(
      formRows('refer_friend', reply({ friend: 'Asha', mobile: '9876543210', city: 'Pune' })),
    ).toEqual([
      { label: 'Friend', value: 'Asha' },
      { label: 'Mobile', value: '9876543210' },
      { label: 'City', value: 'Pune' },
    ]);
  });

  it('share_upi shows the UPI ID', () => {
    expect(formRows('share_upi', reply({ upi: 'asha@okbank' }))).toEqual([
      { label: 'UPI ID', value: 'asha@okbank' },
    ]);
  });

  it('paid_another_way shows rupees and the day', () => {
    const rows = formRows('paid_another_way', reply({ amount: '1,200', date: '2020-01-05' }));
    expect(rows).toEqual([
      { label: 'Amount', value: '₹1,200' },
      { label: 'Date', value: '2020-01-05' },
    ]);
  });

  it('self_survey names each answer', () => {
    const rows = formRows(
      'self_survey',
      reply({ roof: 'rcc', floors: '2', shade: 'none', size: 's2', consumer: '123' }),
    );
    expect(rows.map((row) => row.value)).toEqual([
      'RCC slab',
      '2 floors',
      'No shade',
      '300 to 600 sq ft',
      '123',
    ]);
  });

  it('send_paper names the paper when the token knows it', () => {
    expect(formRows('send_paper', reply({}), { payload: { key: 'electricity_bill' } })).toEqual([
      { label: 'Paper', value: 'Electricity bill' },
    ]);
    expect(formRows('send_paper', reply({}))).toEqual([]);
  });

  it('onboarding reads bands, site, roof and floors', () => {
    const rows = formRows(
      'onboarding',
      reply({
        name: 'Asha',
        city: 'other',
        other_city: 'Satara',
        site: 'society',
        bill: '1000_2000',
        roof: 'tin',
        floors: '1',
      }),
    );
    expect(rows).toEqual([
      { label: 'Name', value: 'Asha' },
      { label: 'Other city', value: 'Satara' },
      { label: 'Site', value: 'Housing society' },
      { label: 'Bill', value: '₹1,000–2,000' },
      { label: 'Roof', value: 'Tin sheet' },
      { label: 'Floors', value: 'Ground only' },
    ]);
  });

  it('every form has rows without throwing on an empty reply', () => {
    for (const key of FORM_KEYS) expect(formRows(key, reply({}))).toEqual([]);
  });
});

describe('readable file names', () => {
  const uuid = (ext: string) => ({
    name: `3f2b8c1e-1111-4222-8333-444455556666.${ext}`,
    contentType: 'image/jpeg',
  });
  it('names machine-made files by the form and keeps the extension', () => {
    expect(readableFileName('report_problem', 0, 2, uuid('jpg'))).toBe('Problem photo 1.jpg');
    expect(readableFileName('onboarding', 0, 1, uuid('jpg'))).toBe('Bill photo.jpg');
    expect(readableFileName('send_paper', 1, 2, uuid('jpg'))).toBe('Paper photo 2.jpg');
    expect(
      readableFileName('send_paper', 0, 1, {
        name: 'x'.repeat(0) + '3f2b8c1e-1111-4222-8333-444455556666.pdf',
        contentType: 'application/pdf',
      }),
    ).toBe('Paper PDF.pdf');
  });
  it('keeps a name a person gave', () => {
    expect(
      readableFileName('send_paper', 0, 1, {
        name: 'Light bill May.pdf',
        contentType: 'application/pdf',
      }),
    ).toBeNull();
    expect(readableFileName('share_upi', 0, 1, uuid('jpg'))).toBeNull();
  });
});
