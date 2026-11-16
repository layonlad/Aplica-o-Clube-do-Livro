-- Additive: existing approved followers and all club memberships are preserved.
CREATE TABLE follow_requests (
 id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 requester_id uuid NOT NULL REFERENCES users(id), target_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz,
 PRIMARY KEY(requester_id,target_id), CHECK(requester_id<>target_id)
);
CREATE INDEX pending_follow_requests ON follow_requests(target_id,created_at DESC,id DESC) WHERE status='pending';
CREATE INDEX profile_post_activity ON social_posts(author_user_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX profile_comment_activity ON post_comments(author_user_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX profile_topic_activity ON forum_topics(author_user_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX profile_reply_activity ON forum_replies(author_user_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
