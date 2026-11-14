-- Review and execute as an owner with grant options, only after migrations.
-- No role creation, credentials, DDL privileges or blanket grants for future tables.
BEGIN;
DO $$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO clube_runtime',current_schema()); END $$;
GRANT SELECT,INSERT,UPDATE ON users,clubs,club_memberships,invites,personal_workspaces,club_workspaces,club_reading_states,club_settings,club_join_requests,social_posts,post_comments,post_poll_votes,media_objects,club_albums,album_participant_tags,private_book_files,forum_topics,forum_replies,forum_legacy_checkpoints,profiles,reports,notification_settings,notifications,club_events,event_attendees,event_legacy_checkpoints,club_book_files TO clube_runtime;
GRANT SELECT,INSERT ON invite_acceptances,audit_logs,post_poll_options,post_media,album_media,forum_topic_media,forum_reply_media,moderation_actions TO clube_runtime;
GRANT SELECT,INSERT,DELETE ON post_likes,saved_posts,comment_likes,post_tags,post_mentions,forum_topic_likes,follows,user_blocks TO clube_runtime;
GRANT DELETE ON post_media,album_media,album_participant_tags,forum_topic_media,forum_reply_media,notifications TO clube_runtime;
GRANT USAGE ON SEQUENCE audit_logs_id_seq TO clube_runtime;
GRANT EXECUTE ON FUNCTION emit_notification(uuid,uuid,uuid,text,text,uuid,uuid,text,text) TO clube_runtime;
REVOKE ALL ON schema_migrations FROM clube_runtime;
REVOKE UPDATE,DELETE,TRUNCATE ON audit_logs,moderation_actions FROM clube_runtime;
COMMIT;
