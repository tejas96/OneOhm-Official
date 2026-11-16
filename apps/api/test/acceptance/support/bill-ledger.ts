import { rows } from './db';

/** The net of an approved bill's ledger entry and whatever reverses it, per account (paise, as text). */
export const billLedgerNet = (billId: string) =>
  rows<{ account_code: string; net: string }>(
    `select l.account_code, sum(l.debit_paise - l.credit_paise) as net
       from journal_entries e join journal_lines l on l.entry_id = e.id
      where (e.source_type = 'payable_approved' and e.source_id = $1)
         or (e.source_type = 'reversal'
             and e.source_id in (select id::text from journal_entries
                                  where source_type = 'payable_approved' and source_id = $1))
      group by l.account_code order by l.account_code`,
    [billId],
  );
