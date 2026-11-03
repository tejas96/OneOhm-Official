import { describe, expect, it } from 'vitest';
import { customerPdfName, paperFileName, pdfFileName } from './pdf-file-name';

describe('PDF file names', () => {
  it('names staff files by their number', () => {
    expect(pdfFileName('OH/R/2026/0001')).toBe('OH-R-2026-0001.pdf');
    expect(pdfFileName('OH-Q-2026-0016', 2)).toBe('OH-Q-2026-0016-R2.pdf');
  });

  // Live review C16: a customer finds "OneOhm-Tejas-quote.pdf" again in WhatsApp media.
  it('names the customer’s files by brand, their name and what the file is', () => {
    expect(customerPdfName('tejas', 'quote')).toBe('OneOhm-Tejas-quote.pdf');
    expect(customerPdfName('Ravi Patil (test)', 'receipt')).toBe(
      'OneOhm-Ravi-Patil-test-receipt.pdf',
    );
    expect(customerPdfName('प्रिया कुलकर्णी', 'estimate')).toBe('OneOhm-प्रिया-कुलकर्णी-estimate.pdf');
    expect(customerPdfName('Asha', 'quote', 2)).toBe('OneOhm-Asha-quote-R2.pdf');
    expect(customerPdfName('  ', 'estimate')).toBe('OneOhm-estimate.pdf');
    expect(customerPdfName('a/b\\c:d', 'quote')).toBe('OneOhm-A-b-c-d-quote.pdf');
  });

  it('names another paper by its title, with the extension its type needs', () => {
    expect(paperFileName('Net meter agreement', 'application/pdf')).toBe(
      'OneOhm-Net-meter-agreement.pdf',
    );
    expect(paperFileName('Site photo.jpg', 'image/jpeg')).toBe('OneOhm-Site-photo.jpg');
    expect(paperFileName('वीज बिल', 'image/png')).toBe('OneOhm-वीज-बिल.png');
    expect(paperFileName('Notes', 'application/octet-stream')).toBe('OneOhm-Notes');
  });
});
