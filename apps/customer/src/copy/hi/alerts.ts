/**
 * Hindi copy for the updates inbox: the same shape as `../en/alerts.ts`.
 *
 * Drafted by the OneOhm team. Have a native Hindi speaker read it once before go-live.
 */
import type { Copy } from '@/i18n/copy';
import type * as en from '../en/alerts';

export const ALERTS: Copy<typeof en.ALERTS> = {
  bell: (unread) => (unread === 0 ? 'अपडेट' : `अपडेट, ${unread} नए`),
  title: 'अपडेट',
  overline: 'आपका इनबॉक्स',
  loading: 'आपके अपडेट लोड हो रहे हैं',
  markAll: 'सब पढ़ लिए',
  emptyTitle: 'अभी कुछ नया नहीं',
  emptyBody: 'प्रोजेक्ट के कदम, पेमेंट और सर्विस के जवाब यहाँ और आपके फ़ोन पर दिखेंगे।',
};
