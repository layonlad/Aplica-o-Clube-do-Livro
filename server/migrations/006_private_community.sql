CREATE TABLE social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id uuid NOT NULL REFERENCES users(id),
  club_id uuid REFERENCES clubs(id),
  audience text NOT NULL CHECK (audience IN ('club','public')),
  scope_id uuid GENERATED ALWAYS AS (COALESCE(club_id,'00000000-0000-0000-0000-000000000000'::uuid)) STORED,
  kind text NOT NULL CHECK (kind IN ('reflection','review','quote','question','poll','meeting','recommendation','achievement','announcement')),
  body text NOT NULL CHECK (char_length(body)<=5000),
  book_title text NOT NULL DEFAULT '' CHECK (char_length(book_title)<=150),
  book_author text NOT NULL DEFAULT '' CHECK (char_length(book_author)<=150),
  quote text NOT NULL DEFAULT '' CHECK (char_length(quote)<=280),
  source text NOT NULL DEFAULT '' CHECK (char_length(source)<=500),
  version integer NOT NULL DEFAULT 0 CHECK (version>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(id,scope_id),
  CHECK ((audience='club' AND club_id IS NOT NULL) OR (audience='public' AND club_id IS NULL)),
  CHECK (body<>'' OR quote<>'')
);
CREATE INDEX club_posts_page ON social_posts(club_id,created_at DESC,id DESC) WHERE deleted_at IS NULL AND audience='club';
CREATE INDEX public_posts_page ON social_posts(created_at DESC,id DESC) WHERE deleted_at IS NULL AND audience='public';
CREATE INDEX posts_by_author ON social_posts(author_user_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE TABLE post_likes (
  post_id uuid NOT NULL REFERENCES social_posts(id),
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(post_id,user_id)
);
CREATE TABLE saved_posts (
  post_id uuid NOT NULL REFERENCES social_posts(id),user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,post_id)
);
CREATE INDEX saved_posts_page ON saved_posts(user_id,created_at DESC,post_id DESC);
CREATE TABLE post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),post_id uuid NOT NULL REFERENCES social_posts(id),
  author_user_id uuid NOT NULL REFERENCES users(id),parent_id uuid,
  body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 2000),
  version integer NOT NULL DEFAULT 0 CHECK(version>=0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,
  UNIQUE(id,post_id),FOREIGN KEY(parent_id,post_id) REFERENCES post_comments(id,post_id)
);
CREATE INDEX post_comments_page ON post_comments(post_id,created_at DESC,id DESC);
CREATE TABLE comment_likes (comment_id uuid NOT NULL REFERENCES post_comments(id),user_id uuid NOT NULL REFERENCES users(id),PRIMARY KEY(comment_id,user_id));
CREATE TABLE post_poll_options (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),post_id uuid NOT NULL REFERENCES social_posts(id),label text NOT NULL CHECK(char_length(label) BETWEEN 1 AND 100),position smallint NOT NULL CHECK(position BETWEEN 0 AND 5),UNIQUE(id,post_id),UNIQUE(post_id,position));
CREATE TABLE post_poll_votes (post_id uuid NOT NULL REFERENCES social_posts(id),option_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES users(id),PRIMARY KEY(post_id,user_id),FOREIGN KEY(option_id,post_id) REFERENCES post_poll_options(id,post_id));
CREATE INDEX poll_vote_counts ON post_poll_votes(option_id);
CREATE TABLE post_tags (post_id uuid NOT NULL REFERENCES social_posts(id),tag text NOT NULL CHECK(char_length(tag) BETWEEN 1 AND 50),PRIMARY KEY(post_id,tag));
CREATE INDEX posts_by_tag ON post_tags(tag,post_id);
CREATE TABLE media_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_user_id uuid NOT NULL REFERENCES users(id),club_id uuid REFERENCES clubs(id),
  scope_id uuid GENERATED ALWAYS AS (COALESCE(club_id,'00000000-0000-0000-0000-000000000000'::uuid)) STORED,
  object_key text NOT NULL UNIQUE,thumbnail_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK(kind IN ('image','video')),mime_type text NOT NULL CHECK(mime_type IN ('image/webp','video/mp4')),
  byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 10000000),thumbnail_size integer NOT NULL CHECK(thumbnail_size BETWEEN 1 AND 500000),
  width integer NOT NULL CHECK(width BETWEEN 1 AND 1920),height integer NOT NULL CHECK(height BETWEEN 1 AND 1920),duration real CHECK(duration>0 AND duration<=30),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','active','deleted','purged')),
  created_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,
  UNIQUE(id,scope_id),CHECK((kind='image' AND duration IS NULL AND mime_type='image/webp') OR (kind='video' AND duration IS NOT NULL AND mime_type='video/mp4'))
);
CREATE INDEX media_by_owner ON media_objects(owner_user_id,state);
CREATE INDEX media_cleanup_queue ON media_objects(state,created_at) WHERE state IN ('pending','deleted');
CREATE TABLE post_media (
  post_id uuid NOT NULL,media_id uuid NOT NULL,scope_id uuid NOT NULL,position smallint NOT NULL CHECK(position BETWEEN 0 AND 3),
  PRIMARY KEY(post_id,media_id),UNIQUE(post_id,position),FOREIGN KEY(post_id,scope_id) REFERENCES social_posts(id,scope_id),FOREIGN KEY(media_id,scope_id) REFERENCES media_objects(id,scope_id)
);
CREATE INDEX media_post_links ON post_media(media_id);
CREATE TABLE club_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id uuid NOT NULL REFERENCES clubs(id),created_by uuid NOT NULL REFERENCES users(id),
  title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 150),description text NOT NULL DEFAULT '' CHECK(char_length(description)<=2000),
  event_id uuid,event_date date NOT NULL,allow_member_upload boolean NOT NULL DEFAULT true,allow_download boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 0 CHECK(version>=0),created_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,
  UNIQUE(id,club_id)
);
CREATE INDEX club_album_page ON club_albums(club_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE TABLE album_media (
  album_id uuid NOT NULL,media_id uuid NOT NULL,club_id uuid NOT NULL,caption text NOT NULL DEFAULT '' CHECK(char_length(caption)<=500),added_by uuid NOT NULL REFERENCES users(id),
  post_id uuid NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(album_id,media_id),FOREIGN KEY(album_id,club_id) REFERENCES club_albums(id,club_id),FOREIGN KEY(media_id,club_id) REFERENCES media_objects(id,scope_id),FOREIGN KEY(post_id,club_id) REFERENCES social_posts(id,scope_id)
);
CREATE INDEX album_media_page ON album_media(album_id,created_at DESC,media_id DESC);
CREATE INDEX media_album_links ON album_media(media_id);
-- Tags identify only consenting participants: the mentioned member accepts each tag.
CREATE TABLE album_participant_tags (
  album_id uuid NOT NULL,media_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES users(id),proposed_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
  PRIMARY KEY(album_id,media_id,user_id),FOREIGN KEY(album_id,media_id) REFERENCES album_media(album_id,media_id)
);
