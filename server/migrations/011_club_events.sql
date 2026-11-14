ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check CHECK(kind IN ('like','comment','reply','mention','follow','invitation','join_request','join_approved','topic','event','event_reminder','reading','book'));
ALTER TABLE notifications DROP CONSTRAINT notifications_check;
ALTER TABLE notifications ADD CONSTRAINT notification_actor CHECK(recipient_id<>actor_id OR kind='event_reminder');
CREATE TABLE club_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id uuid NOT NULL REFERENCES clubs(id),created_by uuid NOT NULL REFERENCES users(id),
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 150),starts_at timestamptz NOT NULL,location text NOT NULL DEFAULT '' CHECK(char_length(location)<=200),description text NOT NULL DEFAULT '' CHECK(char_length(description)<=2000),
 book_id uuid,book_title text NOT NULL DEFAULT '' CHECK(char_length(book_title)<=150),topic_id uuid,
 legacy_photos jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(legacy_photos)='array' AND jsonb_array_length(legacy_photos)<=8),
 version integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,
 UNIQUE(id,club_id),FOREIGN KEY(topic_id,club_id) REFERENCES forum_topics(id,club_id),FOREIGN KEY(club_id,created_by) REFERENCES club_memberships(club_id,user_id)
);
CREATE INDEX club_event_calendar ON club_events(club_id,starts_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE TABLE event_attendees (
 event_id uuid NOT NULL,club_id uuid NOT NULL,user_id uuid NOT NULL,
 rsvp text NOT NULL DEFAULT 'maybe' CHECK(rsvp IN ('yes','maybe','no')),attended boolean,recorded_by uuid REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(event_id,user_id),
 FOREIGN KEY(event_id,club_id) REFERENCES club_events(id,club_id),FOREIGN KEY(club_id,user_id) REFERENCES club_memberships(club_id,user_id)
);
INSERT INTO club_events(id,club_id,created_by,title,starts_at,location,description,legacy_photos)
 SELECT (e->>'id')::uuid,w.club_id,(e->>'createdBy')::uuid,e->>'title',(e->>'date')::timestamptz,COALESCE(e->>'location',''),COALESCE(e->>'description',''),COALESCE(e->'photos','[]') FROM club_workspaces w CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w.state->'events','[]')) e;
INSERT INTO event_attendees(event_id,club_id,user_id,rsvp)
 SELECT (e->>'id')::uuid,w.club_id,r.key::uuid,r.value FROM club_workspaces w CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w.state->'events','[]')) e CROSS JOIN LATERAL jsonb_each_text(COALESCE(e->'rsvps','{}')) r;
-- An album may refer to a previously removed legacy event. Preserve the relation as an archived shell.
INSERT INTO club_events(id,club_id,created_by,title,starts_at,deleted_at)
 SELECT DISTINCT ON(a.event_id) a.event_id,a.club_id,a.created_by,'Encontro arquivado',a.event_date::timestamptz,now() FROM club_albums a WHERE a.event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM club_events e WHERE e.id=a.event_id);
ALTER TABLE club_albums ADD CONSTRAINT album_event_scope FOREIGN KEY(event_id,club_id) REFERENCES club_events(id,club_id);
CREATE TABLE event_legacy_checkpoints (club_id uuid PRIMARY KEY REFERENCES clubs(id),events jsonb NOT NULL);
INSERT INTO event_legacy_checkpoints SELECT club_id,COALESCE(state->'events','[]') FROM club_workspaces;
CREATE FUNCTION notify_event_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recipient uuid;
BEGIN
 IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.title IS DISTINCT FROM OLD.title THEN
 FOR recipient IN SELECT user_id FROM club_memberships WHERE club_id=NEW.club_id AND status='active' LOOP
 PERFORM emit_notification(recipient,NEW.created_by,NEW.club_id,'event','event',NEW.id,NULL,'events','event:'||NEW.id||':'||NEW.version);
 END LOOP;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER notify_event AFTER INSERT OR UPDATE ON club_events FOR EACH ROW EXECUTE FUNCTION notify_event_change();
