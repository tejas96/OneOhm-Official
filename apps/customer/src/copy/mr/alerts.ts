/**
 * Marathi copy for the updates inbox: the same shape as `../en/alerts.ts`.
 *
 * Drafted by the OneOhm team. Have a native Marathi speaker read it once before go-live.
 */
import type { Copy } from '@/i18n/copy';
import type * as en from '../en/alerts';

export const ALERTS: Copy<typeof en.ALERTS> = {
  bell: (unread) => (unread === 0 ? 'अपडेट्स' : `अपडेट्स, ${unread} नवीन`),
  title: 'अपडेट्स',
  overline: 'तुमचा इनबॉक्स',
  loading: 'तुमचे अपडेट्स लोड होत आहेत',
  markAll: 'सगळे वाचले',
  emptyTitle: 'अजून काही नवीन नाही',
  emptyBody: 'प्रकल्पाचे टप्पे, पेमेंट आणि सर्व्हिसची उत्तरे इथे आणि तुमच्या फोनवर दिसतील.',
};
