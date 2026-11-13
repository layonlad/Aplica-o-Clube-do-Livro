CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text NOT NULL UNIQUE,
  email text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE club_memberships (
  club_id uuid NOT NULL REFERENCES clubs(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('owner', 'member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  PRIMARY KEY (club_id, user_id),
  CHECK (role <> 'owner' OR status = 'active'),
  CHECK ((status = 'active' AND removed_at IS NULL) OR (status = 'removed' AND removed_at IS NOT NULL))
);
CREATE UNIQUE INDEX one_owner_per_club ON club_memberships(club_id) WHERE role = 'owner';
CREATE INDEX memberships_by_user ON club_memberships(user_id, status);

-- The owner must exist as an active membership when the transaction commits.
CREATE FUNCTION check_club_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM clubs c WHERE NOT EXISTS (
      SELECT 1 FROM club_memberships m
      WHERE m.club_id = c.id AND m.user_id = c.owner_user_id AND m.role = 'owner' AND m.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'Club must have an active owner' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER club_owner_consistency AFTER INSERT OR UPDATE ON clubs
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_club_owner();
CREATE CONSTRAINT TRIGGER membership_owner_consistency AFTER INSERT OR UPDATE OR DELETE ON club_memberships
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_club_owner();

CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id),
  created_by uuid NOT NULL,
  email text,
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  max_uses integer NOT NULL CHECK (max_uses BETWEEN 1 AND 50),
  uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0 AND uses <= max_uses),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, club_id),
  FOREIGN KEY (club_id, created_by) REFERENCES club_memberships(club_id, user_id),
  CHECK (email IS NULL OR max_uses = 1),
  CHECK (expires_at > created_at)
);
CREATE INDEX invites_by_club ON invites(club_id, created_at DESC);

CREATE TABLE invite_acceptances (
  invite_id uuid NOT NULL,
  club_id uuid NOT NULL,
  user_id uuid NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invite_id, user_id),
  FOREIGN KEY (invite_id, club_id) REFERENCES invites(id, club_id),
  FOREIGN KEY (club_id, user_id) REFERENCES club_memberships(club_id, user_id)
);

CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES clubs(id),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_by_club ON audit_logs(club_id, created_at DESC);
CREATE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only';
END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
