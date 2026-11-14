ALTER TABLE club_settings ADD COLUMN cover_media_id uuid,ADD COLUMN cover_is_public boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT club_cover_scope FOREIGN KEY(cover_media_id,club_id) REFERENCES media_objects(id,scope_id),
 ADD CONSTRAINT private_club_cover CHECK(visibility<>'private' OR NOT cover_is_public);
