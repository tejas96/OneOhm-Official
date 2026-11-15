import { esc, pageOf, paragraphs } from './html';

export interface LandingView {
  readonly brand: string;
  readonly code: string;
  /** The page's full public address (`API_PUBLIC_URL/v1/go/<code>`): the form posts here. */
  readonly pageUrl: string;
  readonly text: string;
  readonly media: { readonly kind: 'image' | 'video'; readonly path: string } | null;
  /** The business WhatsApp number as digits with country code, or null when not set up. */
  readonly whatsappDigits: string | null;
  /** The short reference of this visit; carried in the chat opener and the form. */
  readonly ref: string | null;
  readonly city: string;
  readonly error?: string | null;
  readonly values?: { readonly name: string; readonly phone: string; readonly city: string };
}

/** The page's own address, without `/v1` in front of the host's root. */
export const landingPath = (code: string) => `/v1/go/${encodeURIComponent(code)}`;

/** `wa.me` link whose message starts the chat with the campaign code and this visit's ref. */
export function whatsappLink(digits: string, code: string, ref: string | null): string {
  const message = `Hi OneOhm ${code}${ref ? ` #${ref}` : ''}`;
  return `https://wa.me/${digits.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}

function mediaHtml(media: LandingView['media']): string {
  if (!media) return '';
  return media.kind === 'video'
    ? `<video controls playsinline preload="metadata" src="${esc(media.path)}"></video>`
    : `<img src="${esc(media.path)}" alt="">`;
}

function formHtml(view: LandingView): string {
  const values = view.values ?? { name: '', phone: '', city: view.city };
  return `<h2>Prefer a call back?</h2>
${view.error ? `<p class="err" role="alert">${esc(view.error)}</p>` : ''}
<form method="post" action="${esc(view.pageUrl)}">
<label>Your name<input name="name" autocomplete="name" required maxlength="80" value="${esc(values.name)}"></label>
<label>Mobile number<input name="phone" type="tel" inputmode="numeric" autocomplete="tel" required maxlength="16" value="${esc(values.phone)}"></label>
<label>City<input name="city" autocomplete="address-level2" required maxlength="80" value="${esc(values.city)}"></label>
<input type="hidden" name="ref" value="${esc(view.ref ?? '')}">
<div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
<button type="submit">Call me back</button>
</form>`;
}

/** The mobile landing page of a campaign: photo, words, a WhatsApp button and a call-back form. */
export function renderLanding(view: LandingView): string {
  const chat = view.whatsappDigits
    ? `<a class="wa" href="${esc(whatsappLink(view.whatsappDigits, view.code, view.ref))}">Chat on WhatsApp</a>`
    : '';
  return pageOf(
    view.brand,
    `<h1>${esc(view.brand)}</h1>${mediaHtml(view.media)}<div class="text">${paragraphs(view.text)}</div>${chat}${formHtml(view)}<footer><a href="${esc(view.pageUrl)}/privacy">Privacy</a></footer>`,
  );
}

/** What a visitor sees when the offer is over. */
export function renderEnded(brand: string, phone: string | null): string {
  const call = phone
    ? `<p>You can still call us on <a href="tel:${esc(phone.replace(/[^\d+]/g, ''))}">${esc(phone)}</a>.</p>`
    : '';
  return pageOf(
    brand,
    `<h1>${esc(brand)}</h1><h2>This offer has ended</h2><p>Thank you for your interest.</p>${call}`,
  );
}

/** The thank-you after the call-back form. */
export function renderThanks(brand: string): string {
  return pageOf(
    brand,
    `<h1>${esc(brand)}</h1><h2>Thank you</h2><p>We have your details. Our team will call you soon.</p>`,
  );
}

export interface PrivacyView {
  readonly legalName: string;
  readonly address: string;
  readonly email: string;
}

/** Who collects the form's details, what, why and for how long. */
export function renderPrivacy(view: PrivacyView): string {
  const who = esc(view.legalName);
  return pageOf(
    `Privacy · ${view.legalName}`,
    `<h1>${who}</h1><h2>Privacy</h2>
<p><b>Who collects it.</b> ${who}, ${esc(view.address)}.</p>
<p><b>What we collect.</b> Your name, mobile number and city, when you send the call-back form or message us.</p>
<p><b>Why.</b> To call or message you about solar for your home or business. We do not sell your details.</p>
<p><b>How long.</b> We keep them while we are talking to you about solar, and for as long as the law needs us to keep our records. Ask us and we will delete them sooner where we can.</p>
<p><b>Contact.</b> Write to <a href="mailto:${esc(view.email)}">${esc(view.email)}</a> to see, correct or delete your details.</p>`,
  );
}
