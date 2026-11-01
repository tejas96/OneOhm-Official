-- Close projects that finished after their last payment (financial closure was only
-- recorded when the payment came last). Uses the latest payment time as the date.
UPDATE "projects" AS p
SET "financially_closed_at" = COALESCE(
      (SELECT max(pay."created_at") FROM "payments" pay WHERE pay."project_id" = p."id"),
      p."updated_at"
    ),
    "updated_at" = now()
WHERE p."status" = 'completed'
  AND p."financially_closed_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "payment_milestones" m
    WHERE m."project_id" = p."id" AND m."status" <> 'paid'
  );
