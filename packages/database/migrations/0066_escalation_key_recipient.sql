-- Alert keys now carry their recipient (see apps/worker escalation-keys.ts). Carry the
-- existing keys over so the first run after deploy does not alert everyone again.
-- Holders first: their old shape (…:<user_id>) equals the new manager shape.
UPDATE notifications SET dedupe_key = regexp_replace(dedupe_key, ':' || user_id::text || '$', ':holders:' || user_id::text)
WHERE user_id IS NOT NULL
  AND (dedupe_key ~ '^escalate:[^:]+:manager:[^:]+$' OR dedupe_key ~ '^stuck:[^:]+:[^:]+:[^:]+$' OR dedupe_key ~ '^leave-block:[^:]+:[^:]+:[^:]+$')
  AND dedupe_key LIKE '%:' || user_id::text;
--> statement-breakpoint
UPDATE notifications SET dedupe_key = dedupe_key || ':' || user_id::text
WHERE user_id IS NOT NULL
  AND (dedupe_key ~ '^escalate:[^:]+:manager$' OR dedupe_key ~ '^stuck:[^:]+:[^:]+$' OR dedupe_key ~ '^leave-block:[^:]+:[^:]+$');
