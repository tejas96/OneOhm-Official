import { describe, expect, it } from 'vitest';
import { canTypeReply, isSocial } from './chat-channel';

describe('chat channel', () => {
  it('knows the social channels', () => {
    expect(isSocial('whatsapp')).toBe(false);
    expect(isSocial('instagram')).toBe(true);
    expect(isSocial('messenger')).toBe(true);
  });

  it('blocks typing in a closed social chat only', () => {
    expect(canTypeReply({ channel: 'instagram', windowOpen: false })).toBe(false);
    expect(canTypeReply({ channel: 'messenger', windowOpen: true })).toBe(true);
    expect(canTypeReply({ channel: 'whatsapp', windowOpen: false })).toBe(true);
  });
});
