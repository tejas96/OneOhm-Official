import { describe, expect, it } from 'vitest';
import { whatsappFileScope } from './chat-files-kept';

describe('the storage folder of a WhatsApp file', () => {
  it('keeps a plain media id', () => {
    expect(whatsappFileScope('c1', 'wamid-12_3')).toBe('customers/c1/whatsapp/wamid-12_3/');
  });

  it('lets no dot or slash through, so a media id cannot climb out of the folder', () => {
    expect(whatsappFileScope('c1', '..')).toBe('customers/c1/whatsapp/__/');
    expect(whatsappFileScope('c1', '../x.y/z')).toBe('customers/c1/whatsapp/___x_y_z/');
  });
});
