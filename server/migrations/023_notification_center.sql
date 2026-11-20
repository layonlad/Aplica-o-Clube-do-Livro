-- Existing inbox, subscriptions and delivery leases remain authoritative.
ALTER TABLE notification_settings ADD COLUMN controls jsonb NOT NULL DEFAULT '{}';
ALTER TABLE push_subscriptions ADD COLUMN platform text NOT NULL DEFAULT 'web'
  CHECK(platform IN ('web','ios','android')), ADD COLUMN installation_id uuid;
CREATE UNIQUE INDEX push_installation ON push_subscriptions(user_id,installation_id)
  WHERE revoked_at IS NULL AND installation_id IS NOT NULL;
ALTER TABLE push_subscriptions ALTER COLUMN p256dh DROP NOT NULL, ALTER COLUMN auth DROP NOT NULL;
ALTER TABLE push_subscriptions ADD CONSTRAINT push_address CHECK (
  (installation_id IS NULL AND platform='web' AND p256dh IS NOT NULL AND auth IS NOT NULL)
  OR (installation_id IS NOT NULL AND endpoint LIKE 'fcm:%' AND auth IS NULL AND p256dh IS NULL));

CREATE TABLE community_highlights (
  post_id uuid PRIMARY KEY REFERENCES social_posts(id), published_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notification_events (
  event_key text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('chat','pin','wall','highlight','event','reading','book','topic')),
  target_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES users(id), club_id uuid REFERENCES clubs(id),
  mentioned uuid[] NOT NULL DEFAULT '{}', reply_user uuid, after_user uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), done_at timestamptz, attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),last_error text,failed_at timestamptz,
  CHECK ((kind='highlight')=(club_id IS NULL))
);
CREATE INDEX notification_events_due ON notification_events(created_at,event_key) WHERE done_at IS NULL;

CREATE FUNCTION notice_preference_key(kind text,target text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN kind='mention' THEN 'mentions' WHEN kind='reply' THEN 'replies'
  WHEN target='chat' THEN 'chatMessages' WHEN kind='highlight' THEN 'communityHighlights'
  WHEN kind='post' THEN 'clubWallPosts' WHEN kind='invitation' THEN 'invitations'
  WHEN target='book' THEN 'readingActivities' WHEN target='event' THEN 'clubEvents' END
$$;
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK(kind IN
 ('like','comment','reply','mention','follow','invitation','join_request','join_approved','topic','post','highlight','event','event_reminder','reading','book'));

-- Filters also apply to legacy single-recipient triggers and lazy inbox inserts.
CREATE FUNCTION notice_allowed(settings notification_settings, k text,t text,club uuid,category text)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT COALESCE((settings.controls->>notice_preference_key(k,t))::boolean,
  CASE WHEN k='mention' THEN settings.mentions WHEN k='reply' THEN settings.interactions ELSE (to_jsonb(settings)->>category)::boolean END,true)
 AND (club IS NULL OR NOT COALESCE((settings.controls->'mutedClubIds') ? club::text,false))
 AND (k<>'mention' OR COALESCE(settings.mentions,true))
 AND (t<>'chat' OR COALESCE((settings.controls->>'chatMessages')::boolean,settings.clubs,true))
$$;
CREATE FUNCTION filter_new_notice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s notification_settings;
BEGIN
 -- A reply to the post owner's own comment is a reply, even though the older trigger emits a single comment notice.
 IF NEW.kind='comment' AND NEW.context_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM post_comments child JOIN post_comments parent ON parent.id=child.parent_id
  WHERE child.id=NEW.context_id AND parent.author_user_id=NEW.recipient_id) THEN
  NEW.kind:='reply'; NEW.dedupe_key:='reply:'||NEW.context_id;
 END IF;
 SELECT * INTO s FROM notification_settings WHERE user_id=NEW.recipient_id;
 IF NOT notice_allowed(s,NEW.kind,NEW.target_type,NEW.club_id,NEW.category)
 OR (NEW.club_id IS NOT NULL AND NEW.target_type<>'invite' AND NOT EXISTS(
  SELECT 1 FROM club_memberships WHERE club_id=NEW.club_id AND user_id=NEW.recipient_id AND status='active'))
 OR EXISTS(SELECT 1 FROM profiles WHERE user_id IN(NEW.actor_id,NEW.recipient_id) AND suspended)
 OR EXISTS(SELECT 1 FROM user_blocks WHERE (blocker_id,blocked_id) IN
 ((NEW.actor_id,NEW.recipient_id),(NEW.recipient_id,NEW.actor_id))) THEN RETURN NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER filter_new_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION filter_new_notice();

-- A cursor and all writes advance in the same transaction. Crash before commit replays the page.
CREATE FUNCTION deliver_notice_page(job_key text, page_size int) RETURNS int LANGUAGE plpgsql AS $$
DECLARE job notification_events; recipients uuid[]; delivered int;
BEGIN
 SELECT * INTO job FROM notification_events WHERE event_key=job_key AND done_at IS NULL FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN 0; END IF;
 page_size := greatest(1,least(page_size,200));
 IF job.club_id IS NULL THEN
  SELECT array_agg(id ORDER BY id) INTO recipients FROM (SELECT id FROM users
   WHERE id>COALESCE(job.after_user,'00000000-0000-0000-0000-000000000000') AND created_at<=job.created_at ORDER BY id LIMIT page_size) page;
 ELSE
  SELECT array_agg(user_id ORDER BY user_id) INTO recipients FROM (SELECT user_id FROM club_memberships
   WHERE club_id=job.club_id AND status='active' AND joined_at<=job.created_at
   AND user_id>COALESCE(job.after_user,'00000000-0000-0000-0000-000000000000') ORDER BY user_id LIMIT page_size) page;
 END IF;
 WITH eligible AS (
 SELECT uid,COALESCE(cm.preference,s.controls->>'chatDeliveryMode','mentions') AS mode,
 CASE WHEN uid=ANY(job.mentioned) AND COALESCE(s.mentions,true) THEN 'mention'
      WHEN uid=job.reply_user THEN 'reply'
      WHEN uid=ANY(job.mentioned) THEN 'mention'
      WHEN job.kind IN ('chat','pin','wall') THEN 'post' ELSE job.kind END AS k
 FROM unnest(recipients) uid LEFT JOIN notification_settings s ON s.user_id=uid
 LEFT JOIN chat_members cm ON cm.user_id=uid AND cm.club_id=job.club_id
 WHERE uid<>job.actor_id
 AND (job.kind<>'wall' OR EXISTS(SELECT 1 FROM social_posts p WHERE p.id=job.target_id AND p.club_id=job.club_id AND p.deleted_at IS NULL))
 AND (job.kind<>'topic' OR EXISTS(SELECT 1 FROM forum_topics t WHERE t.id=job.target_id AND t.deleted_at IS NULL))
 AND (job.kind<>'event' OR EXISTS(SELECT 1 FROM club_events e WHERE e.id=job.target_id AND e.deleted_at IS NULL))
 AND (job.kind NOT IN ('reading','book') OR notification_club_has_book(job.club_id,job.target_id))
 AND (job.kind<>'highlight' OR EXISTS(SELECT 1 FROM community_highlights h JOIN social_posts p ON p.id=h.post_id
  JOIN profiles pr ON pr.user_id=p.author_user_id WHERE p.id=job.target_id AND p.audience='public' AND p.deleted_at IS NULL AND pr.is_public AND NOT pr.suspended))
 AND (job.kind NOT IN ('chat','pin') OR EXISTS(SELECT 1 FROM chat_messages m LEFT JOIN chat_settings cs ON cs.club_id=m.club_id
 WHERE m.id=job.target_id AND NOT m.deleted AND COALESCE(cs.enabled,true)))
 )
 INSERT INTO notifications(recipient_id,actor_id,club_id,kind,target_type,target_id,category,dedupe_key,created_at)
 SELECT uid,job.actor_id,job.club_id,k,
 CASE WHEN job.kind IN ('chat','pin') THEN 'chat' WHEN job.kind IN ('highlight','wall') THEN 'post'
 WHEN job.kind='reading' THEN 'book' ELSE job.kind END,job.target_id,
 CASE WHEN job.kind='event' THEN 'events' WHEN job.kind IN ('reading','book') THEN 'readings'
 WHEN job.kind='highlight' THEN 'interactions' ELSE 'clubs' END,
 CASE WHEN job.kind='chat' AND mode='grouped' AND k='post' THEN
 'chat-group:'||job.club_id||':'||floor(extract(epoch FROM job.created_at)/300)
 ELSE job.event_key END,job.created_at
 FROM eligible WHERE job.kind NOT IN ('chat','pin') OR mode IN ('all','grouped')
 OR (mode='mentions' AND k IN ('mention','reply')) OR (mode='announcements' AND job.kind='pin')
 ON CONFLICT(recipient_id,dedupe_key) DO UPDATE SET target_id=excluded.target_id,
  actor_id=excluded.actor_id,created_at=excluded.created_at,read_at=NULL
 WHERE excluded.dedupe_key LIKE 'chat-group:%' AND excluded.created_at>notifications.created_at;
 GET DIAGNOSTICS delivered = ROW_COUNT;
 UPDATE notification_events SET after_user=COALESCE(recipients[cardinality(recipients)],after_user),
 done_at=CASE WHEN COALESCE(cardinality(recipients),0)<page_size THEN clock_timestamp() END WHERE event_key=job_key;
 RETURN delivered;
END $$;

CREATE FUNCTION initial_notice_page() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 BEGIN PERFORM deliver_notice_page(NEW.event_key,32);
 EXCEPTION WHEN OTHERS THEN
  UPDATE notification_events SET attempts=1,last_error=SQLSTATE,available_at=now()+interval '10 seconds' WHERE event_key=NEW.event_key;
 END;
 RETURN NEW;
END $$;
CREATE TRIGGER initial_notice_page AFTER INSERT ON notification_events FOR EACH ROW EXECUTE FUNCTION initial_notice_page();
CREATE OR REPLACE FUNCTION notify_event_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.deleted_at IS NULL AND (TG_OP='INSERT' OR (NEW.title,NEW.starts_at,NEW.location,NEW.description,NEW.book_id,NEW.topic_id)
 IS DISTINCT FROM (OLD.title,OLD.starts_at,OLD.location,OLD.description,OLD.book_id,OLD.topic_id)) THEN
 INSERT INTO notification_events(event_key,kind,target_id,actor_id,club_id)
 VALUES ('event:'||NEW.id||':'||NEW.version,'event',NEW.id,COALESCE(NULLIF(current_setting('clube.event_actor',true),'')::uuid,NEW.created_by),NEW.club_id)
 ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION notify_new_topic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO notification_events(event_key,kind,target_id,actor_id,club_id)
 VALUES('topic:'||NEW.id,'topic',NEW.id,NEW.author_user_id,NEW.club_id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER notify_forum_topic ON forum_topics;
CREATE TRIGGER notify_forum_topic AFTER INSERT ON forum_topics FOR EACH ROW EXECUTE FUNCTION notify_new_topic();
CREATE FUNCTION notification_type(k text,t text,event_key text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN k='mention' THEN 'user.mentioned' WHEN k='reply' THEN 'comment.reply.created'
 WHEN t='chat' THEN 'club.chat.message.created' WHEN k='post' THEN 'club.wall.post.created'
 WHEN k='highlight' THEN 'community.highlight.published' WHEN k='invitation' THEN 'club.invitation.created'
 WHEN k='reading' THEN 'club.reading.started' WHEN k='event_reminder' THEN 'club.event.reminder'
 WHEN k='event' AND event_key LIKE '%:0' THEN 'club.event.created' WHEN k='event' THEN 'club.event.updated'
 ELSE k END
$$;
ALTER TABLE chat_members ALTER COLUMN preference DROP NOT NULL, ALTER COLUMN preference DROP DEFAULT;
ALTER TABLE chat_members DROP CONSTRAINT chat_members_preference_check;
ALTER TABLE chat_members ADD CONSTRAINT chat_members_preference_check CHECK(preference IN ('all','grouped','mentions','announcements','silent'));
CREATE FUNCTION wake_notification_reader() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM pg_notify('clube_inbox_'||replace(NEW.recipient_id::text,'-',''),''); RETURN NEW; END $$;
CREATE TRIGGER wake_notification_reader AFTER INSERT OR UPDATE OF read_at ON notifications
 FOR EACH ROW EXECUTE FUNCTION wake_notification_reader();

CREATE FUNCTION next_notice_page() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE job text; inserted int;
BEGIN
 SELECT event_key INTO job FROM notification_events WHERE done_at IS NULL AND failed_at IS NULL AND available_at<=now()
 ORDER BY created_at,event_key LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 BEGIN
  inserted:=deliver_notice_page(job,200);
  UPDATE notification_events SET attempts=0,last_error=NULL WHERE event_key=job;
  RETURN inserted;
 EXCEPTION WHEN OTHERS THEN
  UPDATE notification_events SET last_error=SQLSTATE,attempts=attempts+1,
   failed_at=CASE WHEN attempts>=7 THEN now() END,
   available_at=now()+least(3600,10*power(2,attempts))*interval '1 second' WHERE event_key=job;
  RETURN 0;
 END;
END $$;

-- Previously queued wall posts retain their old cursor. New posts use the shared bounded worker.
CREATE OR REPLACE FUNCTION enqueue_club_post_notice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.audience='club' THEN
  INSERT INTO notification_events(event_key,kind,target_id,actor_id,club_id)
  VALUES('post:'||NEW.id,'wall',NEW.id,NEW.author_user_id,NEW.club_id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
