import type { MetaAccess } from '../access';
import { phoneDigits } from '../hashing';
import type { LaunchInput } from '../types';

type Json = Record<string, unknown>;

/** The button and link: open a WhatsApp chat, or the lead form. */
function action(input: LaunchInput, leadFormId: string | null) {
  if (input.goal === 'chats') {
    const digits = phoneDigits(input.whatsappNumber ?? '');
    const text = input.openerText ? `&text=${encodeURIComponent(input.openerText)}` : '';
    return {
      link: `https://api.whatsapp.com/send?phone=${digits}${text}`,
      type: 'WHATSAPP_MESSAGE',
      value: { app_destination: 'WHATSAPP' } as Json,
    };
  }
  return {
    link: input.landingUrl,
    type: 'SIGN_UP',
    value: { lead_gen_form_id: leadFormId } as Json,
  };
}

/** What Meta shows: the page (and Instagram account) posting a photo or video with a button. */
export function objectStorySpec(
  access: MetaAccess,
  input: LaunchInput,
  media: {
    readonly imageHash: string | null;
    readonly videoId: string | null;
    readonly thumbnail: string | null;
  },
  leadFormId: string | null,
): Json {
  const { link, type, value } = action(input, leadFormId);
  const identity: Json = {
    page_id: access.details.pageId,
    ...(access.details.instagramId ? { instagram_user_id: access.details.instagramId } : {}),
  };
  if (input.media.kind === 'video') {
    return {
      ...identity,
      video_data: {
        video_id: media.videoId,
        image_url: media.thumbnail,
        message: input.text,
        title: input.headline,
        call_to_action: { type, value: { ...value, link } },
      },
    };
  }
  return {
    ...identity,
    link_data: {
      image_hash: media.imageHash,
      message: input.text,
      name: input.headline,
      link,
      call_to_action: { type, value },
    },
  };
}
