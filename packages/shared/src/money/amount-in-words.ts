/**
 * Rupees in words the Indian way, as receipts print them:
 * 1,25,050.50 → "Rupees One Lakh Twenty-Five Thousand Fifty and Fifty Paise Only".
 */
const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(value: number): string {
  if (value < 20) return ONES[value] ?? '';
  const tens = TENS[Math.floor(value / 10)] ?? '';
  const ones = ONES[value % 10] ?? '';
  return ones ? `${tens}-${ones}` : tens;
}

function belowThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts = [hundreds ? `${ONES[hundreds]} Hundred` : '', rest ? belowHundred(rest) : ''];
  return parts.filter(Boolean).join(' ');
}

/** Whole rupees in the Indian system: crore, lakh, thousand, hundred. */
function rupeeWords(value: number): string {
  if (value === 0) return 'Zero';
  const crore = Math.floor(value / 10_000_000);
  const lakh = Math.floor((value % 10_000_000) / 100_000);
  const thousand = Math.floor((value % 100_000) / 1000);
  const rest = value % 1000;
  return [
    crore ? `${rupeeWords(crore)} Crore` : '',
    lakh ? `${belowHundred(lakh)} Lakh` : '',
    thousand ? `${belowHundred(thousand)} Thousand` : '',
    rest ? belowThousand(rest) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function amountInWords(paise: number): string {
  const absolute = Math.abs(Math.round(paise));
  const rupees = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  const words = `Rupees ${rupeeWords(rupees)}`;
  return remainder ? `${words} and ${belowHundred(remainder)} Paise Only` : `${words} Only`;
}
