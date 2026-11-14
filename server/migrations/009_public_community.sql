-- Public identity is opt-in. Existing users and personal libraries stay private.
-- Global actions have no club. The append-only audit trigger remains intact.
ALTER TABLE audit_logs ALTER COLUMN club_id DROP NOT NULL;
CREATE TABLE profiles (
 user_id uuid PRIMARY KEY REFERENCES users(id),handle text NOT NULL UNIQUE CHECK(handle ~ '^[a-z0-9_]{3,30}$'),
 display_name text NOT NULL CHECK(char_length(display_name) BETWEEN 1 AND 100),bio text NOT NULL DEFAULT '' CHECK(char_length(bio)<=1000),
 genres text[] NOT NULL DEFAULT '{}' CHECK(cardinality(genres)<=12),is_public boolean NOT NULL DEFAULT false,suspended boolean NOT NULL DEFAULT false,
 show_library boolean NOT NULL DEFAULT false,show_stats boolean NOT NULL DEFAULT false,show_clubs boolean NOT NULL DEFAULT false,
 goal integer NOT NULL DEFAULT 12 CHECK(goal BETWEEN 1 AND 1000),avatar_id uuid REFERENCES media_objects(id),cover_id uuid REFERENCES media_objects(id),
 version integer NOT NULL DEFAULT 0 CHECK(version>=0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX public_profiles_page ON profiles(created_at DESC,user_id DESC) WHERE is_public;
CREATE TABLE follows (follower_id uuid NOT NULL REFERENCES users(id),followed_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(follower_id,followed_id),CHECK(follower_id<>followed_id));
CREATE INDEX followers_by_target ON follows(followed_id,follower_id);
CREATE TABLE user_blocks (blocker_id uuid NOT NULL REFERENCES users(id),blocked_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(blocker_id,blocked_id),CHECK(blocker_id<>blocked_id));
CREATE INDEX blocks_by_target ON user_blocks(blocked_id,blocker_id);
CREATE TABLE post_mentions (post_id uuid NOT NULL REFERENCES social_posts(id),user_id uuid NOT NULL REFERENCES users(id),PRIMARY KEY(post_id,user_id));
ALTER TABLE social_posts ADD COLUMN shared_post_id uuid REFERENCES social_posts(id);
CREATE TABLE reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reporter_id uuid NOT NULL REFERENCES users(id),club_id uuid REFERENCES clubs(id),
 target_kind text NOT NULL CHECK(target_kind IN ('post','comment','profile','topic','reply')),target_id uuid NOT NULL,
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 5 AND 1000),status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','dismissed','removed')),
 created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,reviewed_by uuid REFERENCES users(id),
 UNIQUE(reporter_id,target_kind,target_id)
);
CREATE INDEX pending_reports ON reports(club_id,created_at DESC,id DESC) WHERE status='pending';
CREATE TABLE moderation_actions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),report_id uuid REFERENCES reports(id),actor_id uuid NOT NULL REFERENCES users(id),club_id uuid REFERENCES clubs(id),action text NOT NULL CHECK(action IN ('dismissed','removed')),reason text NOT NULL CHECK(char_length(reason) BETWEEN 5 AND 1000),created_at timestamptz NOT NULL DEFAULT now());
