CREATE TABLE personal_workspaces (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  state jsonb NOT NULL,
  reading jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE club_workspaces (
  club_id uuid PRIMARY KEY REFERENCES clubs(id),
  state jsonb NOT NULL,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE club_reading_states (
  club_id uuid NOT NULL,
  user_id uuid NOT NULL,
  reading jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id),
  FOREIGN KEY (club_id, user_id) REFERENCES club_memberships(club_id, user_id)
);
