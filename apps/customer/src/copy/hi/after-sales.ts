/**
 * Hindi copy for warranty, AMC, planned visits and rating a request: the same shape as
 * `../en/after-sales.ts`.
 *
 * Drafted by the OneOhm team. Have a native Hindi speaker read it once before go-live.
 */
import type { Copy } from '@/i18n/copy';
import type * as en from '../en/after-sales';

const DO_BETTER = 'क्या अच्छा रहा, और हम क्या बेहतर कर सकते थे?';

export const COVER: Copy<typeof en.COVER> = {
  title: 'वारंटी और AMC',
  cardTitle: 'आपके सिस्टम की सुरक्षा',
  loading: 'आपकी वारंटी लोड हो रही है',
  notYet: 'सिस्टम चालू होने के दिन से वारंटी शुरू होती है। वह यहाँ दिखेगी।',
  details: 'वारंटी की जानकारी देखें',
  kinds: {
    panel: 'सोलर पैनल',
    inverter: 'इन्वर्टर',
    battery: 'बैटरी',
    structure: 'पैनल का स्ट्रक्चर',
    workmanship: 'फ़िटिंग का काम',
  },
  state: { active: 'सुरक्षित', ending_soon: 'जल्द खत्म होगी', ended: 'खत्म' },
  until: (date) => `${date} तक सुरक्षित`,
  performance: (date) => `${date} तक बिजली बनने की गारंटी`,
  count: (count) => `${count} ×`,
  since: (date) => `${date} को चालू हुआ। सुरक्षा उसी दिन से गिनी जाती है।`,
  amcTitle: 'सालाना मेंटेनेंस (AMC)',
  noAmc: 'अभी AMC नहीं है। हर साल मुफ़्त सफ़ाई और जाँच विज़िट के बारे में हमसे पूछें।',
  amcState: {
    upcoming: 'जल्द शुरू',
    active: 'चालू',
    ended: 'खत्म',
    cancelled: 'रद्द',
  },
  amcPeriod: (from, to) => `${from} से ${to}`,
  amcVisits: (done, total) => `${total} में से ${done} विज़िट हो गईं`,
  includes: 'हर विज़िट में',
  ask: 'AMC के बारे में पूछें',
  askDescription: 'मुझे अपने सिस्टम के लिए AMC (सालाना मेंटेनेंस) के बारे में जानना है।',
};

export const VISITS: Copy<typeof en.VISITS> = {
  title: 'आने वाली विज़िट',
  on: (date) => `${date} को`,
  visit: (name) => `मुफ़्त ${name} विज़िट`,
  under: (plan, code) => `${plan} · ${code}`,
  status: {
    planned: 'तय है',
    open: 'बुक हो गई',
    in_progress: 'टीम काम पर',
    resolved: 'हो गई',
  },
};

export const RATE: Copy<typeof en.RATE> = {
  title: 'हमारा काम कैसा लगा?',
  intro: 'सर्विस टीम ने यह रिक्वेस्ट कैसे संभाली, उसे रेटिंग दें।',
  action: 'रेटिंग दें',
  change: 'रेटिंग बदलें',
  yours: (rating) => `आपने 5 में से ${rating} दिए`,
  ratingLabel: 'आपकी रेटिंग',
  stars: ['खराब', 'और अच्छा हो सकता था', 'अच्छा', 'बहुत अच्छा', 'शानदार'],
  pick: 'पहले रेटिंग चुनें।',
  commentLabel: 'कुछ और कहना है?',
  commentHint: DO_BETTER,
  submit: 'रेटिंग भेजें',
  sent: 'रेटिंग के लिए धन्यवाद।',
  notFound: 'यह रिक्वेस्ट नहीं मिली।',
  visit: 'मेंटेनेंस विज़िट',
  scheduled: (date) => `${date} को विज़िट`,
};
