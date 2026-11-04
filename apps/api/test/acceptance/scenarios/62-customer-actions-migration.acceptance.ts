import { afterAll, describe, expect, it } from 'vitest';
import { closeDb } from '../support/db';
import { migrateOverOldRows } from '../support/migration-check';

// Customer actions (redesign §2): the migration turns every paper request into a customer
// action of type paper, keeping ids, times, files, notes and askers, and drops the old table.

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

interface Action {
  id: string;
  type: string;
  status: string;
  title: string;
  note: string;
  reason: string;
  document_id: string | null;
  done_at: Date | null;
  closed_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
  property_id: string | null;
  project_id: string | null;
}

describe('Customer actions: the migration', () => {
  afterAll(closeDb);

  it('keeps every old request with its id, times, file, note and latest reason', async () => {
    const result = await migrateOverOldRows(
      '0073_customer_actions',
      async (query) => {
        await query(
          `INSERT INTO customers (id, name, phone_e164) VALUES ('${id(9)}', 'Old (test)', '+919000000009')`,
        );
        // A real project (customer, site, discom, product, quotation) so every foreign key holds.
        await query(`INSERT INTO properties (id, customer_id, label, address_line, city, district)
          VALUES ('${id(6)}', '${id(9)}', 'Old site', '1 Road', 'Sangli', 'Sangli')`);
        await query(
          `INSERT INTO discoms (id, code, name, state) VALUES ('${id(7)}', 'OLD', 'Old', 'MH')`,
        );
        await query(`INSERT INTO products (id, sku, name, brand, category, price_paise, cost_paise, tax_rate_bp)
          VALUES ('${id(4)}', 'OLD-1', 'Panel', 'Brand', 'panel', 1, 1, 0)`);
        await query(`INSERT INTO quotations (id, number, customer_id, property_id, subsidy_category, target_wp, capacity_wp,
            module_count, panel_product_id, inverter_product_id, structure_type, floors, contingency_bp, tolerance_bp,
            subtotal_paise, contingency_paise, tax_paise, total_paise, cost_paise, margin_paise, subsidy_paise,
            effective_paise, snapshot, valid_until)
          VALUES ('${id(3)}', 'Q-OLD', '${id(9)}', '${id(6)}', 'individual', 3000, 3000, 6, '${id(4)}', '${id(4)}',
            'rcc_elevated', 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, '{}', '2026-12-01')`);
        await query(`INSERT INTO projects (id, code, name, customer_id, property_id, quotation_id, type, discom_id, capacity_wp, start_date)
          VALUES ('${id(8)}', 'OH-OLD', 'Old project', '${id(9)}', '${id(6)}', '${id(3)}', 'residential', '${id(7)}', 3000, '2026-10-01')`);
        await query(`INSERT INTO documents (id, category, source, name, storage_key, content_type, size_bytes, created_at)
          VALUES ('${id(5)}', 'electricity_bill', 'upload', 'bill.pdf', 'k', 'application/pdf', 1, '2026-10-01')`);
        await query(`INSERT INTO document_requests
          (id, customer_id, project_id, category, title, note, status, document_id, received_at, cancelled_at, created_at, updated_at)
          VALUES
          ('${id(1)}', '${id(9)}', '${id(8)}', 'electricity_bill', 'Bill', 'call me', 'open', null, null, null, '2026-10-02', '2026-10-02'),
          ('${id(2)}', '${id(9)}', null, 'electricity_bill', 'Bill 2', 'x', 'received', '${id(5)}', '2026-10-03', null, '2026-10-02', '2026-10-03'),
          ('${id(3)}', '${id(9)}', null, 'customer_kyc', 'Aadhaar', '', 'cancelled', null, null, '2026-10-04', '2026-10-02', '2026-10-04')`);
        await query(`INSERT INTO audit_log (action, entity, entity_id, data)
          VALUES ('document_request.reasked', 'document_request', '${id(2)}', '{"note":"too dark"}')`);
      },
      async (query) => ({
        actions: await query<Action>(
          `SELECT id, type::text AS type, status::text AS status, title, note, reason, document_id,
                  done_at, closed_at, cancelled_at, created_at, property_id, project_id FROM customer_actions ORDER BY id`,
        ),
        checked: await query<{ checked: boolean }>(
          'SELECT checked_at IS NOT NULL AS checked FROM documents',
        ),
        old: await query<{ t: string | null }>(
          `SELECT to_regclass('document_requests')::text AS t`,
        ),
      }),
    );
    expect(result.actions.map((a) => [a.id, a.type, a.status, a.title, a.note, a.reason])).toEqual([
      [id(1), 'paper', 'open', 'Bill', 'call me', ''],
      // Received, and its file counts as checked (all old papers do): closed, no flood.
      [id(2), 'paper', 'closed', 'Bill 2', 'x', 'too dark'],
      [id(3), 'paper', 'cancelled', 'Aadhaar', '', ''],
    ]);
    const [, received, cancelled] = result.actions;
    expect(received?.document_id).toBe(id(5));
    expect(received?.done_at?.toISOString()).toBe('2026-10-03T00:00:00.000Z');
    expect(received?.created_at.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    expect(cancelled?.cancelled_at?.toISOString()).toBe('2026-10-04T00:00:00.000Z');
    // The ask on a project takes that project's site; a person's ask has none.
    expect(result.actions.map((a) => [a.project_id, a.property_id])).toEqual([
      [id(8), id(6)],
      [null, null],
      [null, null],
    ]);
    expect(result.checked).toEqual([{ checked: true }]);
    expect(result.old).toEqual([{ t: null }]);
  });
});
