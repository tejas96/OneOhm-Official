/**
 * Marathi copy for warranty, AMC, planned visits and rating a request: the same shape as
 * `../en/after-sales.ts`.
 *
 * Drafted by the OneOhm team. Have a native Marathi speaker read it once before go-live.
 */
import type { Copy } from '@/i18n/copy';
import type * as en from '../en/after-sales';

const DO_BETTER = 'काय चांगले झाले, आणि आम्ही काय अजून चांगले करू शकलो असतो?';

export const COVER: Copy<typeof en.COVER> = {
  title: 'वॉरंटी आणि AMC',
  cardTitle: 'तुमच्या सिस्टिमचे संरक्षण',
  loading: 'तुमची वॉरंटी लोड होत आहे',
  notYet: 'सिस्टिम सुरू झाल्याच्या दिवसापासून वॉरंटी सुरू होते. ती इथे दिसेल.',
  details: 'वॉरंटीची माहिती पाहा',
  kinds: {
    panel: 'सोलर पॅनल',
    inverter: 'इन्व्हर्टर',
    battery: 'बॅटरी',
    structure: 'पॅनलचे स्ट्रक्चर',
    workmanship: 'बसवण्याचे काम',
  },
  state: { active: 'संरक्षण आहे', ending_soon: 'लवकरच संपेल', ended: 'संपली' },
  until: (date) => `${date} पर्यंत संरक्षण`,
  performance: (date) => `${date} पर्यंत वीजनिर्मितीची हमी`,
  count: (count) => `${count} ×`,
  since: (date) => `${date} ला सुरू झाली. संरक्षण त्या दिवसापासून मोजले जाते.`,
  amcTitle: 'वार्षिक देखभाल (AMC)',
  noAmc: 'अजून AMC नाही. दरवर्षी मोफत साफसफाई आणि तपासणी भेटींबद्दल OneOhm ला विचारा.',
  amcState: {
    upcoming: 'लवकरच सुरू',
    active: 'चालू',
    ended: 'संपली',
    cancelled: 'रद्द',
  },
  amcPeriod: (from, to) => `${from} ते ${to}`,
  amcVisits: (done, total) => `${total} पैकी ${done} भेटी झाल्या`,
  includes: 'प्रत्येक भेटीत',
  ask: 'AMC बद्दल विचारा',
  askDescription: 'माझ्या सिस्टिमसाठी AMC (वार्षिक देखभाल) बद्दल माहिती हवी आहे.',
};

export const VISITS: Copy<typeof en.VISITS> = {
  title: 'पुढच्या भेटी',
  on: (date) => `${date} ला`,
  visit: (name) => `मोफत ${name} भेट`,
  under: (plan, code) => `${plan} · ${code}`,
  status: {
    planned: 'ठरलेली',
    open: 'बुक झाली',
    in_progress: 'टीम कामावर',
    resolved: 'झाली',
  },
};

export const RATE: Copy<typeof en.RATE> = {
  title: 'आमचे काम कसे वाटले?',
  intro: 'सर्व्हिस टीमने ही विनंती कशी हाताळली ते रेट करा.',
  action: 'रेट करा',
  change: 'रेटिंग बदला',
  yours: (rating) => `तुम्ही 5 पैकी ${rating} दिले`,
  ratingLabel: 'तुमचे रेटिंग',
  stars: ['खराब', 'अजून चांगले हवे', 'चांगले', 'खूप चांगले', 'उत्कृष्ट'],
  pick: 'आधी रेटिंग निवडा.',
  commentLabel: 'अजून काही सांगायचे आहे?',
  commentHint: DO_BETTER,
  submit: 'रेटिंग पाठवा',
  sent: 'रेटिंगबद्दल धन्यवाद.',
  notFound: 'ही विनंती सापडली नाही.',
  visit: 'देखभाल भेट',
  scheduled: (date) => `${date} ला भेट`,
};
