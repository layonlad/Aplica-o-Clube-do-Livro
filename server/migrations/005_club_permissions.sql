-- Existing clubs stay private. Membership and owner constraints are preserved.
ALTER TABLE club_memberships DROP CONSTRAINT club_memberships_role_check;
ALTER TABLE club_memberships ADD CONSTRAINT club_memberships_role_check CHECK (role IN ('owner','admin','moderator','member'));
CREATE TABLE club_settings (
  club_id uuid PRIMARY KEY REFERENCES clubs(id),
  description text NOT NULL DEFAULT '' CHECK (char_length(description)<=2000),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','discoverable','public')),
  accent text NOT NULL DEFAULT '#6e477c' CHECK (accent ~ '^#[0-9a-fA-F]{6}$'),
  version integer NOT NULL DEFAULT 0 CHECK (version>=0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX discoverable_clubs ON club_settings(visibility,club_id) WHERE visibility<>'private';
CREATE TABLE club_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id),
  user_id uuid NOT NULL REFERENCES users(id),
  message text NOT NULL DEFAULT '' CHECK (char_length(message)<=1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id,user_id),
  CHECK ((status='pending' AND reviewed_at IS NULL AND reviewed_by IS NULL) OR status<>'pending')
);
CREATE INDEX club_pending_requests ON club_join_requests(club_id,created_at DESC,id DESC) WHERE status='pending';
CREATE INDEX join_requests_by_user ON club_join_requests(user_id,created_at DESC,id DESC);
