CREATE INDEX owner_media_drafts ON media_objects(owner_user_id,club_id,created_at DESC,id DESC) WHERE state='active';
