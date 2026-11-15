ALTER TABLE notification_settings ADD COLUMN reminder_minutes integer NOT NULL DEFAULT 1440 CHECK(reminder_minutes IN (0,15,60,1440));
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK(kind IN ('like','comment','reply','mention','follow','invitation','join_request','join_approved','topic','post','event','event_reminder','reading','book'));
-- Preserve valid historical comment mentions before the first editable comments are released.
INSERT INTO comment_mentions(comment_id,user_id) SELECT DISTINCT n.context_id,n.recipient_id FROM notifications n JOIN post_comments c ON c.id=n.context_id WHERE n.kind='mention' AND n.target_type='post' AND c.deleted_at IS NULL ON CONFLICT DO NOTHING;
CREATE TABLE push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),endpoint text NOT NULL UNIQUE CHECK(char_length(endpoint)<=2048),
 p256dh text NOT NULL,auth text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz
);
CREATE INDEX push_devices ON push_subscriptions(user_id) WHERE revoked_at IS NULL;
CREATE TABLE push_deliveries (
 notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','leased','sent','cancelled','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),available_at timestamptz NOT NULL DEFAULT now(),leased_at timestamptz,lease_token uuid,sent_at timestamptz,last_error text,
 PRIMARY KEY(notification_id,subscription_id)
);
CREATE INDEX push_due ON push_deliveries(available_at) WHERE status IN ('pending','leased');
CREATE FUNCTION enqueue_push_notice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO push_deliveries(notification_id,subscription_id) SELECT NEW.id,s.id FROM push_subscriptions s WHERE s.user_id=NEW.recipient_id AND s.revoked_at IS NULL AND s.last_seen_at>now()-interval '90 days' ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;
CREATE TRIGGER enqueue_push AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION enqueue_push_notice();
-- A single queue row keeps club fan-out out of the publication request.
CREATE TABLE club_post_notices (
 post_id uuid PRIMARY KEY REFERENCES social_posts(id),club_id uuid NOT NULL REFERENCES clubs(id),actor_id uuid NOT NULL REFERENCES users(id),
 after_user uuid,created_at timestamptz NOT NULL DEFAULT now(),done_at timestamptz
);
CREATE INDEX club_post_notices_due ON club_post_notices(created_at) WHERE done_at IS NULL;
CREATE FUNCTION enqueue_club_post_notice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.audience='club' THEN INSERT INTO club_post_notices(post_id,club_id,actor_id) VALUES(NEW.id,NEW.club_id,NEW.author_user_id) ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER enqueue_club_post AFTER INSERT ON social_posts FOR EACH ROW EXECUTE FUNCTION enqueue_club_post_notice();
-- The external executor needs book existence, never the private workspace JSON/content.
DO $install$
BEGIN
 EXECUTE format($sql$
  CREATE FUNCTION notification_club_has_book(club uuid,book uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path=%I,pg_temp AS $fn$
   SELECT EXISTS(SELECT 1 FROM club_workspaces w CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w.state->'books','[]')) item WHERE w.club_id=$1 AND item->>'id'=$2::text)
  $fn$
 $sql$,current_schema());
END $install$;
REVOKE ALL ON FUNCTION notification_club_has_book(uuid,uuid) FROM PUBLIC;
