-- Additive: legacy snapshots and checksums remain unchanged.
ALTER TABLE personal_workspaces ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}';
ALTER TABLE club_reading_states ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}';
