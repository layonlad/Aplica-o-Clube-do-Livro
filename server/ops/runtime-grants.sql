-- Review and execute as an owner with grant options, only after migrations.
-- No role creation, credentials, DDL privileges or blanket grants for future tables.
BEGIN;
-- Reconcile legacy default CRUD grants before restoring the tested matrix.
REVOKE ALL ON follow_requests FROM clube_runtime;
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON photo_uploads,comment_media,comment_mentions,push_subscriptions,push_deliveries,club_post_notices,album_media,album_participant_tags,audit_logs,club_albums,club_book_files,club_events,club_join_requests,club_memberships,club_reading_states,club_settings,club_workspaces,clubs,comment_likes,event_attendees,event_legacy_checkpoints,follows,forum_legacy_checkpoints,forum_replies,forum_reply_media,forum_topic_likes,forum_topic_media,forum_topics,invite_acceptances,invites,media_objects,moderation_actions,notification_settings,notifications,personal_workspaces,post_comments,post_likes,post_media,post_mentions,post_poll_options,post_poll_votes,post_tags,private_book_files,profiles,reports,saved_posts,social_posts,user_blocks,users FROM clube_runtime;
REVOKE ALL ON SEQUENCE audit_logs_id_seq FROM clube_runtime;
-- Run as the migration owner: future tables and sequences require explicit grants.
DO $$ BEGIN
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM clube_runtime',current_schema());
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM clube_runtime',current_schema());
END $$;
DO $$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO clube_runtime',current_schema()); END $$;
GRANT SELECT,INSERT,UPDATE ON photo_uploads,push_subscriptions,push_deliveries,club_post_notices,users,clubs,club_memberships,invites,personal_workspaces,club_workspaces,club_reading_states,club_settings,club_join_requests,social_posts,post_comments,post_poll_votes,media_objects,club_albums,album_participant_tags,private_book_files,forum_topics,forum_replies,forum_legacy_checkpoints,profiles,reports,notification_settings,notifications,club_events,event_attendees,event_legacy_checkpoints,club_book_files TO clube_runtime;
GRANT SELECT,INSERT ON comment_media,comment_mentions,invite_acceptances,audit_logs,post_poll_options,post_media,album_media,forum_topic_media,forum_reply_media,moderation_actions TO clube_runtime;
GRANT SELECT,INSERT,DELETE ON post_likes,saved_posts,comment_likes,post_tags,post_mentions,forum_topic_likes,follows,user_blocks TO clube_runtime;
GRANT DELETE ON photo_uploads,comment_media,comment_mentions,push_subscriptions,push_deliveries,club_post_notices,post_media,album_media,album_participant_tags,forum_topic_media,forum_reply_media,notifications TO clube_runtime;
-- GRANT is additive: remove CRUD privileges left by the initial deployment.
REVOKE DELETE,TRUNCATE ON users,clubs,club_memberships,invites,invite_acceptances,personal_workspaces,club_workspaces,club_reading_states FROM clube_runtime;
REVOKE UPDATE ON invite_acceptances FROM clube_runtime;
GRANT USAGE ON SEQUENCE audit_logs_id_seq TO clube_runtime;
GRANT EXECUTE ON FUNCTION emit_notification(uuid,uuid,uuid,text,text,uuid,uuid,text,text) TO clube_runtime;
GRANT EXECUTE ON FUNCTION notification_club_has_book(uuid,uuid) TO clube_runtime;
REVOKE ALL ON schema_migrations FROM clube_runtime;
REVOKE UPDATE,DELETE,TRUNCATE ON audit_logs,moderation_actions FROM clube_runtime;
GRANT SELECT,INSERT,UPDATE ON follow_requests TO clube_runtime;
REVOKE ALL ON external_reading_progress,imported_reading_annotations,reading_export_attempts FROM clube_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON external_reading_progress,imported_reading_annotations,reading_export_attempts TO clube_runtime;
REVOKE ALL ON literary_news,literary_news_sync,literary_follows FROM clube_runtime;
GRANT SELECT,INSERT ON literary_news TO clube_runtime;
GRANT SELECT,INSERT,UPDATE ON literary_news_sync TO clube_runtime;
GRANT SELECT,INSERT,DELETE ON literary_follows TO clube_runtime;
REVOKE ALL ON chat_messages,chat_members,chat_settings,chat_reports,chat_reactions FROM clube_runtime;
GRANT DELETE ON chat_messages TO clube_runtime;
GRANT SELECT,INSERT,UPDATE ON chat_settings,chat_members,chat_messages TO clube_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON chat_reactions TO clube_runtime;
GRANT SELECT,INSERT ON chat_reports TO clube_runtime;
REVOKE ALL ON notification_events,community_highlights FROM clube_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON notification_events TO clube_runtime;
GRANT SELECT,INSERT ON community_highlights TO clube_runtime;
COMMIT;
