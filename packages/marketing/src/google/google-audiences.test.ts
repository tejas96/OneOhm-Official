import { describe, expect, it } from 'vitest';
import { createGooglePlatform } from './google-platform';
import { fail, fakeGoogle, testAccess, testApp } from './google-test-kit';

describe('google audiences', () => {
  it('finds or creates the list, then runs a job with the hashes', async () => {
    const google = fakeGoogle([
      ['googleAds:search', () => ({})],
      [
        'userLists:mutate',
        () => ({ results: [{ resourceName: 'customers/1234567890/userLists/42' }] }),
      ],
      [
        'offlineUserDataJobs:create',
        () => ({ resourceName: 'customers/1234567890/offlineUserDataJobs/9' }),
      ],
      [':addOperations', () => ({})],
      [':run', () => ({})],
    ]);
    const platform = createGooglePlatform(testAccess(), testApp(google.fetch));
    const result = await platform.syncAudience({
      kind: 'customers',
      externalId: null,
      add: ['h1', 'h2'],
      remove: [],
    });
    expect(result).toEqual({ externalId: 'customers/1234567890/userLists/42', status: 'ready' });
    const create = google.calls.find((c) => c.url.includes('userLists:mutate'));
    expect(create?.body.operations[0].create).toEqual({
      name: 'OneOhm · Customers',
      crmBasedUserList: { uploadKeyType: 'CONTACT_INFO', dataSourceType: 'FIRST_PARTY' },
      membershipLifeSpan: 30,
    });
    const job = google.calls.find((c) => c.url.includes('offlineUserDataJobs:create'));
    expect(job?.body.job).toEqual({
      type: 'CUSTOMER_MATCH_USER_LIST',
      customerMatchUserListMetadata: {
        userList: 'customers/1234567890/userLists/42',
        consent: { adUserData: 'GRANTED', adPersonalization: 'GRANTED' },
      },
    });
    const add = google.calls.find((c) => c.url.endsWith('offlineUserDataJobs/9:addOperations'));
    expect(add?.body).toEqual({
      operations: [
        { create: { userIdentifiers: [{ hashedPhoneNumber: 'h1' }] } },
        { create: { userIdentifiers: [{ hashedPhoneNumber: 'h2' }] } },
      ],
      enablePartialFailure: true,
    });
    expect(google.calls.at(-1)?.url).toMatch(/offlineUserDataJobs\/9:run$/);
  });

  it('batches adds at 10 000 and leaves removes for the next run', async () => {
    const google = fakeGoogle([
      [
        'offlineUserDataJobs:create',
        () => ({ resourceName: 'customers/1234567890/offlineUserDataJobs/1' }),
      ],
      [':addOperations', () => ({})],
      [':run', () => ({})],
    ]);
    const platform = createGooglePlatform(testAccess(), testApp(google.fetch));
    const many = Array.from({ length: 10_001 }, (_, i) => `h${i}`);
    const result = await platform.syncAudience({
      kind: 'interested',
      externalId: 'customers/1234567890/userLists/5',
      add: many,
      remove: ['gone'],
    });
    expect(result.status).toBe('ready');
    expect(result.error).toContain('remove');
    const adds = google.calls.filter((c) => c.url.endsWith(':addOperations'));
    expect(adds.map((c) => c.body.operations.length)).toEqual([10_000, 1]);
    expect(google.calls.filter((c) => c.url.includes('offlineUserDataJobs:create'))).toHaveLength(
      1,
    );
  });

  it('runs removes alone when there is nothing to add', async () => {
    const google = fakeGoogle([
      ['offlineUserDataJobs:create', () => ({ resourceName: 'customers/1/offlineUserDataJobs/2' })],
      [':addOperations', () => ({})],
      [':run', () => ({})],
    ]);
    const platform = createGooglePlatform(testAccess(), testApp(google.fetch));
    const result = await platform.syncAudience({
      kind: 'interested',
      externalId: 'customers/1234567890/userLists/5',
      add: [],
      remove: ['gone'],
    });
    expect(result).toEqual({ externalId: 'customers/1234567890/userLists/5', status: 'ready' });
    expect(google.calls.find((c) => c.url.endsWith(':addOperations'))?.body.operations).toEqual([
      { remove: { userIdentifiers: [{ hashedPhoneNumber: 'gone' }] } },
    ]);
  });

  it('reports a partial failure instead of ready, and does not run the job', async () => {
    const google = fakeGoogle([
      ['offlineUserDataJobs:create', () => ({ resourceName: 'customers/1/offlineUserDataJobs/3' })],
      [
        ':addOperations',
        () => ({
          partialFailureError: {
            message: 'Partial failure',
            details: [{ errors: [{ message: 'Some numbers are not valid.' }] }],
          },
        }),
      ],
      [':run', () => ({})],
    ]);
    const platform = createGooglePlatform(testAccess(), testApp(google.fetch));
    const result = await platform.syncAudience({
      kind: 'customers',
      externalId: 'customers/1234567890/userLists/5',
      add: ['h'],
      remove: [],
    });
    expect(result).toMatchObject({ status: 'failed', error: 'Some numbers are not valid.' });
    expect(google.calls.some((c) => c.url.endsWith(':run'))).toBe(false);
  });

  it('throws on a concurrent modification so it is retried', async () => {
    const google = fakeGoogle([
      [
        'offlineUserDataJobs:create',
        () =>
          fail(409, {
            error: {
              details: [{ errors: [{ errorCode: { databaseError: 'CONCURRENT_MODIFICATION' } }] }],
            },
          }),
      ],
    ]);
    const platform = createGooglePlatform(testAccess(), testApp(google.fetch));
    await expect(
      platform.syncAudience({
        kind: 'customers',
        externalId: 'customers/1234567890/userLists/5',
        add: ['h'],
        remove: [],
      }),
    ).rejects.toMatchObject({ kind: 'temporary' });
  });

  it('says not_allowed when Customer Match is closed', async () => {
    const google = fakeGoogle([
      [
        'userLists:mutate',
        () =>
          fail(403, {
            error: {
              details: [
                {
                  errors: [
                    {
                      errorCode: {
                        authorizationError: 'CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE',
                      },
                      message: 'no',
                    },
                  ],
                },
              ],
            },
          }),
      ],
      ['googleAds:search', () => ({})],
    ]);
    const platform = createGooglePlatform(testAccess(), testApp(google.fetch));
    expect(
      await platform.syncAudience({ kind: 'customers', externalId: null, add: ['h'], remove: [] }),
    ).toEqual({
      externalId: null,
      status: 'not_allowed',
      error: 'Google opens customer lists once the account qualifies; your ads still run.',
    });
  });

  it('reports other refusals as failed, and lookalike as ready', async () => {
    const google = fakeGoogle([
      ['googleAds:search', () => fail(400, { error: { message: 'Bad list' } })],
    ]);
    const platform = createGooglePlatform(testAccess(), testApp(google.fetch));
    const result = await platform.syncAudience({
      kind: 'customers',
      externalId: null,
      add: ['h'],
      remove: [],
    });
    expect(result).toMatchObject({ status: 'failed', error: 'Bad list' });
    expect(await platform.ensureLookalike('x', null)).toEqual({
      externalId: null,
      status: 'ready',
    });
  });
});
