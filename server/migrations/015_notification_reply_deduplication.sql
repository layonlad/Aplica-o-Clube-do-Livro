-- A reply to the post author produces one interaction notification.
CREATE OR REPLACE FUNCTION notify_social_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE post social_posts; target_user uuid; topic forum_topics;
BEGIN
 IF TG_TABLE_NAME='post_likes' THEN
  SELECT * INTO post FROM social_posts WHERE id=NEW.post_id;
  PERFORM emit_notification(post.author_user_id,NEW.user_id,post.club_id,'like','post',post.id,NULL,'interactions','like:'||post.id||':'||NEW.user_id);
 ELSIF TG_TABLE_NAME='post_comments' THEN
  SELECT * INTO post FROM social_posts WHERE id=NEW.post_id;
  PERFORM emit_notification(post.author_user_id,NEW.author_user_id,post.club_id,'comment','post',post.id,NEW.id,'interactions','comment:'||NEW.id);
  IF NEW.parent_id IS NOT NULL THEN SELECT author_user_id INTO target_user FROM post_comments WHERE id=NEW.parent_id; IF target_user<>post.author_user_id THEN PERFORM emit_notification(target_user,NEW.author_user_id,post.club_id,'reply','post',post.id,NEW.id,'interactions','reply:'||NEW.id); END IF; END IF;
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
