-- Real-time inbox signal. Firestore only receives this version number, never names, texts or targets.
-- One row per person; repeated changes before publication collapse into a single Firestore write.
CREATE TABLE notification_signals (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 published bigint NOT NULL DEFAULT 0 CHECK(published>=0),
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_signals_due ON notification_signals(changed_at) WHERE version>published;

-- Statement-level triggers keep a 200-member fan-out at one upsert per recipient, in a stable order.
-- The trigger functions are SECURITY DEFINER so inserts by the API or the restricted executor keep
-- working before any new grant is applied; nobody can call them directly.
-- A deleted account cascading its notices must not recreate its signal.
DO $install$
BEGIN
 EXECUTE format($sql$
  CREATE FUNCTION bump_notification_signals(recipients uuid[]) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path=%1$I,pg_temp AS $fn$
   INSERT INTO notification_signals(user_id)
   SELECT DISTINCT r FROM unnest(recipients) r WHERE EXISTS(SELECT 1 FROM users u WHERE u.id=r) ORDER BY 1
   ON CONFLICT(user_id) DO UPDATE SET version=notification_signals.version+1,changed_at=now()
  $fn$;
  CREATE FUNCTION signal_inserted_notices() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=%1$I,pg_temp AS $fn$
  BEGIN PERFORM bump_notification_signals(ARRAY(SELECT recipient_id FROM fresh)); RETURN NULL; END $fn$;
  -- Read state and grouped notices (a newer chat message refreshes the same row) both change the inbox.
  CREATE FUNCTION signal_updated_notices() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=%1$I,pg_temp AS $fn$
  BEGIN
   PERFORM bump_notification_signals(ARRAY(SELECT a.recipient_id FROM after_rows a JOIN before_rows b USING(id)
    WHERE a.read_at IS DISTINCT FROM b.read_at OR a.created_at IS DISTINCT FROM b.created_at
     OR a.actor_id IS DISTINCT FROM b.actor_id OR a.target_id IS DISTINCT FROM b.target_id));
   RETURN NULL;
  END $fn$;
  -- Removed content takes its unread notice with it; the badge must go down on every device.
  CREATE FUNCTION signal_deleted_notices() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=%1$I,pg_temp AS $fn$
  BEGIN PERFORM bump_notification_signals(ARRAY(SELECT recipient_id FROM gone WHERE read_at IS NULL)); RETURN NULL; END $fn$;
 $sql$,current_schema());
END $install$;
REVOKE ALL ON FUNCTION bump_notification_signals(uuid[]) FROM PUBLIC;

CREATE TRIGGER signal_inserted_notices AFTER INSERT ON notifications
 REFERENCING NEW TABLE AS fresh FOR EACH STATEMENT EXECUTE FUNCTION signal_inserted_notices();
CREATE TRIGGER signal_updated_notices AFTER UPDATE ON notifications
 REFERENCING OLD TABLE AS before_rows NEW TABLE AS after_rows FOR EACH STATEMENT EXECUTE FUNCTION signal_updated_notices();
CREATE TRIGGER signal_deleted_notices AFTER DELETE ON notifications
 REFERENCING OLD TABLE AS gone FOR EACH STATEMENT EXECUTE FUNCTION signal_deleted_notices();
