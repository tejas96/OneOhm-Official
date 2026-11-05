import { localized, type Words } from '../whatsapp/assistant/language';
import type { FormStart } from '../whatsapp/forms/form-send';
import { REFER_SCREEN } from '../whatsapp/forms/refer-friend.flow';
import { PROBLEM_SCREEN } from '../whatsapp/forms/report-problem.flow';
import { UPI_SCREEN } from '../whatsapp/forms/share-upi.flow';
import { PROBLEM_KINDS, SINCE_CHOICES } from './care-taps';
import { PROBLEM_WORDS } from './problem-words';
import { REFER_WORDS } from './refer-words';

/**
 * The words filled into the problem, refer-a-friend and UPI forms, in the customer's language. Meta's
 * limits: heading 80, TextInput label 20, radio label 30, helper text 80, photo hint 300, Footer 35.
 */
const EN = {
  problemHeading: 'Report a problem',
  homeLabel: 'Which home?',
  whatLabel: 'What is wrong?',
  sinceLabel: 'Since when?',
  photosLabel: 'Photos or videos',
  photosHint: 'Up to 3. They help us a lot.',
  noteLabel: 'Anything to add?',
  send: 'Send',
  referHeading: 'Refer a friend',
  friendLabel: "Friend's name",
  mobileLabel: 'Mobile number',
  mobileHint: '10 digits',
  cityLabel: 'City',
  upiHeading: 'Your UPI ID',
  upiLabel: 'UPI ID',
  upiHint: 'For example name@bank',
};

const MR: Words<typeof EN> = {
  problemHeading: 'अडचण सांगा',
  homeLabel: 'कोणते घर?',
  whatLabel: 'काय अडचण आहे?',
  sinceLabel: 'किती दिवसांपासून?',
  photosLabel: 'फोटो किंवा व्हिडिओ',
  photosHint: '३ पर्यंत. त्यामुळे आम्हाला खूप मदत होते.',
  noteLabel: 'आणखी काही?',
  send: 'पाठवा',
  referHeading: 'मित्राला सांगा',
  friendLabel: 'मित्राचे नाव',
  mobileLabel: 'मोबाईल नंबर',
  mobileHint: '१० अंक',
  cityLabel: 'शहर',
  upiHeading: 'तुमचा UPI आयडी',
  upiLabel: 'UPI आयडी',
  upiHint: 'उदा. name@bank',
};

const HI: Words<typeof EN> = {
  problemHeading: 'समस्या बताएँ',
  homeLabel: 'कौन सा घर?',
  whatLabel: 'क्या समस्या है?',
  sinceLabel: 'कब से?',
  photosLabel: 'फ़ोटो या वीडियो',
  photosHint: '3 तक। इनसे हमें बहुत मदद मिलती है।',
  noteLabel: 'कुछ और बताना है?',
  send: 'भेजें',
  referHeading: 'दोस्त को बताएँ',
  friendLabel: 'दोस्त का नाम',
  mobileLabel: 'मोबाइल नंबर',
  mobileHint: '10 अंक',
  cityLabel: 'शहर',
  upiHeading: 'आपका UPI आईडी',
  upiLabel: 'UPI आईडी',
  upiHint: 'जैसे name@bank',
};

export const CARE_FORM_LISTS = { en: EN, mr: MR, hi: HI };
const FORM = localized(EN, { mr: MR, hi: HI });

/** The start of the problem form: the homes (when 2 or more), the choices and the words. */
export function problemFormStart(
  homes: readonly { id: string; city: string }[],
  payload: Record<string, unknown>,
): FormStart {
  return {
    body: PROBLEM_WORDS.formBody,
    button: PROBLEM_WORDS.formButton,
    screen: PROBLEM_SCREEN,
    data: {
      heading: FORM.problemHeading,
      home_label: FORM.homeLabel,
      what_label: FORM.whatLabel,
      since_label: FORM.sinceLabel,
      photos_label: FORM.photosLabel,
      photos_hint: FORM.photosHint,
      note_label: FORM.noteLabel,
      send: FORM.send,
      ask_home: homes.length > 1,
      home_options: homes
        .slice(0, 10)
        .map((home) => ({ id: home.id, title: home.city.slice(0, 30) })),
      what_options: PROBLEM_KINDS.map((id) => ({ id, title: PROBLEM_WORDS.what[id].slice(0, 30) })),
      since_options: SINCE_CHOICES.map((id) => ({
        id,
        title: PROBLEM_WORDS.since[id].slice(0, 30),
      })),
    },
    payload,
  };
}

/** The start of the refer-a-friend form. */
export function referFormStart(
  cities: readonly string[],
  payload: Record<string, unknown>,
): FormStart {
  return {
    body: REFER_WORDS.formBody,
    button: REFER_WORDS.formButton,
    screen: REFER_SCREEN,
    data: {
      heading: FORM.referHeading,
      name_label: FORM.friendLabel,
      mobile_label: FORM.mobileLabel,
      mobile_hint: FORM.mobileHint,
      city_label: FORM.cityLabel,
      send: FORM.send,
      city_options: cities.slice(0, 20).map((city) => ({ id: city, title: city.slice(0, 30) })),
    },
    payload,
  };
}

/** The start of the UPI form. */
export function upiFormStart(amount: string, payload: Record<string, unknown>): FormStart {
  return {
    body: REFER_WORDS.upiAsk(amount),
    button: REFER_WORDS.upiButton,
    screen: UPI_SCREEN,
    data: {
      heading: FORM.upiHeading,
      upi_label: FORM.upiLabel,
      upi_hint: FORM.upiHint,
      send: FORM.send,
    },
    payload,
  };
}
