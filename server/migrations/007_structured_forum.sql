-- A failed reconciliation rolls back this entire migration, never drops legacy data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM club_workspaces w CROSS JOIN LATERAL jsonb_array_elements(w.state->'topics') t
    WHERE NOT EXISTS(SELECT 1 FROM club_memberships m WHERE m.club_id=w.club_id AND m.user_id::text=t->>'by')
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(t->'replies') r WHERE NOT EXISTS(SELECT 1 FROM club_memberships m WHERE m.club_id=w.club_id AND m.user_id::text=r->>'by'))
       OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(t->'likedBy') liked WHERE NOT EXISTS(SELECT 1 FROM club_memberships m WHERE m.club_id=w.club_id AND m.user_id::text=liked))
  ) THEN RAISE EXCEPTION 'Legacy forum requires author/member reconciliation before migration'; END IF;
END;
$$;
CREATE TABLE forum_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id uuid NOT NULL REFERENCES clubs(id),author_user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 150),body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 5000),spoiler boolean NOT NULL DEFAULT false,
  book_id uuid,book_title text NOT NULL DEFAULT '' CHECK(char_length(book_title)<=150),book_author text NOT NULL DEFAULT '' CHECK(char_length(book_author)<=150),chapter text NOT NULL DEFAULT '' CHECK(char_length(chapter)<=200),
  pinned boolean NOT NULL DEFAULT false,closed boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 0 CHECK(version>=0),
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,
  UNIQUE(id,club_id),FOREIGN KEY(club_id,author_user_id) REFERENCES club_memberships(club_id,user_id),CHECK(chapter='' OR book_id IS NOT NULL)
);
CREATE INDEX forum_topics_page ON forum_topics(club_id,created_at DESC,id DESC) WHERE deleted_at IS NULL AND NOT pinned;
CREATE INDEX forum_pinned_topics ON forum_topics(club_id,created_at DESC,id DESC) WHERE deleted_at IS NULL AND pinned;
CREATE INDEX forum_topics_by_book ON forum_topics(club_id,book_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE TABLE forum_topic_likes (
  topic_id uuid NOT NULL,club_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES users(id),PRIMARY KEY(topic_id,user_id),
  FOREIGN KEY(topic_id,club_id) REFERENCES forum_topics(id,club_id),FOREIGN KEY(club_id,user_id) REFERENCES club_memberships(club_id,user_id)
);
CREATE TABLE forum_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),topic_id uuid NOT NULL,club_id uuid NOT NULL,author_user_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 5000),spoiler boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 0 CHECK(version>=0),created_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,
  UNIQUE(id,club_id),FOREIGN KEY(topic_id,club_id) REFERENCES forum_topics(id,club_id),FOREIGN KEY(club_id,author_user_id) REFERENCES club_memberships(club_id,user_id)
);
CREATE INDEX forum_replies_page ON forum_replies(topic_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE TABLE forum_topic_media (
  topic_id uuid NOT NULL,media_id uuid NOT NULL,club_id uuid NOT NULL,position smallint NOT NULL CHECK(position BETWEEN 0 AND 3),
  PRIMARY KEY(topic_id,media_id),UNIQUE(topic_id,position),FOREIGN KEY(topic_id,club_id) REFERENCES forum_topics(id,club_id),FOREIGN KEY(media_id,club_id) REFERENCES media_objects(id,scope_id)
);
CREATE TABLE forum_reply_media (
  reply_id uuid NOT NULL,media_id uuid NOT NULL,club_id uuid NOT NULL,position smallint NOT NULL CHECK(position BETWEEN 0 AND 3),
  PRIMARY KEY(reply_id,media_id),UNIQUE(reply_id,position),FOREIGN KEY(reply_id,club_id) REFERENCES forum_replies(id,club_id),FOREIGN KEY(media_id,club_id) REFERENCES media_objects(id,scope_id)
);
CREATE INDEX media_forum_topic_links ON forum_topic_media(media_id);
CREATE INDEX media_forum_reply_links ON forum_reply_media(media_id);
INSERT INTO forum_topics(id,club_id,author_user_id,title,body,spoiler,created_at,updated_at)
  SELECT (t->>'id')::uuid,w.club_id,(t->>'by')::uuid,t->>'title',t->>'body',(t->>'spoiler')::boolean,(t->>'at')::timestamptz,(t->>'at')::timestamptz
  FROM club_workspaces w CROSS JOIN LATERAL jsonb_array_elements(w.state->'topics') t;
INSERT INTO forum_replies(id,topic_id,club_id,author_user_id,body,created_at)
  SELECT (r->>'id')::uuid,(t->>'id')::uuid,w.club_id,(r->>'by')::uuid,r->>'body',(r->>'at')::timestamptz
  FROM club_workspaces w CROSS JOIN LATERAL jsonb_array_elements(w.state->'topics') t CROSS JOIN LATERAL jsonb_array_elements(t->'replies') r;
INSERT INTO forum_topic_likes(topic_id,club_id,user_id)
  SELECT DISTINCT (t->>'id')::uuid,w.club_id,liked::uuid
  FROM club_workspaces w CROSS JOIN LATERAL jsonb_array_elements(w.state->'topics') t CROSS JOIN LATERAL jsonb_array_elements_text(t->'likedBy') liked;
-- Legacy snapshots remain intact for reconciliation/backup, but the API routes
-- new club forum mutations to these tables. Personal notes keep the old format.

-- Reconcile legacy writes made by an older API instance during rollout. The
-- checkpoint stores only the bounded old snapshot; new forum writes never use it.
CREATE TABLE forum_legacy_checkpoints (
  club_id uuid PRIMARY KEY REFERENCES clubs(id),topics jsonb NOT NULL DEFAULT '[]',updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO forum_legacy_checkpoints(club_id,topics) SELECT club_id,state->'topics' FROM club_workspaces;
