import { describe, expect, it } from 'vitest';
import { findPlace, placeReviews } from './google-places';
import { fail, fakeGoogle } from './google-test-kit';

describe('findPlace', () => {
  it('searches in India and lists the places', async () => {
    const google = fakeGoogle([
      [
        'places:searchText',
        () => ({
          places: [{ id: 'p1', displayName: { text: 'Sun Power' }, formattedAddress: 'Pune' }, {}],
        }),
      ],
    ]);
    const places = await findPlace('KEY', 'sun power pune', google.fetch);
    expect(places).toEqual([{ id: 'p1', name: 'Sun Power', address: 'Pune' }]);
    const call = google.calls[0];
    expect(call?.url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(call?.method).toBe('POST');
    expect(call?.headers['X-Goog-Api-Key']).toBe('KEY');
    expect(call?.headers['X-Goog-FieldMask']).toBe(
      'places.id,places.displayName,places.formattedAddress',
    );
    expect(call?.body).toEqual({ textQuery: 'sun power pune', regionCode: 'IN' });
  });

  it('says the key cannot read places', async () => {
    const google = fakeGoogle([
      ['places', () => fail(403, { error: { status: 'PERMISSION_DENIED', message: 'denied' } })],
    ]);
    await expect(findPlace('BAD', 'x', google.fetch)).rejects.toMatchObject({
      kind: 'permission',
      message: 'The Google Maps key cannot read places.',
    });
  });

  it('treats an outage as temporary', async () => {
    const google = fakeGoogle([['places', () => fail(503, {})]]);
    await expect(findPlace('K', 'x', google.fetch)).rejects.toMatchObject({ kind: 'temporary' });
  });
});

describe('placeReviews', () => {
  it('reads rating, total and reviews', async () => {
    const google = fakeGoogle([
      [
        'places/p1',
        () => ({
          rating: 4.6,
          userRatingCount: 87,
          reviews: [
            {
              name: 'places/p1/reviews/r1',
              rating: 5,
              authorAttribution: { displayName: 'Asha' },
              text: { text: 'Great work' },
              publishTime: '2026-11-01T08:00:00Z',
            },
            {
              name: 'places/p1/reviews/r2',
              rating: 3,
              authorAttribution: { displayName: 'Bob' },
              originalText: { text: 'Theek hai' },
            },
          ],
        }),
      ],
    ]);
    const result = await placeReviews('KEY', 'p1', google.fetch);
    expect(google.calls[0]?.url).toBe('https://places.googleapis.com/v1/places/p1');
    expect(google.calls[0]?.headers['X-Goog-FieldMask']).toBe('rating,userRatingCount,reviews');
    expect(result.rating).toBe(4.6);
    expect(result.total).toBe(87);
    expect(result.reviews).toEqual([
      {
        externalId: 'places/p1/reviews/r1',
        author: 'Asha',
        rating: 5,
        text: 'Great work',
        publishedAt: new Date('2026-11-01T08:00:00Z'),
      },
      {
        externalId: 'places/p1/reviews/r2',
        author: 'Bob',
        rating: 3,
        text: 'Theek hai',
        publishedAt: null,
      },
    ]);
  });

  it('handles a place with no reviews', async () => {
    const google = fakeGoogle([['places/p2', () => ({})]]);
    expect(await placeReviews('K', 'p2', google.fetch)).toEqual({
      rating: null,
      total: 0,
      reviews: [],
    });
  });
});
