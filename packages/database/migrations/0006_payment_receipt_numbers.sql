ALTER TABLE "payments" ADD COLUMN "receipt_number" text;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_receipt_number_unique" ON "payments" USING btree ("receipt_number");--> statement-breakpoint
-- Number the payments recorded before receipt numbers were stored, per financial year
-- of the day the money arrived, in the order they were recorded.
UPDATE "payments" AS p SET "receipt_number" = numbered.receipt_number
FROM (
  SELECT id,
    'OH/RCPT/' || fy || '/' || lpad(row_number() OVER (PARTITION BY fy ORDER BY created_at, id)::text, 4, '0') AS receipt_number
  FROM (
    SELECT id, created_at,
      start_year || '-' || lpad(((start_year + 1) % 100)::text, 2, '0') AS fy
    FROM (
      SELECT id, created_at,
        CASE WHEN extract(month FROM received_on) >= 4
          THEN extract(year FROM received_on)::int
          ELSE extract(year FROM received_on)::int - 1 END AS start_year
      FROM "payments"
      WHERE "reverses_payment_id" IS NULL AND "receipt_number" IS NULL
    ) AS years
  ) AS by_year
) AS numbered
WHERE p.id = numbered.id;
