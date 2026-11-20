CREATE TABLE chat_settings (
 club_id uuid PRIMARY KEY REFERENCES clubs, enabled boolean NOT NULL DEFAULT true,
 chapter text NOT NULL DEFAULT '', slow_seconds integer NOT NULL DEFAULT 2 CHECK(slow_seconds BETWEEN 1 AND 300),
 pin_limit integer NOT NULL DEFAULT 3 CHECK(pin_limit BETWEEN 1 AND 10)
);
CREATE TABLE chat_members (
 club_id uuid NOT NULL, user_id uuid NOT NULL, muted boolean NOT NULL DEFAULT false,
 preference text NOT NULL DEFAULT 'mentions' CHECK(preference IN ('all','mentions','announcements','silent')),
 PRIMARY KEY(club_id,user_id), FOREIGN KEY(club_id,user_id) REFERENCES club_memberships
);
CREATE TABLE chat_messages (
 id uuid PRIMARY KEY, club_id uuid NOT NULL REFERENCES clubs, author_id uuid NOT NULL REFERENCES users,
 room text NOT NULL CHECK(room IN ('general','reading','spoilers')), reply_to uuid REFERENCES chat_messages ON DELETE SET NULL,
 spoiler boolean NOT NULL, chapter text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 deleted boolean NOT NULL DEFAULT false, pinned boolean NOT NULL DEFAULT false
);
CREATE INDEX chat_room_history ON chat_messages(club_id,room,created_at DESC,id DESC);
CREATE INDEX chat_author_rate ON chat_messages(club_id,author_id,created_at DESC);
CREATE TABLE chat_reactions (
 message_id uuid REFERENCES chat_messages ON DELETE CASCADE, user_id uuid REFERENCES users, emoji text NOT NULL,
 PRIMARY KEY(message_id,user_id)
);
CREATE TABLE chat_reports (
 message_id uuid REFERENCES chat_messages ON DELETE CASCADE, reporter uuid REFERENCES users, reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(message_id,reporter)
);
ALTER TABLE notifications DROP CONSTRAINT notifications_target_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_target_type_check CHECK(target_type IN ('post','topic','profile','invite','request','event','book','chat'));
