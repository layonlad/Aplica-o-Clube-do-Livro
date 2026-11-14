CREATE TABLE notification_settings (user_id uuid PRIMARY KEY REFERENCES users(id),interactions boolean NOT NULL DEFAULT true,mentions boolean NOT NULL DEFAULT true,clubs boolean NOT NULL DEFAULT true,events boolean NOT NULL DEFAULT true,readings boolean NOT NULL DEFAULT true);
CREATE TABLE notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipient_id uuid NOT NULL REFERENCES users(id),actor_id uuid NOT NULL REFERENCES users(id),club_id uuid REFERENCES clubs(id),
 kind text NOT NULL CHECK(kind IN ('like','comment','reply','mention','follow','invitation','join_request','join_approved','topic','event','reading','book')),
 target_type text NOT NULL CHECK(target_type IN ('post','topic','profile','invite','request','event','book')),target_id uuid NOT NULL,context_id uuid,
 category text NOT NULL CHECK(category IN ('interactions','mentions','clubs','events','readings')),dedupe_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz,UNIQUE(recipient_id,dedupe_key),CHECK(recipient_id<>actor_id)
);
CREATE INDEX notification_inbox ON notifications(recipient_id,created_at DESC,id DESC);
CREATE INDEX notification_unread ON notifications(recipient_id,created_at DESC) WHERE read_at IS NULL;
CREATE INDEX notification_retention ON notifications(created_at);
CREATE FUNCTION emit_notification(recipient uuid,actor uuid,club uuid,kind text,target_type text,target uuid,context uuid,category text,dedupe text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF recipient=actor THEN RETURN; END IF;
 INSERT INTO notifications(recipient_id,actor_id,club_id,kind,target_type,target_id,context_id,category,dedupe_key) VALUES(recipient,actor,club,kind,target_type,target,context,category,dedupe) ON CONFLICT(recipient_id,dedupe_key) DO NOTHING;
END; $$;
CREATE FUNCTION notify_social_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE post social_posts; target_user uuid; topic forum_topics;
BEGIN
 IF TG_TABLE_NAME='post_likes' THEN
  SELECT * INTO post FROM social_posts WHERE id=NEW.post_id;
  PERFORM emit_notification(post.author_user_id,NEW.user_id,post.club_id,'like','post',post.id,NULL,'interactions','like:'||post.id||':'||NEW.user_id);
 ELSIF TG_TABLE_NAME='post_comments' THEN
  SELECT * INTO post FROM social_posts WHERE id=NEW.post_id;
  PERFORM emit_notification(post.author_user_id,NEW.author_user_id,post.club_id,'comment','post',post.id,NEW.id,'interactions','comment:'||NEW.id);
  IF NEW.parent_id IS NOT NULL THEN SELECT author_user_id INTO target_user FROM post_comments WHERE id=NEW.parent_id; PERFORM emit_notification(target_user,NEW.author_user_id,post.club_id,'reply','post',post.id,NEW.id,'interactions','reply:'||NEW.id); END IF;
 ELSIF TG_TABLE_NAME='post_mentions' THEN
  SELECT * INTO post FROM social_posts WHERE id=NEW.post_id;
  PERFORM emit_notification(NEW.user_id,post.author_user_id,post.club_id,'mention','post',post.id,NULL,'mentions','mention:'||post.id||':'||NEW.user_id);
 ELSIF TG_TABLE_NAME='follows' THEN
  PERFORM emit_notification(NEW.followed_id,NEW.follower_id,NULL,'follow','profile',NEW.follower_id,NULL,'interactions','follow:'||NEW.follower_id);
 ELSIF TG_TABLE_NAME='forum_topics' THEN
  FOR target_user IN SELECT user_id FROM club_memberships WHERE club_id=NEW.club_id AND status='active' LOOP PERFORM emit_notification(target_user,NEW.author_user_id,NEW.club_id,'topic','topic',NEW.id,NULL,'clubs','topic:'||NEW.id); END LOOP;
 ELSIF TG_TABLE_NAME='forum_replies' THEN
  SELECT * INTO topic FROM forum_topics WHERE id=NEW.topic_id;
  PERFORM emit_notification(topic.author_user_id,NEW.author_user_id,topic.club_id,'reply','topic',topic.id,NEW.id,'interactions','forum-reply:'||NEW.id);
 ELSIF TG_TABLE_NAME='invites' THEN
  IF NEW.email IS NOT NULL THEN FOR target_user IN SELECT id FROM users WHERE lower(email)=NEW.email LOOP PERFORM emit_notification(target_user,NEW.created_by,NEW.club_id,'invitation','invite',NEW.id,NULL,'clubs','invite:'||NEW.id); END LOOP; END IF;
 ELSIF TG_TABLE_NAME='club_join_requests' THEN
  IF NEW.status='pending' THEN FOR target_user IN SELECT user_id FROM club_memberships WHERE club_id=NEW.club_id AND status='active' AND role IN ('owner','admin') LOOP PERFORM emit_notification(target_user,NEW.user_id,NEW.club_id,'join_request','request',NEW.id,NULL,'clubs','request:'||NEW.id||':'||NEW.created_at); END LOOP;
  ELSIF NEW.status='approved' AND OLD.status IS DISTINCT FROM NEW.status THEN PERFORM emit_notification(NEW.user_id,NEW.reviewed_by,NEW.club_id,'join_approved','request',NEW.id,NULL,'clubs','approval:'||NEW.id||':'||NEW.reviewed_at); END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER notify_post_like AFTER INSERT ON post_likes FOR EACH ROW EXECUTE FUNCTION notify_social_change();
CREATE TRIGGER notify_post_comment AFTER INSERT ON post_comments FOR EACH ROW EXECUTE FUNCTION notify_social_change();
CREATE TRIGGER notify_post_mention AFTER INSERT ON post_mentions FOR EACH ROW EXECUTE FUNCTION notify_social_change();
CREATE TRIGGER notify_follow AFTER INSERT ON follows FOR EACH ROW EXECUTE FUNCTION notify_social_change();
CREATE TRIGGER notify_forum_topic AFTER INSERT ON forum_topics FOR EACH ROW EXECUTE FUNCTION notify_social_change();
CREATE TRIGGER notify_forum_reply AFTER INSERT ON forum_replies FOR EACH ROW EXECUTE FUNCTION notify_social_change();
CREATE TRIGGER notify_invite AFTER INSERT ON invites FOR EACH ROW EXECUTE FUNCTION notify_social_change();
CREATE TRIGGER notify_join_request AFTER INSERT OR UPDATE ON club_join_requests FOR EACH ROW EXECUTE FUNCTION notify_social_change();
