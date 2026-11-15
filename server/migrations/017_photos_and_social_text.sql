-- Originals use private, short-lived signed uploads; optimized copies keep the existing account quota.
ALTER TABLE media_objects ADD COLUMN feed_key text UNIQUE;
ALTER TABLE media_objects ADD COLUMN feed_size integer NOT NULL DEFAULT 0 CHECK(feed_size BETWEEN 0 AND 10000000);
ALTER TABLE media_objects DROP CONSTRAINT media_objects_width_check;
ALTER TABLE media_objects DROP CONSTRAINT media_objects_height_check;
ALTER TABLE media_objects ADD CHECK(width BETWEEN 1 AND 2560), ADD CHECK(height BETWEEN 1 AND 2560);
CREATE TABLE photo_uploads (
 id uuid PRIMARY KEY, owner_user_id uuid NOT NULL REFERENCES users(id),club_id uuid REFERENCES clubs(id),
 content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 100000000),
 object_key text NOT NULL UNIQUE, state text NOT NULL DEFAULT 'issued' CHECK(state IN ('issued','completed','cancelled','purged')),
 cleanup_attempts integer NOT NULL DEFAULT 0,last_cleanup_at timestamptz,last_cleanup_error text,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes'
);
CREATE INDEX photo_upload_owner ON photo_uploads(owner_user_id,created_at DESC);
CREATE INDEX photo_upload_cleanup ON photo_uploads(expires_at) WHERE state<>'purged';
-- Bounded text/HTTP payloads protect parsing and pagination; the UI never truncates user text.
ALTER TABLE social_posts DROP CONSTRAINT social_posts_body_check;
ALTER TABLE social_posts ADD CHECK(char_length(body)<=50000);
ALTER TABLE post_comments DROP CONSTRAINT post_comments_body_check;
ALTER TABLE post_comments ADD CHECK(char_length(body) BETWEEN 1 AND 10000);
ALTER TABLE social_posts ADD COLUMN client_request_id uuid;
ALTER TABLE social_posts ADD COLUMN request_hash text;
ALTER TABLE social_posts ADD UNIQUE(author_user_id,client_request_id);
CREATE TABLE comment_media (
 comment_id uuid NOT NULL,post_id uuid NOT NULL,scope_id uuid NOT NULL,media_id uuid NOT NULL,
 position smallint NOT NULL CHECK(position BETWEEN 0 AND 3),PRIMARY KEY(comment_id,media_id),UNIQUE(comment_id,position),
 FOREIGN KEY(comment_id,post_id) REFERENCES post_comments(id,post_id),
 FOREIGN KEY(post_id,scope_id) REFERENCES social_posts(id,scope_id),
 FOREIGN KEY(media_id,scope_id) REFERENCES media_objects(id,scope_id)
);
CREATE INDEX comment_media_links ON comment_media(media_id);
CREATE TABLE comment_mentions (
 comment_id uuid NOT NULL REFERENCES post_comments(id), user_id uuid NOT NULL REFERENCES users(id),PRIMARY KEY(comment_id,user_id)
);

ALTER TABLE post_comments ADD COLUMN client_request_id uuid;
ALTER TABLE post_comments ADD COLUMN request_hash text;
ALTER TABLE post_comments ADD UNIQUE(author_user_id,client_request_id);
