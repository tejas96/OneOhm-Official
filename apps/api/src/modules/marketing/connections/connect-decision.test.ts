import type { GoogleCustomerChoice, MetaAdAccountChoice, MetaPageChoice } from '@oneohm/marketing';
import { describe, expect, it } from 'vitest';
import {
  checkChoice,
  currencyProblem,
  decideGoogle,
  decideMeta,
  googleOutcome,
  metaOutcome,
} from './connect-decision';

const account = (id: string, accountStatus = 1): MetaAdAccountChoice => ({
  id,
  name: id,
  note: null,
  currency: 'INR',
  accountStatus,
});
const page = (id: string): MetaPageChoice => ({
  id,
  name: id,
  note: null,
  pageToken: `token-${id}`,
  instagramId: null,
  instagramUsername: null,
});
const customer = (id: string): GoogleCustomerChoice => ({
  id,
  name: id,
  note: null,
  currency: 'INR',
  loginCustomerId: null,
});

describe('Meta callback decision', () => {
  it('picks one account and one page', () => {
    const decision = decideMeta({ adAccounts: [account('act_1')], pages: [page('p1')] });
    expect(decision.kind).toBe('pick');
  });
  it('asks when there are several', () => {
    expect(decideMeta({ adAccounts: [account('a'), account('b')], pages: [page('p')] }).kind).toBe(
      'choose',
    );
    expect(decideMeta({ adAccounts: [account('a')], pages: [page('p'), page('q')] }).kind).toBe(
      'choose',
    );
  });
  it('explains when there is nothing to use', () => {
    expect(decideMeta({ adAccounts: [], pages: [page('p')] }).kind).toBe('error');
    expect(decideMeta({ adAccounts: [account('a')], pages: [] }).kind).toBe('error');
  });
  it('is connected, or in review for missing permissions and pending accounts', () => {
    expect(metaOutcome([], 1)).toEqual({ status: 'connected', lastError: null });
    expect(metaOutcome(['pages_messaging'], 1).status).toBe('in_review');
    expect(metaOutcome(['public_profile'], 1).status).toBe('connected');
    expect(metaOutcome([], 7)).toEqual({
      status: 'in_review',
      lastError: 'Meta is reviewing your ad account',
    });
  });
});

describe('Google callback decision', () => {
  it('picks one customer, asks for several', () => {
    expect(decideGoogle({ customers: [customer('1')] }).kind).toBe('pick');
    expect(decideGoogle({ customers: [customer('1'), customer('2')] }).kind).toBe('choose');
    expect(decideGoogle({ customers: [] }).kind).toBe('error');
  });
  it('waits for the developer token approval', () => {
    expect(googleOutcome(true)).toEqual({
      status: 'in_review',
      missing: ['Google Ads developer token approval'],
    });
    expect(googleOutcome(false).status).toBe('connected');
  });
});

describe('choosing', () => {
  const offered = { accounts: ['act_1'], pages: ['p1'] };
  it('accepts only offered ids, and needs a page for Meta', () => {
    expect(checkChoice('meta', offered, { accountId: 'act_1', pageId: 'p1' })).toBeNull();
    expect(checkChoice('meta', offered, { accountId: 'act_9', pageId: 'p1' })).not.toBeNull();
    expect(checkChoice('meta', offered, { accountId: 'act_1' })).not.toBeNull();
    expect(checkChoice('meta', offered, { accountId: 'act_1', pageId: 'zz' })).not.toBeNull();
    expect(checkChoice('google', { accounts: ['1'], pages: [] }, { accountId: '1' })).toBeNull();
  });
});

describe('currencyProblem', () => {
  it('accepts rupees and refuses any other money', () => {
    expect(currencyProblem('INR')).toBeNull();
    expect(currencyProblem('USD')).toBe(
      'OneOhm runs ads in rupees. Pick an ad account set to INR.',
    );
  });
});
