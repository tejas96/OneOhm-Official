import { describe, expect, it } from 'vitest';
import { AUTO_ATTACH_SECONDS, joinedOf, withJoined } from './problem-joined';
import { recentRequest } from './problem-raised';
import { WHAT_LISTS } from './what-words';
import { EN } from './words';
import { HI } from './words-hi';
import { MR } from './words-mr';

describe('files that join a problem on their own', () => {
  const raised = (at: number) => ({ raised: { id: 'req-1', at } });

  it('a file during the flow or 1 to 3 seconds after Done is inside the two minutes; 3 minutes is not', () => {
    const doneAt = 1_000_000;
    expect(recentRequest(raised(doneAt), doneAt + 1_000, AUTO_ATTACH_SECONDS)?.id).toBe('req-1');
    expect(recentRequest(raised(doneAt), doneAt + 3_000, AUTO_ATTACH_SECONDS)?.id).toBe('req-1');
    expect(recentRequest(raised(doneAt), doneAt + 119_000, AUTO_ATTACH_SECONDS)).not.toBeNull();
    expect(recentRequest(raised(doneAt), doneAt + 180_000, AUTO_ATTACH_SECONDS)).toBeNull();
    // The half-hour window of "Is this for your problem?" is unchanged.
    expect(recentRequest(raised(doneAt), doneAt + 180_000)?.id).toBe('req-1');
    expect(recentRequest(raised(doneAt), doneAt + 31 * 60_000)).toBeNull();
  });

  it('counts a burst and moves the one reply to after the last file', () => {
    let context: unknown = {};
    for (const [index, kind] of (['video', 'photo', 'photo'] as const).entries())
      context = { joined: withJoined(context, 'req-1', kind, 1_000 + index * 1_000, 15) };
    expect(joinedOf(context)).toEqual({
      requestId: 'req-1',
      photos: 2,
      videos: 1,
      voices: 0,
      replyAt: 3_000 + 15_000,
    });
    expect(joinedOf({ joined: null })).toBeNull();
  });

  it('says the count in English, Marathi and Hindi, singular and plural', () => {
    expect(EN.MEDIA_WORDS.joined(2, 1, 0)).toBe('Added 2 photos and 1 video to your problem ✅');
    expect(EN.MEDIA_WORDS.joined(1, 0, 0)).toBe('Added 1 photo to your problem ✅');
    expect(EN.MEDIA_WORDS.joined(1, 2, 1)).toBe(
      'Added 1 photo, 2 videos and 1 voice note to your problem ✅',
    );
    expect(MR.MEDIA_WORDS.joined(2, 1, 0)).toBe('तुमच्या समस्येला 2 फोटो आणि 1 व्हिडिओ जोडले ✅');
    expect(HI.MEDIA_WORDS.joined(2, 1, 0)).toBe('आपकी समस्या में 2 फ़ोटो और 1 वीडियो जोड़ दिए गए ✅');
  });
});

describe('the saved line for a file with no kind', () => {
  it('reads "Your file", never "Other file"', () => {
    expect(WHAT_LISTS.en.otherFile).toBe('Your file');
    expect(WHAT_LISTS.en.savedOther('Sangli')).toBe("Saved ✅ Your file · Sangli. We'll check it.");
    expect(WHAT_LISTS.en.savedOther(null)).toBe("Saved ✅ Your file. We'll check it.");
    for (const lang of ['en', 'mr', 'hi'] as const) {
      const words = WHAT_LISTS[lang];
      expect(words.otherFile).not.toMatch(/other|इतर|दूसरी/iu);
      expect(words.savedOther('Sangli')).toContain('Sangli');
      expect(words.savedOtherMany(3, null)).toContain('3');
    }
  });
});
