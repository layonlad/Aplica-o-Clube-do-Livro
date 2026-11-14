-- A cover can only reference a photo attached to this same private album.
ALTER TABLE club_albums ADD COLUMN cover_media_id uuid;
ALTER TABLE club_albums ADD CONSTRAINT album_cover_photo
  FOREIGN KEY(id,cover_media_id) REFERENCES album_media(album_id,media_id);
