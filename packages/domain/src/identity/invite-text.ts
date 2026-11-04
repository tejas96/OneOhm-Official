import { DEFAULT_MESSAGE_TEMPLATES, renderTemplate } from '../messaging/message-templates';

/**
 * The `staff_welcome` WhatsApp message with its values filled in: what an admin can copy
 * and paste when the WhatsApp send did not arrive.
 */
export function inviteText(firstName: string, link: string): string {
  const template = DEFAULT_MESSAGE_TEMPLATES.find((entry) => entry.key === 'staff_welcome');
  if (!template) throw new Error('The staff_welcome template is missing.');
  return renderTemplate(template.preview, template.fields, { name: firstName, link });
}
