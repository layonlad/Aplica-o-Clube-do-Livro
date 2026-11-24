ALTER TABLE clubs ADD COLUMN deleted_at timestamptz;

-- A removed club keeps references for historical records, including its owner.
ALTER TABLE club_memberships DROP CONSTRAINT club_memberships_check;

CREATE OR REPLACE FUNCTION check_club_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM clubs c WHERE c.deleted_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM club_memberships m
      WHERE m.club_id = c.id AND m.user_id = c.owner_user_id AND m.role = 'owner' AND m.status = 'active'
    )
  ) OR EXISTS (
    SELECT 1 FROM clubs c JOIN club_memberships m ON m.club_id = c.id
    WHERE c.deleted_at IS NOT NULL AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Invalid membership state for club' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
